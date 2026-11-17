<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @business

> Upstream: capta a oportunidade de negócio e produz o Business Brief (problema, público, valor esperado e métricas de sucesso).

| Campo | Valor |
|---|---|
| Stream | Upstream (`upstream`) |
| Camada | `L2-phase` |
| Fase | `1-business` |
| Orçamento de contexto | baixo |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/upstream/business.agent.md` |

## O que faz

Upstream: capta a oportunidade de negócio e produz o Business Brief (problema, público, valor esperado e métricas de sucesso).

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@product](product.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`docs-writer`](skills.md#docs-writer): Padrões de escrita de documentação.

## O que recebe

- `user_intent`

## O que produz

- `.github/artifacts/business-brief.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- business-brief.md existe e cobre: problema, público-alvo, hipótese de valor, métricas de sucesso, stakeholders, riscos
- Pelo menos uma métrica de sucesso quantificável (KPI ou OKR)

## Regras de proteção

- Não escrever PRD nem desenhar solução técnica
- Não definir features (isso é do @product)
- Não estimar prazo

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
