<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @arch-discoverer

> Discovery: infere o padrão arquitetural real de um repositório e produz a análise C4 (L1 a L3) com diagrama em draw.io ou LikeC4. Acionado pelo @assessor por repositório.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1b-arch-discovery` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/arch-discoverer.agent.md` |

## O que faz

Discovery: infere o padrão arquitetural real de um repositório e produz a análise C4 (L1 a L3) com diagrama em draw.io ou LikeC4. Acionado pelo @assessor por repositório.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`arch-pattern-detection`](skills.md#arch-pattern-detection): Heurísticas para inferir padrões arquiteturais (Hexagonal, Layered, DDD-tactical, MVC, MVVM, Feature-based, Vertical Slice, Clean-frontend) a partir de estrutura de pastas, nomes e imports.
- [`arch-hexagonal`](skills.md#arch-hexagonal): Arquitetura Hexagonal (Ports & Adapters) — estrutura de pastas, regras de dependência, adaptadores e fitness functions.
- [`arch-layered`](skills.md#arch-layered): Arquitetura em Camadas (Layered) — Controller → Service → Repository.
- [`arch-ddd-tactical`](skills.md#arch-ddd-tactical): DDD Tático — Aggregate Root, Entity, Value Object, Domain Event, Repository por aggregate, Domain Service.
- [`arch-mvc`](skills.md#arch-mvc): MVC (Model-View-Controller) — separação clássica de responsabilidades.
- [`arch-mvvm`](skills.md#arch-mvvm): MVVM com Unidirectional Data Flow (UDF) — Model, ViewModel, View com fluxo unidirecional de estado.
- [`arch-feature-based`](skills.md#arch-feature-based): Arquitetura Feature-Based para frontend — co-localização por feature, shared/ com regras estritas, sem camadas horizontais globais.
- [`arch-vertical-slice`](skills.md#arch-vertical-slice): Arquitetura Vertical Slice — features auto-contidas, MediatR pipeline, sem camadas horizontais globais.
- [`arch-clean-frontend`](skills.md#arch-clean-frontend): Clean Architecture para frontend — Data/Domain/Presentation em camadas com inversão de dependência.
- [`arch-diagrams-drawio`](skills.md#arch-diagrams-drawio): Padrões canônicos para gerar diagramas de arquitetura no formato Draw.io XML (.drawio) — C4 (níveis 1-3) e diagramas de sequência UML.
- [`arch-diagrams-likec4`](skills.md#arch-diagrams-likec4): Gera arquivos DSL LikeC4 (workspace.c4 + views.c4) derivados dos artefatos C4 do @arch-discoverer.

## O que recebe

- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`
- `**/*.{java,py,ts,tsx,js,jsx,cs,go,kt,swift,rb}`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/architecture/arch-discovery.md`
- `.github/artifacts/assessment/repos/<repo-id>/architecture/c4-context.md`
- `.github/artifacts/assessment/repos/<repo-id>/architecture/c4-container.md`
- `.github/artifacts/assessment/repos/<repo-id>/architecture/c4-component.md`
- `.github/artifacts/assessment/repos/<repo-id>/architecture/arch-discovery.drawio (se diagram_format: drawio)`
- `.github/artifacts/assessment/repos/<repo-id>/architecture/likec4/workspace.c4 (se diagram_format: likec4)`
- `.github/artifacts/assessment/repos/<repo-id>/architecture/likec4/views.c4 (se diagram_format: likec4)`

## Contrato de saída

O agente só passa adiante quando isto vale.

- arch-discovery.md: padrão arquitetural identificado (com confiança %), coupling matrix, anti-padrões, skill recomendada
- c4-context.md (L1): atores externos, sistemas externos, boundary do sistema
- c4-container.md (L2): todos os containers — serviços, bancos, filas, frontends, APIs externas
- c4-component.md (L3): componentes internos do container principal com responsabilidades e dependências
- diagrama arquitetural: arch-discovery.drawio (3 sheets) se drawio, ou workspace.c4 + views.c4 se likec4

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/, .venv/), nem cache. Se precisar compilar, copie para o scratchpad.
- Não inventar padrão — se o código é caótico, diga 'ad-hoc'
- Confiança em % obrigatória — não force 'é hexagonal' se está 60% layered
- L1/L2/L3 são INFERIDOS do código real, não desejados
- C4 L3 deve cobrir o container com maior complexidade/risco
- Nunca pular c4-component.md — mesmo em sistemas simples, descreva os módulos internos

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
