---
id: coding-guidelines
name: coding-guidelines
type: skill
description: >
  Índice de diretrizes de código do kit. Mapeia (stack, arch) → [lang-*, arch-*].
  Contém também princípios universais transversais (naming, error model, observabilidade,
  segurança). Consumida por @reviewer e @arch-cross como guia de revisão cross-stack.
applicable_to:
  - "@reviewer"
  - "@arch-cross"
---

# Skill: coding-guidelines

> **Índice e roteador** de skills de código do kit.
>
> Para cada projeto, o wizard seleciona duas dimensões ortogonais:
> - **Stack** (`backendStack` / `frontendStack`) → carrega a skill `lang-*` correspondente
> - **Arquitetura** (`backendArchitecture` / `frontendArchitecture`) → carrega a skill `arch-*` correspondente
>
> Esta skill contém os **princípios universais** transversais e o **mapa de roteamento**.

---

## 0. Mapa de roteamento (stack × arch → skills)

> Agentes e revisores: leia `{{brand.files.config}}` para identificar stack e arquitetura.
> Carregue o par `[lang-X, arch-Y]` correspondente ANTES de aplicar as seções abaixo.

### Backend

| Stack (wizard) | Skill de linguagem | Arquiteturas disponíveis | Skills de arq. |
|---|---|---|---|
| `python-api` | `lang-python-api` | hexagonal, layered, ddd-tactical, vertical-slice | `arch-hexagonal`, `arch-layered`, `arch-ddd-tactical`, `arch-vertical-slice` |
| `python-agentic` | `lang-python-agentic` | hexagonal, layered, ddd-tactical | `arch-hexagonal`, `arch-layered`, `arch-ddd-tactical` |
| `java-spring` | `lang-java-spring` | hexagonal, layered, ddd-tactical | `arch-hexagonal`, `arch-layered`, `arch-ddd-tactical` |
| `dotnet-core` | `lang-dotnet` | hexagonal, vertical-slice, layered, ddd-tactical | `arch-hexagonal`, `arch-vertical-slice`, `arch-layered`, `arch-ddd-tactical` |

### Frontend

| Stack (wizard) | Skill de linguagem | Arquiteturas disponíveis | Skills de arq. |
|---|---|---|---|
| `react-vite` | `lang-react` | feature-based, clean-frontend | `arch-feature-based`, `arch-clean-frontend` |
| `flutter` | `lang-flutter` | clean-frontend, feature-based, mvvm | `arch-clean-frontend`, `arch-feature-based`, `arch-mvvm` |
| `android-compose` | `lang-android` | mvvm, clean-frontend, mvc | `arch-mvvm`, `arch-clean-frontend`, `arch-mvc` |
| `ios-swiftui` | `lang-ios` | mvvm, clean-frontend, mvc | `arch-mvvm`, `arch-clean-frontend`, `arch-mvc` |

### Exemplo de composição
```yaml
# {{brand.files.config}}
stacks:
  backend: python-api
  frontend: react-vite
  backendArchitecture: hexagonal
  frontendArchitecture: feature-based

# Agente carrega:
# uses_skills: [lang-python-api, arch-hexagonal, openapi-governance, qa-strategy]
# uses_skills: [lang-react, arch-feature-based, ui-ux-design-system, qa-strategy]
```

---

---

## 1. Princípios universais (todas as stacks)

### 1.1 Arquitetura
> O padrão arquitetural é definido no wizard. Consulte a skill `arch-*` selecionada.
> Os princípios abaixo valem para qualquer padrão arquitetural.

- **Separação de responsabilidades**: cada módulo tem um propósito único.
- **Inversão de dependência**: código de negócio não depende de detalhes de infraestrutura.
- **Composition Root** único por app (DI explícita; sem service locator escondido).
- Sem "lógica de negócio" em controllers/handlers, routers, adapters de entrada.
- Sem chamada a banco/API diretamente em lógica de domínio (passa pela interface de porta).

### 1.2 Nomes
- Em **UL do domínio** (ver [domain-driven-design](../domain-driven-design/SKILL.md)).
- Sem sufixos vazios: `OrderManager`, `OrderHelper`, `OrderUtil` ❌.
- Booleans: `is/has/can/should`. Métodos void que mudam estado: imperativo (`apply`, `cancel`).
- Sigla: trate como palavra (`HttpClient`, não `HTTPClient`).
- Pacotes/módulos por **feature**, não por camada técnica:
  ```
  ✅ checkout/{domain,application,adapters}
  ❌ controllers/, services/, repositories/, models/
  ```

