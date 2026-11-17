<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @arch-cross

> Guardian: garante a coerência técnica de ponta a ponta entre as stacks e valida a arquitetura nos gates G1 e G2.

| Campo | Valor |
|---|---|
| Stream | Guardião (`guardian`) |
| Camada | `L2-guardian` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/guardian/arch-cross.agent.md` |

## O que faz

Guardian: garante a coerência técnica de ponta a ponta entre as stacks e valida a arquitetura nos gates G1 e G2.

## Quando entra

- Entra nos gates: `gate.upstream_to_downstream` (G1, do Upstream para o Downstream), `gate.downstream_to_operation` (G2, do Downstream para a Operação).
- Valida de ponta a ponta e não executa fase.
- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`openapi-governance`](skills.md#openapi-governance): Padrões e governança para contratos OpenAPI — versionamento, lint, breaking change detection, geração de SDK, modelos C4 (4 níveis) e diagramas de sequência.
- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).
- [`integration-testing`](skills.md#integration-testing): Padrão profundo de testes integrados — Testcontainers para infra real, contract testing entre serviços (Pact + OpenAPI), E2E API/UI, ambiente isolado por PR, observabilidade dos próprios testes.

## O que recebe

- `api/openapi.yaml`
- `docs/adr/*.md`
- `docs/architecture/c4/*.md`
- `code/services/**`
- `code/apps/**`
- `infrastructure/**`
- `jatai.config.yaml`

## O que produz

- `.github/artifacts/gates/<gate-id>-arch-cross.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- OpenAPI cobre todas as features e está consistente com as stacks selecionadas
- Padrões transversais respeitados em TODAS as stacks (auth, error format, observability, versionamento)
- Implementação backend consome o mesmo contrato consumido pelos frontends
- ADRs vigentes não estão violados pela implementação
- Observabilidade fim-a-fim configurada (trace ponta a ponta)

## Regras de proteção

- Não executar trabalho de fase
- Não ser invocado fora de gate
- Não validar negócio (é do @stream-align)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
