<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @backend-dotnet

> Downstream: implementa serviços backend em .NET Core (C#), clean architecture e contract-first, a partir das tarefas da sprint.

| Campo | Valor |
|---|---|
| Stream | Downstream (`downstream`) |
| Camada | `L2-phase` |
| Fase | `2a-backend-build` |
| Orçamento de contexto | alto |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/downstream/backend-dotnet.agent.md` |

## O que faz

Downstream: implementa serviços backend em .NET Core (C#), clean architecture e contract-first, a partir das tarefas da sprint.

## Quando entra

- Recebe o trabalho de: [@sprint-runner](sprint-runner.md).
- Entrega para: [@reviewer](reviewer.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`lang-dotnet`](skills.md#lang-dotnet): Boas práticas da linguagem C# / .NET 8+ — idiomas modernos, nullable refs, async/await, DI, testes e observabilidade.
- [`arch-hexagonal`](skills.md#arch-hexagonal): Arquitetura Hexagonal (Ports & Adapters) — estrutura de pastas, regras de dependência, adaptadores e fitness functions.
- [`openapi-governance`](skills.md#openapi-governance): Padrões e governança para contratos OpenAPI — versionamento, lint, breaking change detection, geração de SDK, modelos C4 (4 níveis) e diagramas de sequência.
- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).
- [`integration-testing`](skills.md#integration-testing): Padrão profundo de testes integrados — Testcontainers para infra real, contract testing entre serviços (Pact + OpenAPI), E2E API/UI, ambiente isolado por PR, observabilidade dos próprios testes.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.
- [`workflow-memory`](skills.md#workflow-memory): Sistema de memória cross-task para agentes downstream.
- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.

## O que recebe

- `.github/artifacts/sprint-backlog.yaml`
- `api/openapi.yaml`
- `features/**/*.feature`

## O que produz

- `code/services/<service>/**`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Endpoints implementam OpenAPI sem desvio
- Unit tests (xUnit) cobrem regras de domínio
- dotnet build/test verde, analisador estático limpo
- Sem CVE crítico
- task-backend.md atualizado com decisões, arquivos tocados e aprendizados
- Padrões novos descobertos promovidos ao SHARED.md

## Regras de proteção

- Não mudar OpenAPI sem escalar ao @architecture
- Não criar pipeline
- Não escrever step defs

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
