<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @bdd

> Upstream: escreve os cenários Gherkin em ciclo espiral com o @domain-modeler, na linguagem ubíqua do domínio.

| Campo | Valor |
|---|---|
| Stream | Upstream (`upstream`) |
| Camada | `L2-phase` |
| Fase | `4-bdd` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/upstream/bdd.agent.md` |

## O que faz

Upstream: escreve os cenários Gherkin em ciclo espiral com o @domain-modeler, na linguagem ubíqua do domínio.

## Quando entra

- Recebe o trabalho de: [@domain-modeler](domain-modeler.md), [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@domain-modeler](domain-modeler.md), [@architecture](architecture.md), [@sprint-planner](sprint-planner.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).
- Trabalha em ciclo com [@domain-modeler](domain-modeler.md), em 2 rodadas.

## Skills

- [`bdd-gherkin`](skills.md#bdd-gherkin): Padrão profundo de BDD/Gherkin — escrita de cenários executáveis em UL do domínio, given/when/then declarativos, scenario outline, tags por release/risco/persona.
- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).

## O que recebe

- `.github/artifacts/feature-list.md`
- `docs/domain/bounded-contexts.md`
- `docs/domain/<bc>/glossary.md`
- `docs/domain/<bc>/events.md`

## O que produz

- `features/<bc>/<feature-slug>.feature`
- `.github/artifacts/bdd-hotspots.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Rodada 2 (pré-tático): cenários escritos por BC em UL bruta + hotspots documentados
- Rodada 4 (final): cenários refinados em UL madura, zero hotspot aberto
- Cada feature do feature-list tem >=1 .feature dentro do BC correto
- Cenários cobrem happy-path + >=1 edge + >=1 validation/error por feature
- Zero termos técnicos (sem endpoint, DTO, tabela, ID)
- Tags @bc, @persona, @release, @risk em 100% dos cenários

## Regras de proteção

- Não escrever step definitions (é do @qa-tester)
- Não decidir framework de teste
- Não acoplar cenários a tecnologia (front/back/api)
- Não prosseguir para @architecture sem @domain-modeler confirmar UL convergida
- Documentar hotspots em bdd-hotspots.md — nunca inventar termos

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
