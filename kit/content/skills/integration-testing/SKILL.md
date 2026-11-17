---
id: integration-testing
name: integration-testing
type: skill
description: Padrão profundo de testes integrados — Testcontainers para infra real, contract testing entre serviços (Pact + OpenAPI), E2E API/UI, ambiente isolado por PR, observabilidade dos próprios testes. Consumida por @integration-tests e @backend-*.
applicable_to:
  - "@integration-tests"
  - "@backend-* (testes integrados do próprio serviço)"
  - "@arch-cross (rubricas de contract no gate)"
---

# Skill: integration-testing

> Integração que **não usa o real (ou um real-like)** mente. Mocks no
> boundary cobrem só o feliz. Aqui usamos **infra real efêmera** + **contracts
> explícitos** + **E2E só no que importa**.

## 1. Camadas

```
┌──────────────────────────────────────┐
│ E2E (UI/API ponta a ponta em stg)    │  @qa-tester / @integration-tests
├──────────────────────────────────────┤
│ Service Integration (1 svc + infra)  │  @backend-* + Testcontainers
├──────────────────────────────────────┤
│ Contract (entre N svc / svc↔front)   │  Pact + Schemathesis vs OpenAPI
└──────────────────────────────────────┘
```

## 2. Service Integration — Testcontainers

Cada serviço tem `tests/integration/` que sobe **infra real efêmera**:

| Stack | Lib | Exemplos |
|---|---|---|
| Python | `testcontainers-python` + pytest | Postgres, Kafka, Redis, GCS=fake-gcs-server |
| Java/Kotlin | `org.testcontainers` + JUnit5 | mesma família |
| .NET | `Testcontainers` (dotnet) | mesma família |
| Node/TS | `testcontainers` (node) | mesma família |

### Regras
1. **Sem mock de infra** nesta camada (DB real, broker real, Object Storage=emulador real — `fake-gcs-server` para GCS, `azurite` para Azure Blob, `localstack` para S3 se necessário).
2. **Container por test class/module**, **dado por test** (truncate/seed entre).
3. **Sem `@Disabled`** — quebrou, conserta.
4. **Networking interno** entre containers (ex.: app↔kafka↔postgres) reproduz topologia.
5. **Health check** antes de rodar; timeout claro.
6. **Container reuse** ON em dev, OFF no CI.

### Template (Python — referência; outras stacks análogas)

```python
import pytest
from testcontainers.postgres import PostgresContainer
from testcontainers.kafka import KafkaContainer

@pytest.fixture(scope="module")
def postgres():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="module")
def kafka():
    with KafkaContainer("confluentinc/cp-kafka:7.6.0") as k:
        yield k

@pytest.fixture
def app(postgres, kafka):
    # bootstrap real do app apontando p/ os containers
    ...

def test_pedido_criado_publica_evento(app):
    response = app.post("/v1/pedidos", json={...})
    assert response.status_code == 201
    eventos = consume("pedidos.eventos", timeout=5)
    assert eventos[0]["type"] == "PedidoCriado"
```

## 3. Contract Testing

### Provider (backend) ↔ Consumer (front ou outro backend)

#### Modelo 1 — Schema-first (recomendado)
- `api/openapi.yaml` é a fonte da verdade.
- **Provider**: `Schemathesis` valida que a app real responde conforme schema.
- **Consumer**: SDK gerado a partir do schema; PR no consumer roda
  schema-driven tests do mock server.

#### Modelo 2 — Pact (consumer-driven)
- Para integrações onde quem **descobre** o contrato é o consumer (ex.: app
  mobile que pede campo novo).
- Consumer publica `pact.json` no broker.
- Provider verifica pact no CI.

**Política do kit**: Schema-first é default. Pact entra quando há ≥3
consumers ou consumer mobile com release independente.

### Eventos (Kafka/Pub-Sub)
- Schema Registry obrigatório (Avro/Protobuf/JSON Schema).
- Compatibilidade `BACKWARD` mínima.
- Contract test do consumer: dado um payload conforme schema vN, processa.

## 4. E2E — escopo mínimo

E2E é caro. Só vale para:
1. **Smoke pós-deploy** (login + 1 fluxo crítico por persona) — `@smoke`
2. **Cenários `@release:<id>`** marcados como release-blocker no `.feature`
3. **Regressões críticas** registradas após incidente

E2E **não substitui** unit + integration + contract.

### Ambiente
- 1 ambiente **stg** estável (não compartilhado com dev).
- 1 ambiente **ephemeral por PR** quando label `e2e:full` (k8s namespace + DB seed).
- Dados de teste isolados, nunca prod.

## 5. Observabilidade dos próprios testes

Toda execução de suite emite:
- Trace OTel da execução (test → http call → db query).
- Métrica: duração por test, falhas por test, flakiness rate.
- Report HTML/JUnit XML no artefato do CI.

`@quality` consome esses sinais para o gate.

## 6. Estrutura de pastas (canônica por serviço)

```
code/services/<svc>/
└── tests/
    ├── unit/
    ├── component/
    ├── integration/                  # Testcontainers
    │   ├── conftest.py | setup.*
    │   ├── test_<feature>_integration.*
    │   └── fixtures/
    ├── contract/
    │   ├── provider/                 # validar schema/pact
    │   └── consumer/                 # se este svc consome outros
    └── e2e/                          # opcional: scripts smoke
```

## 7. Rubricas de gate

### Pre-merge
- [ ] Integration suite do serviço impactado verde
- [ ] Contract provider verde (Schemathesis vs OpenAPI)
- [ ] Se mudou OpenAPI: contract consumer dos clients verde

### Gate G2 (Downstream → Operation)
- [ ] E2E `@smoke` verde no stg
- [ ] E2E `@release:<id>` 100% verde
- [ ] Schema Registry sem breaking change
- [ ] Pact broker (se usado) com todas as relações verdes

## 8. Anti-padrões

- ❌ Mock de Postgres/Kafka em "integration test"
- ❌ Compartilhar instância de DB entre testes paralelos
- ❌ E2E para validar regra de domínio
- ❌ Testes que dependem de ordem
- ❌ Sleeps em vez de waits/condições
- ❌ Cobertura E2E inflando pirâmide (anti-pirâmide / cone-de-sorvete)
- ❌ Snapshot de payload sem revisão semântica
- ❌ `@Disabled` permanente
- ❌ Contrato implícito ("a gente combinou no Slack")