### 1.3 Funções e classes
- Função pequena (≤ ~30 linhas) com 1 propósito.
- Argumentos: ≤ 4. Mais que isso → objeto de parâmetros.
- Sem flags booleanas que mudam comportamento (split em 2 funções).
- Nada de `if isinstance / instanceof` para dispatch — use polimorfismo.
- Imutabilidade por padrão; mutação só onde justificada.

### 1.4 Error model (cross-stack)
**Erros de domínio ≠ erros técnicos.**

| Categoria | Origem | Tratamento |
|---|---|---|
| `DomainError` | invariante violada | retorna 4xx/422 com código de domínio |
| `ValidationError` | input malformado | 400 com detalhes por campo |
| `NotFound` | recurso inexistente | 404 |
| `Conflict` | concorrência/duplicata | 409 |
| `AuthError` | auth/autz | 401/403 |
| `ExternalError` | dependência externa | 502/503 + retry policy |
| `UnexpectedError` | bug | 500 + alerta + trace ID |

**Envelope HTTP único** (alinhado com [openapi-governance](../openapi-governance/SKILL.md)):
```json
{
  "code": "DOMAIN.PEDIDO.CUPOM_EXPIRADO",
  "message": "Cupom expirado",
  "details": [{"field": "cupom", "issue": "expirado"}],
  "traceId": "..."
}
```

### 1.5 Observabilidade (OTel obrigatório)
- 1 span por entrada de adapter (HTTP/queue/cron).
- Span por chamada externa (DB, HTTP, LLM).
- Atributos: `tenant.id`, `user.id` (ofuscado), `feature`, `command`.
- Logs estruturados (JSON), com `trace_id` propagado.
- Métricas RED (Rate, Errors, Duration) por endpoint/handler.

### 1.6 Async / concorrência
- Sem `Thread.sleep`/`time.sleep` em produção.
- Toda IO assíncrona quando o runtime suportar.
- Cancelamento propagado (CancellationToken / context / AbortSignal).
- Backpressure explícito em filas/streams.
- Idempotência em handlers de evento (chave de idempotência).

### 1.7 Segurança baseline
- Zero secret no repo (gitleaks no pre-commit).
- Input validado **na borda** (HTTP/CLI/event).
- Output encodado por contexto (HTML/SQL/Shell).
- Auth: JWT/OIDC validado em adapter dedicado.
- Sem SQL string-concat (parametrize sempre).
- Logs **sem PII** sem mascaramento.

### 1.8 Testes co-localizados
- Estrutura espelhada: `src/x/y.py` ↔ `tests/x/y_test.py`.
- Co-localização (`__test__/`) aceita em frontend.
- Cobertura por classificação (ver [qa-strategy](../qa-strategy/SKILL.md)).
- Sem mock no `domain`.

### 1.9 Documentação
- Sem comentário óbvio. Comentário é **porquê**, não o quê.
- Código de domínio é doc viva. Se precisa de muito comentário, refatore.
- ADR para decisões arquiteturais (1 ADR = 1 decisão).
- README de módulo só se houver setup local específico.

### 1.10 Anti-padrões universais
- ❌ Anemic Domain Model (ver `domain-driven-design`)
- ❌ God class / God service
- ❌ Singleton mutável global
- ❌ Reflection/metaprogramming sem necessidade
- ❌ Dependência circular entre módulos
- ❌ TODO sem ticket
- ❌ Branch por mais de N dias sem rebase

---

## 2. Por stack — o que importa de fato

### 2.1 Java + Spring Boot 3+ / Java 21
- `record` para DTO/VO.
- `sealed` interfaces para union types do domínio.
- Lombok **só** `@Getter`/`@Builder`/`@RequiredArgsConstructor`. Nada de `@Data`.
- DI por construtor. Nunca `@Autowired` em campo.
- Web: Spring Web (sync) ou WebFlux (reactive) — **escolha 1 por serviço**.
- Test: JUnit 5 + AssertJ + Testcontainers + WireMock.
- Build: Maven/Gradle com toolchains; sem dependência sem versão fixada via BOM.
- `application.yml` por profile; secrets via env.

