<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @domain-extractor

> Discovery: engenharia reversa de domínio; extrai bounded contexts, aggregates e linguagem ubíqua do código, separando o domínio atual do ideal.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1d-domain-extraction` |
| Escopo | o workspace inteiro (`workspace`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/domain-extractor.agent.md` |

## O que faz

Discovery: engenharia reversa de domínio; extrai bounded contexts, aggregates e linguagem ubíqua do código, separando o domínio atual do ideal.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).
- [`domain-extraction-from-code`](skills.md#domain-extraction-from-code): Engenharia reversa de domínio.

## O que recebe

- `docs/input/**`
- `.github/artifacts/repos.yaml`
- `.github/artifacts/assessment/repos/*/tech-stack/tech-radar.md`
- `.github/artifacts/assessment/repos/*/architecture/arch-discovery.md`
- `.github/artifacts/assessment/repos/*/architecture/c4-context.md`
- `.github/artifacts/assessment/repos/*/architecture/c4-container.md`
- `.github/artifacts/assessment/repos/*/architecture/c4-component.md`
- `repos/**/*.{java,py,ts,cs,go,kt,rb}`

## O que produz

- `.github/artifacts/context-repos.yaml`
- `.github/artifacts/assessment/domain/context-map.md`
- `.github/artifacts/assessment/domain/ubiquitous-language.md`
- `.github/artifacts/assessment/domain/aggregates.md`
- `.github/artifacts/assessment/domain/business-rules.md`
- `.github/artifacts/assessment/domain/domain-events.md`
- `.github/artifacts/assessment/domain/gaps.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- context-repos.yaml: cada bounded context mapeado para os repos/paths onde vive (N:N)
- Bounded contexts inferidos com módulos, persistência e linguagem própria
- Mapa de contextos com tipo de relação (ACL, Shared Kernel, Conformist, Partnership)
- Glossário de linguagem ubíqua com conflitos identificados
- Aggregates com root, entities, VOs, invariantes, estado e comandos
- Regras de negócio extraídas de services, validators, constraints e testes
- Domain events explícitos e inferidos com triggers e side-effects
- Gaps de modelagem com severidade e recomendação

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/), nem cache. Se precisar compilar, copie para o scratchpad.
- Não impor DDD onde o domínio é simples (CRUD vale CRUD)
- Distinguir sempre o que está no código (atual) vs. o que seria ideal (recomendado)
- Não inventar regras — só extrair o que está evidenciado no código ou nos testes

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
