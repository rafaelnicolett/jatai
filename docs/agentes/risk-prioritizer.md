<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @risk-prioritizer

> Planning: ordena o roadmap pela matriz risco × valor × esforço, incluindo o risco de não fazer.

| Campo | Valor |
|---|---|
| Stream | Planejamento (`planning`) |
| Camada | `L2-phase` |
| Fase | `2b-risk-prioritization` |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/planning/risk-prioritizer.agent.md` |

## O que faz

Planning: ordena o roadmap pela matriz risco × valor × esforço, incluindo o risco de não fazer.

## Quando entra

- Recebe o trabalho de: [@modernization-planner](modernization-planner.md).
- Entrega para: [@adr-recorder](adr-recorder.md), [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`tech-debt-mapping`](skills.md#tech-debt-mapping): Inventário e priorização de dívida técnica usando o framework de Martin Fowler (prudent/reckless × deliberate/inadvertent) e estimativa de juros.
- [`task-manager`](skills.md#task-manager): Gerenciamento de tarefas de sprint.

## O que recebe

- `.github/artifacts/planning/modernization-roadmap.md`
- `.github/artifacts/assessment/tech-debt.md`
- `.github/artifacts/assessment/security-report.md`

## O que produz

- `.github/artifacts/planning/risk-matrix.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Matriz risco × esforço × valor para cada item do roadmap
- Top 10 ordenado por (valor × urgência) / esforço
- Itens com kill-switch / rollback plan definido
- Backlog inicial sugerido para sprint-planner (downstream)

## Regras de proteção

- Não inventar itens novos — só priorizar os existentes no roadmap
- Não esconder dívidas críticas em "long term"
- Sempre considerar risco de NÃO fazer (juros)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
