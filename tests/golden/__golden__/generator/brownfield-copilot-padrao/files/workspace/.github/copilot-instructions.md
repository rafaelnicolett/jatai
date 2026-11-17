# Copilot Instructions — Helyx Brownfield

Este projeto usa o **Helyx em modo Brownfield**. Agentes operam em **streams
sequenciais** (Discovery → Planning → Execution → Operation) com **3 gates**
(D1, D2, D3). Toda mudança é informada, incremental e reversível.

## Ponto de entrada único

**Sempre comece pelo agente orquestrador `helyx`.** No Copilot, escolha o
agente `helyx` no seletor de agentes do chat (o custom agent em
`.github/agents/helyx.agent.md`). Nunca invoque agentes
especialistas diretamente: o `helyx` valida pré-requisitos e roteia.

## Regra de ouro

> **Discovery primeiro. Planning antes de Execution. Test backfill antes de refactor.**

Se faltar artefato de fase anterior, o `helyx` **bloqueia** e roteia para a
fase correta.

## Fluxo

```
DISCOVERY (entender)  →  GATE D1  →  PLANNING (decidir)  →  GATE D2
                                  →  EXECUTION (entregar) →  GATE D3
                                  →  OPERATION (operar)
```

## Streams e artefatos

| Stream | Agentes | Local dos artefatos |
|---|---|---|
| Discovery | `@assessor` + 8 sub-agents (incl. `@maturity-assessor` opt-in) | `.github/artifacts/assessment/` |
| Planning | `@modernization-planner`, `@risk-prioritizer`, `@adr-recorder` | `.github/artifacts/planning/`, `docs/adr/` |
| Execution | `@test-backfill-agent`, `@refactor-agent`, `@migration-agent`, `@feature-adder` (o PR é revisado pelo humano no gate D3) | PRs + `.github/artifacts/execution/` |
| Operation | `@devops`, `@observability`, `@incident`, `@sustain` | `pipelines/`, `infrastructure/`, runbooks |

## Regras para o Copilot

### Discovery (read-only)
- **Nenhum** agent de discovery modifica código, deps ou config
- Sempre use a skill `codebase-enrichment` antes de análise
- Sempre reporte caminhos/contagens — nunca dump de código sensível
- Para `@security-auditor`: nunca exponha conteúdo de secrets, apenas paths

### Planning
- Ler todos os artefatos de Discovery antes de propor roadmap
- Toda decisão arquitetural vira ADR (`docs/adr/00NN-*.md`)
- Priorização sempre via matriz risco × valor × esforço

### Execution
- **Nunca refatore sem cobertura mínima** — invocar `@test-backfill-agent` antes
- **Refactor**: usar receitas Fowler (`safe-refactoring-recipes`), commits atômicos
- **Migration**: sempre Expand-Contract — nunca big bang
- **Feature**: BDD primeiro (`bdd-gherkin`), depois implementação
- **Refactor + feature na mesma PR**: PROIBIDO

### Operation
- Toda mudança em produção exige PR mergeado e testes verdes (D3)
- Incidentes geram post-mortem em `.github/artifacts/incidents/`

## Perguntas ao humano no Copilot

Os agentes do kit foram escritos com as ferramentas do Claude Code. No Copilot:

- **`AskUserQuestion`** (pausa de validação humana): faça a pergunta no chat, com as opções numeradas, uma por linha. Em `multiSelect`, aceite vários números. **Pare e espere a resposta** antes de seguir; nunca responda pelo humano.
- **`TodoWrite`** (tracker de fases): mantenha a lista como `- [ ]` / `- [x]` no corpo da mensagem.

## Skills

Skills são carregadas **apenas quando o agente ativo as declara** em
`uses_skills`. Localizadas em `.github/skills/<skill-id>/SKILL.md`.

**Nunca carregue skill não declarada** pela fase ativa.

## Anti-padrões

- ❌ Escrever código de feature antes de Discovery aprovado
- ❌ Refactor sem characterization tests
- ❌ Big bang upgrade / rewrite
- ❌ Misturar refactor + feature em uma PR
- ❌ Modificar arquivos durante Discovery
- ❌ Pular Planning (ir direto de Discovery para Execution)
- ❌ Invocar agentes especialistas direto (sempre via o agente `helyx`)
- ❌ Inventar stack/arquitetura — sempre ler `assessment/report.md`
