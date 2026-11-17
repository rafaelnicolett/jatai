<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @domain-modeler

> Upstream: aplica DDD (bounded contexts, aggregates, linguagem ubíqua) em ciclo espiral com o @bdd.

| Campo | Valor |
|---|---|
| Stream | Upstream (`upstream`) |
| Camada | `L2-phase` |
| Fase | `3-domain-modeling` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/upstream/domain-modeler.agent.md` |

## O que faz

Upstream: aplica DDD (bounded contexts, aggregates, linguagem ubíqua) em ciclo espiral com o @bdd.

## Quando entra

- Recebe o trabalho de: [@product](product.md), [@jatai](jatai.md) (o orquestrador), [@bdd](bdd.md).
- Entrega para: [@bdd](bdd.md), [@architecture](architecture.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).
- Trabalha em ciclo com [@bdd](bdd.md), em 2 rodadas.

## Skills

- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).

## O que recebe

- `.github/artifacts/prd.md`
- `.github/artifacts/feature-list.md`
- `features/**/*.feature`
- `.github/artifacts/bdd-hotspots.md`

## O que produz

- `docs/domain/event-storming.md`
- `docs/domain/bounded-contexts.md`
- `docs/domain/context-map.md`
- `docs/domain/<bc>/glossary.md`
- `docs/domain/<bc>/aggregates.md`
- `docs/domain/<bc>/events.md`
- `docs/domain/<bc>/policies.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Rodada 1 (pré-BDD): BCs identificados + UL inicial + eventos do Big Picture
- Rodada 3 (pós-BDD): Agregados com invariantes formais + VOs/Entities + Domain Events ricos
- Context Map com padrão explícito (Conformist/ACL/Partner/OHS) entre BCs
- Glossário por BC com termos proibidos (sinônimos banidos)
- Classificação de subdomain (core/supporting/generic) feita

## Regras de proteção

- Não desenhar API REST (é do @architecture)
- Não escrever Gherkin (é do @bdd) — apenas UL e modelo
- Não decidir banco/ORM
- Não pular para tático sem ao menos 1 rodada de BDD (perde riqueza de exemplos)
- Não exceder 2 ciclos DDD↔BDD (escala ao @maestro se não convergir)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
