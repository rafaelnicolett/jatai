<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @backend-python-agentic

> Downstream: implementa serviços agênticos em Python (LangGraph, PydanticAI ou equivalente), em que o produto é um agente ou grafo de agentes.

| Campo | Valor |
|---|---|
| Stream | Downstream (`downstream`) |
| Camada | `L2-phase` |
| Fase | `2a-backend-build` |
| Orçamento de contexto | alto |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/downstream/backend-python-agentic.agent.md` |

## O que faz

Downstream: implementa serviços agênticos em Python (LangGraph, PydanticAI ou equivalente), em que o produto é um agente ou grafo de agentes.

## Quando entra

- Recebe o trabalho de: [@sprint-runner](sprint-runner.md).
- Entrega para: [@reviewer](reviewer.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.
- [`ai-agent-author`](skills.md#ai-agent-author): Padrão canônico para escrever agentes de IA dentro do kit e nos projetos gerados (especialmente Python Agentic).
- [`lang-python-agentic`](skills.md#lang-python-agentic): Boas práticas para Python Agentic — LangGraph/PydanticAI, LLM routing, prompts versionados, eval harness, streaming, tool use e observabilidade de agentes.
- [`arch-hexagonal`](skills.md#arch-hexagonal): Arquitetura Hexagonal (Ports & Adapters) — estrutura de pastas, regras de dependência, adaptadores e fitness functions.
- [`openapi-governance`](skills.md#openapi-governance): Padrões e governança para contratos OpenAPI — versionamento, lint, breaking change detection, geração de SDK, modelos C4 (4 níveis) e diagramas de sequência.
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

- Agentes/grafos definidos seguindo padrão da skill ai-agent-author
- Eval harness (golden set + métricas) presente e passando
- Tracing/observabilidade nativos (OTel + LLM tracing)
- Custos de LLM monitorados (token usage, cost per request)
- Sem secret hardcoded; provider via configuração
- task-backend.md atualizado com decisões, arquivos tocados e aprendizados
- Padrões novos descobertos promovidos ao SHARED.md

## Regras de proteção

- Não usar provider/modelo hardcoded — sempre via config
- Não escrever agente sem passar pelo padrão da skill ai-agent-author
- Não desabilitar guardrails de safety do framework

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
