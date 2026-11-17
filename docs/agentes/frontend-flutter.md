<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @frontend-flutter

> Downstream: implementa apps multiplataforma em Flutter, clean architecture com Riverpod ou Bloc.

| Campo | Valor |
|---|---|
| Stream | Downstream (`downstream`) |
| Camada | `L2-phase` |
| Fase | `2b-frontend-build` |
| Orçamento de contexto | alto |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/downstream/frontend-flutter.agent.md` |

## O que faz

Downstream: implementa apps multiplataforma em Flutter, clean architecture com Riverpod ou Bloc.

## Quando entra

- Recebe o trabalho de: [@sprint-runner](sprint-runner.md).
- Entrega para: [@reviewer](reviewer.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`lang-flutter`](skills.md#lang-flutter): Boas práticas de Dart 3 + Flutter — null-safety, freezed, gerenciamento de estado, testes e performance.
- [`arch-clean-frontend`](skills.md#arch-clean-frontend): Clean Architecture para frontend — Data/Domain/Presentation em camadas com inversão de dependência.
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

- Widgets implementam features; cliente OpenAPI gerado e usado
- Unit + widget tests no threshold
- dart analyze sem erros; format ok
- Golden tests para widgets críticos
- task-frontend.md atualizado com decisões, arquivos tocados e aprendizados
- Padrões novos descobertos promovidos ao SHARED.md

## Regras de proteção

- Não mudar OpenAPI sem escalar
- Não escrever testes integration end-to-end (é do @qa-tester)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
