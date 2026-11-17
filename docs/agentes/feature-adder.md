<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @feature-adder

> Execution: implementa feature nova em código existente, BDD primeiro e no estilo do projeto, sem refatorar de passagem.

| Campo | Valor |
|---|---|
| Stream | Execução (`execution`) |
| Camada | `L2-phase` |
| Fase | `3d-feature-add` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/execution/feature-adder.agent.md` |

## O que faz

Execution: implementa feature nova em código existente, BDD primeiro e no estilo do projeto, sem refatorar de passagem.

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador), [@test-backfill-agent](test-backfill-agent.md), [@refactor-agent](refactor-agent.md).

## Skills

- `coding-guidelines-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.
- `design-system-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.
- [`bdd-gherkin`](skills.md#bdd-gherkin): Padrão profundo de BDD/Gherkin — escrita de cenários executáveis em UL do domínio, given/when/then declarativos, scenario outline, tags por release/risco/persona.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.
- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`commit-assistant`](skills.md#commit-assistant): Conventional Commits, Semantic Versioning e Release Notes para o @release.
- [`workflow-memory`](skills.md#workflow-memory): Sistema de memória cross-task para agentes downstream.
- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.

## O que recebe

- `.github/artifacts/assessment/repos/<repo-id>/debt/tech-debt.md`
- `.github/artifacts/context-repos.yaml`
- `.github/artifacts/planning/modernization-roadmap.md`
- `.github/artifacts/initiatives.yaml`
- `features/**/*.feature`

## O que produz

- `repos/<repo-id>/** — mudanças SOMENTE dentro dos paths do contexto`
- `repos/<repo-id>/tests/**`
- `repos/<repo-id>/**/*test*`
- `features/<epic-id>/*.feature — Feature-list leve, só quando a iniciativa usa epics/epic_status, opcional por Epic`
- `.github/artifacts/execution/feature-report.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Feature implementada respeitando padrão arquitetural existente (descoberto no arch-discovery)
- Usa Anti-Corruption Layer se a feature 'limpa' está dentro de contexto legado
- Testes novos seguindo qa-strategy + pirâmide alvo
- Sem regressão: testes pré-existentes continuam verdes
- Documentação atualizada (README, ADR se decisão nova)

## Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- CONFORM: escreva no padrão descoberto do repo (arch_current em repos.yaml) — carregue a skill coding-guidelines-&lt;repo-id>
- Se o padrão for inadequado: NÃO refatore. Registre achado e sugira iniciativa modernization
- NÃO refatorar código existente 'de passagem' — escalar para @refactor-agent
- Respeitar o padrão arquitetural ATUAL do projeto (mesmo se subótimo)
- Se o padrão atual impede a feature — use ACL ou escale para planning
- Se o módulo alvo não tem cobertura — invoque @test-backfill-agent antes
- Feature-list leve (passo 0) é OPCIONAL por Epic — nunca force features decorativas só pra preencher estrutura; um Epic pequeno pula o passo inteiro
- Feature-list leve NUNCA roda pra modernization/hotfix — só type: feature com epics/epic_status preenchidos em initiatives.yaml

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
