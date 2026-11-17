<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @sprint-runner

> Downstream: coordena a execução da sprint, despacha backend e frontend em ondas paralelas e aciona os side-cars de teste e revisão.

| Campo | Valor |
|---|---|
| Stream | Downstream (`downstream`) |
| Camada | `L2-phase` |
| Fase | `1-sprint-exec` |
| Orçamento de contexto | baixo |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/downstream/sprint-runner.agent.md` |

## O que faz

Downstream: coordena a execução da sprint, despacha backend e frontend em ondas paralelas e aciona os side-cars de teste e revisão.

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: `backend-stack`, `frontend-stack`, [@reviewer](reviewer.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`task-manager`](skills.md#task-manager): Gerenciamento de tarefas de sprint.
- [`workflow-memory`](skills.md#workflow-memory): Sistema de memória cross-task para agentes downstream.

## O que recebe

- `.github/artifacts/sprint-backlog.yaml`
- `jatai.config.yaml`

## O que produz

- `.github/artifacts/sprint-status.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Todos os itens da sprint em estado terminal (done | blocked | descoped)
- PRs mergeados para itens done
- Bloqueios escalados ao @maestro com justificativa

## Regras de proteção

- Não implementar código (delegue ao @backend-* / @frontend-*)
- Não revisar PR (é do @reviewer)
- Não invocar Guardians (só @maestro o faz, em gate)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