### 2.2 .NET 8+
- `record` para DTO/VO; `init` para imutabilidade.
- Nullable reference types **ON** em todo projeto.
- `async/await` end-to-end; sem `.Result`/`.Wait()`.
- DI built-in; sem service locator.
- `MediatR` opcional para CQRS; FluentValidation na borda.
- Test: xUnit + FluentAssertions + Testcontainers (.NET).

### 2.3 Python (FastAPI / API)
- Python 3.12+. `pyproject.toml`. `uv` ou `pip-tools`.
- **Type hints estritos** + `mypy --strict` (ou `pyright strict`).
- Pydantic v2 **na borda** (DTO HTTP), `dataclass` no domínio.
- `ruff` (lint+format), `pytest` (+ `pytest-asyncio`, `pytest-bdd`).
- FastAPI: dependency injection por `Depends`; routers por feature.
- Async-first; sync só em CPU-bound dentro de `to_thread`.

### 2.4 Python Agentic
Ver [ai-agent-author](../ai-agent-author/SKILL.md). Adicional aqui:
- Provider-agnostic LLM router obrigatório.
- Prompts em `.md` versionados; nunca string in-line.
- `LangGraph` ou `PydanticAI` — escolha 1 por serviço.
- Eval harness rodando no CI.

### 2.5 React + Vite + TypeScript
- TS `strict: true` + `noUncheckedIndexedAccess: true`.
- Estrutura **feature-sliced** (`src/features/<feature>/{ui,model,api,lib}`).
- Server-state: TanStack Query. Client-state: Zustand/Jotai.
- Forms: React Hook Form + Zod.
- Sem `any`. Sem `enum` (use union).
- Estilos: Tailwind ou CSS Modules — 1 por projeto.
- Test: Vitest + RTL; E2E Playwright.

### 2.6 Flutter
- Dart 3+. Null-safety obrigatório.
- State: Riverpod **ou** BLoC — 1 por app.
- `freezed` para sealed/union/imutabilidade.
- Pasta por feature; sem "screens/widgets/models" globais.
- Test: `flutter_test` + `mocktail`; golden tests para UI crítica.

### 2.7 Android (Kotlin + Compose)
- MVVM + UDF (Unidirectional Data Flow).
- Hilt para DI; Coroutines + Flow.
- Compose-only para novas telas.
- Sem `findViewById`. Sem `runBlocking` fora de teste.
- Test: JUnit + MockK + Compose UI Test.

### 2.8 iOS (Swift + SwiftUI)
- Swift 5.9+. Strict concurrency ON.
- MVVM com `ObservableObject`/`@Observable` + Combine ou `async/await`.
- Sem singleton mutável; DI por inicializador.
- Test: XCTest + ViewInspector; UI test com XCUITest.

---

## 3. Rubricas de revisão (`@reviewer` aplica)

- [ ] Direção de dependência respeitada (domain puro)
- [ ] Nomes em UL; sem sufixos vazios
- [ ] Funções pequenas, sem flags, sem dispatch por type
- [ ] Erros classificados conforme tabela; envelope respeitado
- [ ] OTel: span no entry-point e em chamadas externas
- [ ] Sem secret; sem PII em log; input validado na borda
- [ ] Cobertura por classificação respeitada
- [ ] Sem `TODO`/`FIXME` órfão
- [ ] Sem dependência circular
- [ ] Lint/format verde
- [ ] Conventional Commits no PR

## 4. Rubricas cross-stack (`@arch-cross` aplica no gate)

- [ ] Mesmo error envelope em **todos** os backends da release
- [ ] Headers (`X-Request-Id`, `X-Trace-Id`) presentes ponta a ponta
- [ ] Auth uniforme entre serviços
- [ ] Versionamento de API consistente (semver via `/v1/`, `/v2/`)
- [ ] OTel: trace ponta a ponta visível no backend de obs
- [ ] Frontends consomem **SDK gerado**, não chamadas raw
- [ ] Naming de domínio idêntico em backend e frontend

---

## 5. Pirâmide de Testes — por camada e stack

A pirâmide define **onde** e **quanto** testar. O objetivo não é % de linha,
mas ter confiança em cada camada de forma independente.

