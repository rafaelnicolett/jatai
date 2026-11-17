---
id: qa-strategy
name: qa-strategy
type: skill
description: Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing. Consumida por @qa-tester, @quality, @reviewer.
applicable_to:
  - "@qa-tester"
  - "@quality"
  - "@reviewer"
  - "@integration-tests"
---

# Skill: qa-strategy

> Cobertura ≠ qualidade. Esta skill define **quais testes**, **em qual
> camada**, **com qual critério de pass/fail**, e **quando rodar**.

## 1. Pirâmide canônica do kit

```
            ▲  E2E (5–10%)        @qa-tester (UI) + @integration-tests
          ▲ ▲  Integration (15–25%) @integration-tests + @backend-* / @frontend-*
        ▲ ▲ ▲  Component/Contract (10–15%) @backend-* / @frontend-*
      ▲ ▲ ▲ ▲  Unit (50–70%)      @backend-* / @frontend-*
```

**Regra**: se um teste de camada superior cobre o mesmo path que um de
camada inferior, **mantenha o de baixo** e remova o de cima (rápido > lento).

## 2. Tipos de teste — quando, quem, com o quê

| Tipo | Quem escreve | Stack tools | Quando roda |
|---|---|---|---|
| **Unit** | `@backend-*`, `@frontend-*` | pytest / JUnit / xUnit / Vitest / XCTest / kotest | A cada commit; gate pre-merge |
| **Component (front)** | `@frontend-*` | RTL, @testing-library, golden tests | A cada commit |
| **Contract (consumer)** | `@frontend-*` | Pact, Schemathesis | Pre-merge |
| **Contract (provider)** | `@backend-*` | Pact verifier, Schemathesis vs OpenAPI | Pre-merge |
| **Integration (backend)** | `@backend-*` + `@integration-tests` | Testcontainers + DB/Kafka real | Pre-merge |
| **API (E2E backend)** | `@integration-tests` | httpx / RestAssured / Karate | Pre-merge + pós-deploy stg |
| **E2E (UI)** | `@qa-tester` | Playwright / Detox / Espresso / XCUITest | Pós-deploy stg + nightly |
| **Smoke (prod-like)** | `@qa-tester` | subset E2E `@smoke` | Pós-deploy prd |
| **Mutation** | `@quality` | Stryker / mutmut / PIT | Nightly em módulos `core` |
| **Performance** | `@observability` | k6 / Gatling / Locust | Pré-release |
| **Security** | `@security` | ZAP / Semgrep / Trivy | Pré-merge + nightly |
| **Acessibilidade** | `@frontend-*` | axe-core / Lighthouse | Pré-merge front |

## 3. Cobertura — política única

Não usamos % global ingênua. Usamos **cobertura por classificação**:

| Módulo | Threshold mínimo | Mutation score mínimo |
|---|---|---|
| `core domain` (agregados, eventos, policies) | **90% line + 100% branch nas invariantes** | **75%** |
| `application` (use cases, ports) | 85% line | 60% |
| `adapters` (HTTP, DB, queue) | 70% line | — |
| `infra/glue` | 50% line | — |
| `generated code` (SDK, mappers) | excluído | — |

`@quality` enforça via `quality-gate` no CI. PR que reduz cobertura no
**core** falha sem exceção.

## 4. Seleção dinâmica (test impact)

PR só roda o que importa:

| Trigger | Suite |
|---|---|
| PR pequeno (<100 LOC, sem mudar contrato) | unit + component + contract impactados |
| Mudou `api/openapi.yaml` | + contract (provider+consumer) full |
| Mudou `code/services/<svc>/` | + integration daquele serviço |
| Mudou `features/**` | + cenários daquela feature |
| Label `run:full` ou diff > 500 LOC | full pipeline |
| Pré-release | full + performance + security + mutation |

Implementação: tags de teste + matriz por path (`paths-filter` no GH Actions).

## 5. Flakiness — política

1. Teste com falha intermitente → marcar `@flaky` + abrir issue (auto).
2. Quarentena: rodar fora do gate, máximo **7 dias**.
3. Após 7 dias: corrigir ou deletar (não tem "ignore eterno").
4. `@quality` reporta no gate G2 quantos `@flaky` existem; >5 falha o gate.

## 6. Test data

- Builders/Factories no domínio (não usar fixtures gigantes).
- Reset de DB entre testes via Testcontainers + truncate, **nunca** mock global.
- Dados de produção **nunca** entram no repo.

## 7. Rubricas de gate (usadas por @quality)

### Gate pre-merge (`@reviewer` + `@quality` + `@security`)
- [ ] Unit + component + contract impactados verdes
- [ ] Cobertura por classificação respeitada
- [ ] `@security` sem CVE crítico, sem secret
- [ ] Sem novos `@flaky` introduzidos
- [ ] Mutation score do core não regrediu

### Gate G2 (Downstream → Operation, com `@stream-align` + `@arch-cross`)
- [ ] Suite full verde em ambiente stg
- [ ] E2E `@release:<id>` 100% passando
- [ ] Performance dentro do orçamento
- [ ] Security scan pós-build verde
- [ ] Quarentena `@flaky` ≤ 5

## 8. Anti-padrões

- ❌ "100% de cobertura" como meta única
- ❌ Mock no domain layer
- ❌ E2E para validar regra de negócio (use unit + BDD)
- ❌ Teste depende de ordem de execução
- ❌ Teste depende de DB compartilhado
- ❌ `Thread.sleep`/`time.sleep` (use waits explícitos)
- ❌ Snapshot test sem revisão (vira commit-and-pray)
- ❌ Skip indefinido sem ticket vinculado
- ❌ Lógica de teste "em comum" virando framework caseiro complexo
