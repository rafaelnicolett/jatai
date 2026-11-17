<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @refactor-agent

> Execution: aplica refactors conhecidos e pequenos (receitas de Fowler), com testes verdes e commits atômicos, sem mudar comportamento.

| Campo | Valor |
|---|---|
| Stream | Execução (`execution`) |
| Camada | `L2-phase` |
| Fase | `3b-refactor` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/execution/refactor-agent.agent.md` |

## O que faz

Execution: aplica refactors conhecidos e pequenos (receitas de Fowler), com testes verdes e commits atômicos, sem mudar comportamento.

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador), [@test-backfill-agent](test-backfill-agent.md).

## Skills

- `coding-guidelines-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.
- `design-system-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.
- [`safe-refactoring-recipes`](skills.md#safe-refactoring-recipes): Catálogo de receitas de refactoring (Fowler — Refactoring 2nd ed.) com protocolo test-first.
- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`commit-assistant`](skills.md#commit-assistant): Conventional Commits, Semantic Versioning e Release Notes para o @release.
- [`workflow-memory`](skills.md#workflow-memory): Sistema de memória cross-task para agentes downstream.

## O que recebe

- `.github/artifacts/planning/modernization-roadmap.md`
- `.github/artifacts/planning/risk-matrix.md`
- `.github/artifacts/assessment/coverage-gaps.md`

## O que produz

- `repos/<repo-id>/** — mudanças SOMENTE dentro dos paths do contexto`
- `.github/artifacts/execution/refactor-report.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Refactor aplicado segundo receita conhecida (extract method/class, move, rename, etc)
- TODOS os testes pré-existentes continuam verdes (sem mudança de comportamento)
- Cobertura ≥ threshold antes de iniciar (test-backfill-agent invocado se faltava)
- Commits pequenos e atômicos, cada um verde
- PR pequeno (&lt; 400 LOC mudadas, idealmente)

## Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- CONFORM: escreva no padrão descoberto do repo (arch_current em repos.yaml) — carregue a skill coding-guidelines-&lt;repo-id>
- Se o padrão for inadequado: NÃO refatore. Registre achado e sugira iniciativa modernization
- NUNCA refatorar sem cobertura mínima — escalar para test-backfill-agent
- NUNCA misturar refactor com mudança de comportamento ('refactor + bugfix' = NÃO)
- Cada commit no formato 'refactor: ...' — semantic ok
- Se descobrir bug durante refactor: NOT FIX NOW — criar issue, marcar TODO, prosseguir
- Sem rewrite — só transformações pequenas e seguras

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
