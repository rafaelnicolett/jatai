<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @reviewer

> Downstream: revisa os PRs da sprint e só aprova com @security e @qa-tester verdes.

| Campo | Valor |
|---|---|
| Stream | Downstream (`downstream`) |
| Camada | `L2-phase` |
| Fase | `3-review` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/downstream/reviewer.agent.md` |

## O que faz

Downstream: revisa os PRs da sprint e só aprova com @security e @qa-tester verdes.

## Quando entra

- Recebe o trabalho de: `backend-stack`, `frontend-stack`, [@sprint-runner](sprint-runner.md).
- Entrega para: [@sprint-runner](sprint-runner.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.
- [`workflow-memory`](skills.md#workflow-memory): Sistema de memória cross-task para agentes downstream.

## O que recebe

- `PR diff`
- `api/openapi.yaml`
- `features/**/*.feature`

## O que produz

- `PR review comments / approval`
- `.github/artifacts/reviews/<pr_number>-review.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- @security deu green (skill security-cve-checker + security-best-practices)
- @qa-tester deu green (cenários Gherkin cobertos)
- Coding guidelines respeitadas
- Diff respeita o contrato OpenAPI vigente

## Regras de proteção

- Não aprovar sem green de @security e @qa-tester
- Não mudar código (sugere, não commita)
- Não decidir release (é do @release)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
