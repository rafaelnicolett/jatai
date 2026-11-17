<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @debt-analyst

> Discovery: consolida a dívida técnica num inventário priorizável (quadrante de Fowler e estimativa de juros) a partir dos achados dos outros agentes.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1g-debt-analysis` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/debt-analyst.agent.md` |

## O que faz

Discovery: consolida a dívida técnica num inventário priorizável (quadrante de Fowler e estimativa de juros) a partir dos achados dos outros agentes.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`tech-debt-mapping`](skills.md#tech-debt-mapping): Inventário e priorização de dívida técnica usando o framework de Martin Fowler (prudent/reckless × deliberate/inadvertent) e estimativa de juros.
- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.

## O que recebe

- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`
- `.github/artifacts/assessment/repos/<repo-id>/quality/quality-report.md`
- `.github/artifacts/assessment/repos/<repo-id>/security/security-report.md`
- `.github/artifacts/assessment/repos/<repo-id>/test-coverage/coverage-gaps.md`
- `.github/artifacts/assessment/repos/<repo-id>/design/design-system.md`
- `**/*.{md,todo,fixme}`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/debt/tech-debt.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Inventário consolidado de dívidas (cada item: categoria, severidade, esforço, valor)
- Classificação Martin Fowler: prudent/reckless × deliberate/inadvertent
- Top 10 quick wins (alto valor, baixo esforço)
- Top 5 dívidas críticas (bloqueiam features futuras)
- Estimativa de juros (custo recorrente de não pagar)

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/, .venv/), nem cache. Se precisar compilar, copie para o scratchpad.
- Não recomendar solução ainda — só inventariar (planning agent recomenda)
- Evitar dívidas "filosóficas" sem evidência concreta

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
