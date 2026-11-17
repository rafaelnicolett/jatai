<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @architecture

> Upstream: define ADRs, o contrato OpenAPI (contract-first), diagramas C4 e de sequência e os padrões transversais da arquitetura.

| Campo | Valor |
|---|---|
| Stream | Upstream (`upstream`) |
| Camada | `L2-phase` |
| Fase | `5-architecture` |
| Orçamento de contexto | alto |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/upstream/architecture.agent.md` |

## O que faz

Upstream: define ADRs, o contrato OpenAPI (contract-first), diagramas C4 e de sequência e os padrões transversais da arquitetura.

## Quando entra

- Recebe o trabalho de: [@bdd](bdd.md), [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@sprint-planner](sprint-planner.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`openapi-governance`](skills.md#openapi-governance): Padrões e governança para contratos OpenAPI — versionamento, lint, breaking change detection, geração de SDK, modelos C4 (4 níveis) e diagramas de sequência.
- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).
- [`arch-diagrams-drawio`](skills.md#arch-diagrams-drawio): Padrões canônicos para gerar diagramas de arquitetura no formato Draw.io XML (.drawio) — C4 (níveis 1-3) e diagramas de sequência UML.

## O que recebe

- `features/**/*.feature`
- `docs/domain/bounded-contexts.md`
- `jatai.config.yaml`

## O que produz

- `api/openapi.yaml`
- `docs/adr/*.md`
- `docs/architecture/c4/c4-context.drawio`
- `docs/architecture/c4/c4-container.drawio`
- `docs/architecture/c4/c4-component-{bc}.drawio`
- `docs/architecture/c4/c4-deployment.drawio`
- `docs/architecture/sequences/seq-autenticacao.drawio`
- `docs/architecture/sequences/seq-{fluxo}.drawio`
- `docs/architecture/data/er-{bc}.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- openapi.yaml válido (Spectral lint OK), versionado (/v1/), cobre todas as features
- Error envelope único ({ code, message, details, traceId }) em todos os endpoints
- Auth declarada em todos os endpoints (Bearer JWT / OAuth2)
- Paginação cursor-based em todas as listagens
- operationId em camelCase, alinhado com UL do domínio
- Pelo menos 1 ADR para stack de backend (java/dotnet/python-api/python-agentic)
- Pelo menos 1 ADR para padrão arquitetural (hexagonal/clean)
- Pelo menos 1 ADR para padrão de persistência
- ADR de observabilidade (OTel traces + metrics + logs)
- c4-context.drawio (Nível 1) — atores, sistemas externos, protocolos
- c4-container.drawio (Nível 2) — serviços, databases, frontends, brokers com tecnologia
- c4-component-{serviço}.drawio (Nível 3) para cada Core Subdomain identificado
- seq-autenticacao.drawio — fluxo de autenticação (PKCE/JWT)
- seq-{fluxo-principal}.drawio — fluxo principal de cada bounded context core
- Compatível com as stacks declaradas em jatai.config.yaml
- Hexagonal layers mapeadas por stack (ver skill coding-guidelines seção 6)

## Regras de proteção

- Não escrever código de implementação
- Não criar pipelines (é do @devops)
- Não definir versões fixas de runtime no exit_contract de outras fases
- Não usar termos técnicos nos operationId que não existam na UL do domínio
- Não pular nível C4 (Nível 3 obrigatório para Core Subdomains)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
