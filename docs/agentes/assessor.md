<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @assessor

> Coordenador do Foundation (Discovery): inventaria os repositórios e conduz os sub-agentes passo a passo, com validação humana após cada um, até o gate D1.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`foundation`) |
| Camada | `L1-stream` |
| Fase | `1-foundation-coordinator` |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/assessor.agent.md` |

## O que faz

Coordenador do Foundation (Discovery): inventaria os repositórios e conduz os sub-agentes passo a passo, com validação humana após cada um, até o gate D1.

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@jatai](jatai.md) (o orquestrador), [@modernization-planner](modernization-planner.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).
- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.

## O que recebe

- `.github/artifacts/repos.yaml`
- `repos/**/*`

## O que produz

- `.github/artifacts/repos.yaml`
- `.github/artifacts/assessment/repos/<repo-id>/**`
- `.github/artifacts/assessment/domain/**`
- `.github/artifacts/assessment/business/business-context.md`
- `.github/artifacts/assessment/business/baseline-metrics.json`
- `.github/artifacts/assessment/report.md`
- `.github/artifacts/assessment/foundation-state.yaml`
- `<host-dir>/agents/domain/<slug>.agent.md`
- `<host-dir>/skills/coding-guidelines-<repo-id>/SKILL.md`
- `.github/artifacts/context-repos.yaml`
- `jatai.config.yaml`

## Contrato de saída

O agente só passa adiante quando isto vale.

- repos.yaml com os N repositórios e pinned_sha de cada um
- Por repo: tech-radar.md, arch-discovery.md + diagramas, project-coding-guide.md, quality-report.md, tech-debt.md — produzidos e validados
- Por repo: gate D1 aprovado pelo humano
- Cross-repo: context-repos.yaml + domain/** produzidos e validados
- Bounded contexts aprovados pelo humano (status: accepted em context-repos.yaml)
- LLM Wiki sintetizada: 1 agente de domínio por contexto accepted, com lives_in e skills dos repos
- registry.yaml atualizado com os agentes de domínio
- business-context.md + stakeholder-interview.md produzidos e validados
- report.md consolidado (rollup dos N repos) e validado
- baseline-metrics.json consolidado e validado
- jatai.config.yaml com stacks e skills confirmadas pelo humano (Skill Linking)
- foundation-state.yaml com todos os human_checklist preenchidos
- Gate D1 global declarado ao usuário

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/, node_modules/), nem cache. Rode builds no scratchpad, sobre cópia.
- NUNCA executar dois sub-agents em sequência sem gate HITL entre eles
- NUNCA avançar sem AskUserQuestion confirmado pelo usuário
- NUNCA clonar repositório à mão — use o comando "Jataí: Sincronizar Repositórios"
- NUNCA misturar artefatos de repos diferentes — cada um em assessment/repos/&lt;id>/
- Não fazer planning de modernização (cabe ao @modernization-planner)
- Não medir maturidade direto — delegue ao @maturity-assessor quando configurado

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
