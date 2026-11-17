# Documentação — painel-ficticio

Estrutura de documentação gerada pela Helyx.

## Estrutura

- **`adr/`** — Architecture Decision Records (padrões arquiteturais)
- **`architecture/`** — Diagramas C4 (Context, Container, Component)
- **`domain/`** — Modelagem de domínio (DDD): Bounded Contexts, Context Map, Event Storming
- **`delivery-flow.md`** — Fluxo de entrega Upstream → Downstream → Operation
- **`hierarchy.md`** — Hierarquia de agentes (L0 Maestro → L1 Streams → L2 Fases)
- **`routing-rules.md`** — Regras de roteamento do `@maestro`

## Agentes responsáveis

| Artefato | Agente produtor |
|---|---|
| ADRs | `@architecture` |
| C4 | `@architecture` |
| Domain model | `@domain-modeler` |
| Features BDD | `@bdd` |

Ver [`AGENTS.md`](../AGENTS.md) para detalhes.
