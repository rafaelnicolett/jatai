<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @product

> Upstream: transforma o Business Brief em PRD e lista de features priorizadas com hipóteses mensuráveis.

| Campo | Valor |
|---|---|
| Stream | Upstream (`upstream`) |
| Camada | `L2-phase` |
| Fase | `2-discovery` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/upstream/product.agent.md` |

## O que faz

Upstream: transforma o Business Brief em PRD e lista de features priorizadas com hipóteses mensuráveis.

## Quando entra

- Recebe o trabalho de: [@business](business.md), [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@domain-modeler](domain-modeler.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`docs-writer`](skills.md#docs-writer): Padrões de escrita de documentação.

## O que recebe

- `.github/artifacts/business-brief.md`

## O que produz

- `.github/artifacts/prd.md`
- `.github/artifacts/feature-list.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- prd.md existe e referencia o business-brief
- feature-list.md tem ao menos N features priorizadas com hipótese mensurável cada
- Cada feature tem critério de sucesso ligado a uma métrica do brief

## Regras de proteção

- Não escrever Gherkin (é do @bdd)
- Não decidir tecnologia (é do @architecture)
- Não modelar domínio (é do @domain-modeler)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