```
            ▲  E2E / UI  (≤10%)
           ╱ ╲ Playwright, XCUITest, Flutter integration
          ╱───╲
         / Contr ╲  (≈15%) Pact, schema, OpenAPI conformance
        ╱─────────╲
       /  Integração ╲ (≈25%) Testcontainers, real DB/queue
      ╱───────────────╲
     /     Unitário     ╲ (≥50%) Domínio puro, sem framework, sem IO
    ╱─────────────────────╲
```

### 5.1 Testes unitários (≥50% dos testes)
- Testam **regras de domínio** e **use cases** sem mocks de infraestrutura.
- Não devem importar FastAPI, Spring, .NET DI, React, etc.
- Não devem acessar rede, banco ou sistema de arquivos.
- Rápidos: bateria completa < 30s.

```python
# ✅ Unitário puro — testa regra de domínio
def test_pedido_nao_aceita_cupom_expirado():
    cupom = Cupom(codigo="XYZ", validade=date(2023, 1, 1))
    pedido = Pedido(items=[...])
    with pytest.raises(CupomExpiradoError):
        pedido.aplicar_cupom(cupom, hoje=date(2024, 1, 1))

# ❌ Unitário ruim — testa framework
def test_post_retorna_422():
    response = client.post("/pedidos", json={...})  # usa FastAPI TestClient
    assert response.status_code == 422
```

### 5.2 Testes de integração (≈25%)
- Testam adapters com infraestrutura **real** (via Testcontainers ou Docker).
- Nunca use mocks para banco de dados ou filas em testes de integração.
- Um teste de integração por porta de saída (RepositoryPort, EventPublisherPort, etc.).

```python
# ✅ Integração com Testcontainers
@pytest.fixture(scope="session")
def postgres_url():
    with PostgresContainer("postgres:16") as pg:
        yield pg.get_connection_url()

def test_pedido_repository_persiste_e_recupera(postgres_url):
    repo = PostgresPedidoRepository(postgres_url)
    pedido = Pedido.novo(cliente_id="cl-1", items=[...])
    repo.salvar(pedido)
    recuperado = repo.buscar(pedido.id)
    assert recuperado == pedido
```

### 5.3 Testes de contrato (≈15%)
- Validam que o request/response da API está conforme o `api/openapi.yaml`.
- Para frontends: validam que o SDK gerado é compatível com o schema do backend.
- Ferramentas: `schemathesis`, `pact`, `openapi-python-client`.

```bash
# Validar conformidade com OpenAPI (schemathesis)
schemathesis run api/openapi.yaml --url http://localhost:8000 --checks all
```

### 5.4 Testes E2E / UI (≤10%)
- Cobrem apenas **jornadas críticas** do ponto de vista do usuário.
- Não são substitutos para os outros níveis.
- Devem rodar em pipeline dedicado (lento, com retry).

**Por stack:**
| Stack | Unitário | Integração | Contrato | E2E |
|---|---|---|---|---|
| Python API | pytest puro | pytest+testcontainers | schemathesis | n/a |
| Java Spring | JUnit 5 | Testcontainers | Spring Contract / Pact | n/a |
| .NET | xUnit | Testcontainers (.NET) | Pact | n/a |
| React | Vitest + RTL | MSW para HTTP mocks | OpenAPI contract tests | Playwright |
| Flutter | flutter_test | integration_test | contract test | Flutter drive |

---

## 6. Enforcement da Arquitetura Hexagonal

### 6.1 Mapeamento de camadas

| Camada | Permite | Proibido |
|---|---|---|
| `domain/` | Entidades, VOs, Agregados, Domain Events, Ports (interfaces), Domain Services | Import de framework, IO, HTTP, DB, config, logging externo |
| `application/` | Use Cases / Command Handlers, DTO de app, Serviços de app | Import de framework web (FastAPI, Spring MVC, etc.), IO direto |
| `adapters/in/` | Controllers HTTP, Consumers de evento/fila, CLI entrypoints | Import de `domain` apenas via `application` use cases |
| `adapters/out/` | Implementações de Repository, HTTP clients, Event publishers | Import de `domain` apenas via ports definidos |
| `main/` | Composition Root, configuração, DI | Lógica de negócio |

### 6.2 Teste de pureza do domínio
Execute antes de considerar o backend pronto:

