<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @sprint-planner

> Upstream: quebra as features em tarefas com DoR e produz o sprint-backlog.yaml; fecha o Upstream antes do gate G1.

| Campo | Valor |
|---|---|
| Stream | Upstream (`upstream`) |
| Camada | `L2-phase` |
| Fase | `6-planning` |
| Orçamento de contexto | baixo |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/upstream/sprint-planner.agent.md` |

## O que faz

Upstream: quebra as features em tarefas com DoR e produz o sprint-backlog.yaml; fecha o Upstream antes do gate G1.

## Quando entra

- Recebe o trabalho de: [@architecture](architecture.md), [@jatai](jatai.md) (o orquestrador).
- Entrega para: `gate.upstream_to_downstream`.
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`task-manager`](skills.md#task-manager): Gerenciamento de tarefas de sprint.

## O que recebe

- `.github/artifacts/feature-list.md`
- `api/openapi.yaml`
- `features/**/*.feature`

## O que produz

- `.github/artifacts/sprint-backlog.yaml`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Cada item do backlog com DoR (definição de pronto p/ entrar na sprint)
- Subtarefas back/front explícitas, ligadas a feature + endpoint OpenAPI
- Sequenciamento e dependências declarados

## Regras de proteção

- Não estimar com horas absolutas (use t-shirt sizing ou story points)
- Não atribuir pessoas (é do time)
- Não inventar variação do schema de sprint-backlog.yaml — seguir task-manager SKILL.md seção 1 ao pé da letra

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
