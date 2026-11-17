<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @modernization-planner

> Planning: compara a arquitetura atual de cada repositório com o alvo e monta o roadmap de modernização incremental e reversível.

| Campo | Valor |
|---|---|
| Stream | Planejamento (`planning`) |
| Camada | `L2-phase` |
| Fase | `2a-modernization-roadmap` |
| Escopo | o workspace inteiro (`workspace`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/planning/modernization-planner.agent.md` |

## O que faz

Planning: compara a arquitetura atual de cada repositório com o alvo e monta o roadmap de modernização incremental e reversível.

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@risk-prioritizer](risk-prioritizer.md), [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`legacy-modernization-patterns`](skills.md#legacy-modernization-patterns): Padrões canônicos para modernizar sistemas legados de forma incremental e reversível: Strangler Fig, Branch by Abstraction, Anti-Corruption Layer, Parallel Run, Expand-Contract.
- [`tech-debt-mapping`](skills.md#tech-debt-mapping): Inventário e priorização de dívida técnica usando o framework de Martin Fowler (prudent/reckless × deliberate/inadvertent) e estimativa de juros.
- [`task-manager`](skills.md#task-manager): Gerenciamento de tarefas de sprint.

## O que recebe

- `.github/artifacts/repos.yaml`
- `.github/artifacts/assessment/report.md`
- `.github/artifacts/assessment/repo-graph.yaml`
- `.github/artifacts/assessment/repos/*/tech-stack/tech-radar.md`
- `.github/artifacts/assessment/repos/*/architecture/arch-discovery.md`
- `.github/artifacts/assessment/repos/*/debt/tech-debt.md`
- `.github/artifacts/assessment/repos/*/test-coverage/coverage-gaps.md`

## O que produz

- `.github/artifacts/planning/modernization-roadmap.md`
- `.github/artifacts/initiatives.yaml`

## Contrato de saída

O agente só passa adiante quando isto vale.

- arch_target por repositório (com justificativa) — declarado na iniciativa, nunca em repos.yaml
- Cada iniciativa modernization referencia os achados que a justificam (driven_by)
- Ordem respeita o repo-graph: repos-folha primeiro; ciclos tratados antes de modernizar os envolvidos
- Roadmap em ondas (wave 1: quick wins, wave 2: refactors estruturais, wave 3: migrações)
- Cada item referencia: padrão aplicado (strangler/branch-by-abstraction/etc), dívida que paga, esforço, valor
- Estratégia incremental — nenhum big bang
- Critérios de sucesso mensuráveis por onda
- `waves:` sempre preenchido em initiatives.yaml quando o roadmap tem seções de onda — independente do type (feature ou modernization); é o campo que faz o Cockpit renderizar a barra lateral de ondas em vez da escadaria genérica de 16 fases. `epics:` é o equivalente em vocabulário novo — mesma regra, nunca os dois juntos na mesma iniciativa; default continua `waves:` até decisão explícita de usar Epic/Feature/Backlog/Task

## Regras de proteção

- Não recomendar rewrite — modernização é incremental
- Cada onda deve ser shippable independentemente
- Não definir prioridade final (cabe ao risk-prioritizer)
- arch_target vive na INICIATIVA, nunca em repos.yaml — repos.yaml só guarda fato descoberto
- Nunca propor modernização sem driven_by — refatorar sem achado que justifique é gosto pessoal
- Nunca modernizar repo dentro de um ciclo sem antes quebrar o ciclo
- Não esquecer test backfill antes de refactor
- Numa feature que reaproveita este roadmap (ver seção abaixo), nunca esqueça de espelhar as ondas em `waves:` só porque o type não é modernization — o campo é o mesmo, o Cockpit não olha o type pra decidir a view

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