```bash
# Python: verificar que domain/ não importa pacotes de infra
grep -r "^from fastapi\|^import fastapi\|^from sqlalchemy\|^import sqlalchemy\|^from redis" src/domain/ && echo "FALHOU: domain impuro" || echo "OK: domain puro"

# Java: verificar com ArchUnit
@ArchTest
ArchRule domainShouldNotDependOnAdapters = noClasses()
    .that().resideInAPackage("..domain..")
    .should().dependOnClassesThat()
    .resideInAnyPackage("..adapters..", "..infrastructure..");
```

### 6.3 Estrutura de diretórios esperada (Python API)

```
code/services/<service>/
├── src/
│   ├── <service>/
│   │   ├── domain/
│   │   │   ├── <aggregate>/      # Entidade raiz + VOs + Domain Events
│   │   │   │   ├── <aggregate>.py
│   │   │   │   ├── value_objects.py
│   │   │   │   └── events.py
│   │   │   └── ports/            # Interfaces (Repository, Service, Publisher)
│   │   │       └── <port>.py
│   │   ├── application/
│   │   │   ├── use_cases/        # Um arquivo por use case
│   │   │   └── dto.py            # DTOs de aplicação (não Pydantic HTTP)
│   │   ├── adapters/
│   │   │   ├── in/
│   │   │   │   ├── http/         # FastAPI routers
│   │   │   │   └── events/       # Kafka/SQS consumers
│   │   │   └── out/
│   │   │       ├── db/           # SQLAlchemy repositories
│   │   │       └── http/         # HTTP clients para APIs externas
│   │   └── main.py               # Composition Root + DI
├── tests/
│   ├── unit/                     # Espelho de src/ — sem framework
│   ├── integration/              # Testcontainers
│   └── contract/                 # Schemathesis / Pact
└── pyproject.toml
```

### 6.4 Estrutura de diretórios esperada (Java Spring)

```
code/services/<service>/
├── src/main/java/<pkg>/
│   ├── domain/
│   │   ├── <aggregate>/
│   │   │   ├── <Aggregate>.java         # Aggregate Root (record / class)
│   │   │   ├── <ValueObject>.java       # record
│   │   │   └── <DomainEvent>.java       # record
│   │   └── ports/
│   │       ├── in/                      # Use case interfaces (driving)
│   │       └── out/                     # Repository/service interfaces (driven)
│   ├── application/
│   │   └── <UseCase>Handler.java        # Implements port.in, calls port.out
│   ├── adapters/
│   │   ├── in/web/                      # @RestController — chama application
│   │   └── out/persistence/             # JPA/JDBC implementations of port.out
│   └── infrastructure/
│       └── config/                      # Spring @Configuration, Beans
├── src/test/java/<pkg>/
│   ├── unit/                            # JUnit 5, sem Spring context
│   ├── integration/                     # @SpringBootTest + Testcontainers
│   └── contract/                        # Spring Cloud Contract / Pact
└── pom.xml
```

---

## 7. Architecture Fitness Functions

Fitness functions são verificações automáticas que garantem que o código ainda
respeita as decisões arquiteturais. Devem rodar no CI.

### 7.1 Fitness functions essenciais (todos os backends)

| Verificação | Ferramenta | Critério de falha |
|---|---|---|
| Domain puro | custom script / ArchUnit | domain/ importa framework |
| Sem dependência circular | madge (JS), deptry (Python), JDepend (Java) | ciclo detectado |
| Cobertura de domínio | pytest-cov / JaCoCo | < 80% em domain/ |
| OpenAPI conformance | schemathesis | endpoint não implementado ou response diferente |
| CVE scan | safety (Python) / trivy (Java) / snyk (.NET) | CVE crítico ou alto |
| Lint zero warnings | ruff / eslint / checkstyle | warning não-zero |

### 7.2 Exemplo de CI job fitness (Python)

```yaml
# .github/workflows/fitness.yml
- name: Domain purity check
  run: |
    ! grep -rn "^from fastapi\|^import fastapi\|^from sqlalchemy" src/*/domain/

- name: Circular dependency check
  run: deptry src/ --known-first-party myservice

- name: Coverage gate
  run: pytest --cov=src/domain --cov-fail-under=80

- name: OpenAPI conformance
  run: schemathesis run api/openapi.yaml --url $TEST_URL --checks all

- name: CVE scan
  run: safety check --full-report
```
