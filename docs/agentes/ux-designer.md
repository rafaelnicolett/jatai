<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @ux-designer

> Upstream: transforma o PRD em jornadas visuais validáveis (user flows, wireframes e protótipo HTML navegável).

| Campo | Valor |
|---|---|
| Stream | Upstream (`upstream`) |
| Camada | `L2-phase` |
| Fase | `3-ux-design` |
| Orçamento de contexto | alto |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/upstream/ux-designer.agent.md` |

## O que faz

Upstream: transforma o PRD em jornadas visuais validáveis (user flows, wireframes e protótipo HTML navegável).

## Quando entra

- Recebe o trabalho de: [@product](product.md), [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@domain-modeler](domain-modeler.md), [@bdd](bdd.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`ui-ux-design-system`](skills.md#ui-ux-design-system): Padrão canônico de UI/UX para agentes @frontend-*.
- [`ux-prototyping`](skills.md#ux-prototyping): Metodologia para criar protótipos HTML navegáveis e wireframes ASCII a partir de fluxos de usuário — sem framework JS.

## O que recebe

- `.github/artifacts/prd.md`
- `.github/artifacts/feature-list.md`
- `.github/artifacts/business-brief.md`

## O que produz

- `docs/design/user-flows.md`
- `docs/design/wireframes/`
- `docs/design/prototype/`
- `docs/design/design-tokens.yaml`

## Contrato de saída

O agente só passa adiante quando isto vale.

- user-flows.md cobre 100% dos fluxos críticos listados no feature-list
- Pelo menos 1 wireframe por feature P0/P1
- Protótipo HTML navegável com ao menos os fluxos P0 linkados entre si
- design-tokens.yaml define paleta, tipografia e grid base
- Aprovação explícita do stakeholder registrada no final de user-flows.md

## Regras de proteção

- Não implementar componentes React/Flutter/nativa (é @frontend-*)
- Não escrever step definitions BDD (é @qa-tester)
- Não decidir stack de styling (é ADR do @architecture)
- Não modelar domínio DDD (é @domain-modeler)
- Prototipagem em HTML puro/CSS — sem framework JS no protótipo

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
