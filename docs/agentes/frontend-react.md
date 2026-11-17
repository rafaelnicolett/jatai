<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @frontend-react

> Downstream: implementa o front em React, Vite e TypeScript, com server state separado e design tokens.

| Campo | Valor |
|---|---|
| Stream | Downstream (`downstream`) |
| Camada | `L2-phase` |
| Fase | `2b-frontend-build` |
| Orçamento de contexto | alto |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/downstream/frontend-react.agent.md` |

## O que faz

Downstream: implementa o front em React, Vite e TypeScript, com server state separado e design tokens.

## Quando entra

- Recebe o trabalho de: [@sprint-runner](sprint-runner.md).
- Entrega para: [@reviewer](reviewer.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`lang-react`](skills.md#lang-react): Boas práticas de React + Vite + TypeScript — idiomas, componentes, estado, forms, testes e performance.
- [`arch-feature-based`](skills.md#arch-feature-based): Arquitetura Feature-Based para frontend — co-localização por feature, shared/ com regras estritas, sem camadas horizontais globais.
- [`openapi-governance`](skills.md#openapi-governance): Padrões e governança para contratos OpenAPI — versionamento, lint, breaking change detection, geração de SDK, modelos C4 (4 níveis) e diagramas de sequência.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.
- [`ui-ux-design-system`](skills.md#ui-ux-design-system): Padrão canônico de UI/UX para agentes @frontend-*.
- [`workflow-memory`](skills.md#workflow-memory): Sistema de memória cross-task para agentes downstream.
- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.

## O que recebe

- `.github/artifacts/sprint-backlog.yaml`
- `api/openapi.yaml`
- `features/**/*.feature`

## O que produz

- `code/apps/<app>/**`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Componentes implementam features e consomem OpenAPI via SDK gerado
- Unit + component tests (Vitest + RTL) no threshold
- eslint + tsc sem erros
- A11y: sem violations críticas
- task-frontend.md atualizado com decisões, arquivos tocados e aprendizados
- Padrões novos descobertos promovidos ao SHARED.md

## Regras de proteção

- Não mudar contrato OpenAPI sem escalar ao @architecture
- Não acoplar a um design system específico de empresa
- Não escrever testes E2E (é do @qa-tester)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
