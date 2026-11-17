<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @coding-archaeologist

> Discovery: extrai como o time realmente escreve código e gera a skill coding-guidelines-&lt;repo-id>, que vira a lei de codificação dos agentes de execução.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1e-coding-archaeology` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/coding-archaeologist.agent.md` |

## O que faz

Discovery: extrai como o time realmente escreve código e gera a skill coding-guidelines-&lt;repo-id>, que vira a lei de codificação dos agentes de execução.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.

## O que recebe

- `repos/<repo-id>/.github/copilot-instructions.md`
- `repos/<repo-id>/.github/instructions/**`
- `repos/<repo-id>/CLAUDE.md`
- `repos/<repo-id>/AGENTS.md`
- `repos/<repo-id>/.cursorrules`
- `repos/<repo-id>/.cursor/rules/**`
- `repos/<repo-id>/CONTRIBUTING.md`
- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`
- `**/*.{py,ts,js,java,cs,go,kt,dart,svelte,vue,tsx,jsx}`
- `**/*test*.{py,ts,js,java,cs,go,kt}`
- `**/*spec*.{ts,js}`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/coding-guidelines/project-coding-guide.md`
- `<host-dir>/skills/coding-guidelines-<repo-id>/SKILL.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Convenções de naming extraídas por stack (classes, métodos, arquivos, constantes)
- Padrão de estrutura de módulos/packages documentado com exemplos reais do código
- Error handling pattern real (não genérico) com exemplos extraídos
- Padrões de teste documentados (biblioteca, estrutura, fixtures, factories)
- Padrões de logging/observabilidade reais
- Anti-patterns identificados (o que o time evita ou já evitou)
- SKILL.md gerado em &lt;host-dir>/skills/coding-guidelines-&lt;repo-id>/

## Regras de proteção

- Se has_history: false — não há PRs nem git log. Extraia os padrões só do código atual e diga que o histórico não estava disponível
- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/), nem cache. Se precisar compilar, copie para o scratchpad.
- Extrair apenas o que está evidenciado no código — nunca inventar padrões
- Distinguir padrão predominante vs. exceção (se 80% usa X e 20% usa Y, X é o padrão)
- Não impor padrões externos — se o time usa Active Record, documente Active Record
- Amostrar no mínimo 10 arquivos por padrão identificado antes de afirmar

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
