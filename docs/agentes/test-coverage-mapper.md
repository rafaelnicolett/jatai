<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @test-coverage-mapper

> Discovery: diagnostica o estado dos testes, onde falta cobertura e o que precisa de characterization tests antes de qualquer refactor.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1h-test-coverage` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/test-coverage-mapper.agent.md` |

## O que faz

Discovery: diagnostica o estado dos testes, onde falta cobertura e o que precisa de characterization tests antes de qualquer refactor.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.
- [`characterization-testing`](skills.md#characterization-testing): Testes de caracterização (Michael Feathers — Working Effectively with Legacy Code) — pinam o comportamento atual do sistema, mesmo se estiver errado, antes de qualquer refactor.

## O que recebe

- `**/*test*`
- `**/*spec*`
- `**/__tests__/**`
- `**/test/**`
- `**/tests/**`
- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/test-coverage/coverage-gaps.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Inventário de frameworks de teste em uso (unit/integration/e2e por linguagem)
- Cobertura estimada por módulo (heurística: arquivos com .test vs. sem)
- Top 10 módulos críticos sem cobertura (alta complexidade × zero testes)
- Gaps por nível da pirâmide (unit / integration / e2e / contract)
- Flakiness suspeita (testes com sleep, retry, ignore)
- Recomendação de tests a backfillar antes de qualquer refactor

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/, .venv/), nem cache. Se precisar compilar, copie para o scratchpad.
- Não escrever testes — apenas mapear gaps (test-backfill-agent faz isso na execução)
- Distinguir "sem teste" de "teste fraco"

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
