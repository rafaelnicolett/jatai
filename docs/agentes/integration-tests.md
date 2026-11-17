<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @integration-tests

> Side-car: roda a suíte de ponta a ponta e os contract tests entre serviços quando backend e frontend fecham uma onda.

| Campo | Valor |
|---|---|
| Stream | Side-car (`sidecar`) |
| Camada | `L2-sidecar` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/sidecar/integration-tests.agent.md` |

## O que faz

Side-car: roda a suíte de ponta a ponta e os contract tests entre serviços quando backend e frontend fecham uma onda.

## Quando entra

- Recebe o trabalho de: [@sprint-runner](sprint-runner.md).
- Entrega para: [@sprint-runner](sprint-runner.md), [@reviewer](reviewer.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`integration-testing`](skills.md#integration-testing): Padrão profundo de testes integrados — Testcontainers para infra real, contract testing entre serviços (Pact + OpenAPI), E2E API/UI, ambiente isolado por PR, observabilidade dos próprios testes.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.

## O que recebe

- `api/openapi.yaml`
- `features/**/*.feature`
- `code/services/**`
- `code/apps/**`

## O que produz

- `test reports (integration / contract / e2e)`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Suíte de integração passando
- Contract tests OpenAPI passando

## Regras de proteção

- Não substituir unit tests
- Não chamar outro side-car

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
