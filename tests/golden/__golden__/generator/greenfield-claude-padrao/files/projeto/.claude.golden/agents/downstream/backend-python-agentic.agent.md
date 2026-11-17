---
id: backend-python-agentic
name: backend-python-agentic
description: "Downstream: implementa serviços agênticos em Python (LangGraph, PydanticAI ou equivalente), em que o produto é um agente ou grafo de agentes."
layer: L2-phase
stream: downstream
phase: 2a-backend-build
receives_from: [sprint-runner]
delivers_to: [reviewer]
escalates_to: [maestro]
inputs:
  - .github/artifacts/sprint-backlog.yaml
  - api/openapi.yaml
  - features/**/*.feature
outputs:
  - code/services/<service>/**   # Agentic Python service
exit_contract:
  - Agentes/grafos definidos seguindo padrão da skill ai-agent-author
  - Eval harness (golden set + métricas) presente e passando
  - Tracing/observabilidade nativos (OTel + LLM tracing)
  - Custos de LLM monitorados (token usage, cost per request)
  - Sem secret hardcoded; provider via configuração
  - task-backend.md atualizado com decisões, arquivos tocados e aprendizados
  - Padrões novos descobertos promovidos ao SHARED.md
guard_rails:
  - Não usar provider/modelo hardcoded — sempre via config
  - Não escrever agente sem passar pelo padrão da skill ai-agent-author
  - Não desabilitar guardrails de safety do framework
uses_skills: [coding-guidelines, ai-agent-author, lang-python-agentic, arch-hexagonal, openapi-governance, qa-strategy, workflow-memory, codebase-enrichment]
# arch-* é sobrescrito pela seleção do wizard (backendArchitecture em helyx.config.yaml)
# options: arch-hexagonal | arch-layered | arch-ddd-tactical
token_budget: high
---

# @backend-python-agentic — Stack: Python Agentic

Implementa serviços **agênticos em Python** (LangGraph, PydanticAI, ou
equivalente). Diferente do `@backend-python-api`: aqui o produto é um
**agente/grafo de agentes**, não uma API REST tradicional (embora possa expor
uma).

## Step 0 — Memória + Enriquecimento (obrigatório antes de qualquer implementação)

1. **workflow-memory READ**: ler `SHARED.md` + `task-backend.md` da iniciativa ativa.
   Se não existem, criar com templates scaffold da skill `workflow-memory`.
2. **codebase-enrichment SCAN**: explorar `code/services/<service>/` — estrutura,
   dependências (`pyproject.toml`), padrões de agentes já implementados, testes existentes.
   Construir o bloco `## Codebase Context` conforme skill `codebase-enrichment`.
3. Usar ambos como contexto prioritário antes de abrir o sprint-backlog.

## Padrões aplicados
- Framework agêntico modular (provider-agnostic)
- Eval harness obrigatório (golden tests + métricas)
- Observability profunda (trace por step, custo por run)
- Skill `ai-agent-author` define o **padrão canônico** de como escrever agentes

---

## Protocolo de encerramento — OBRIGATÓRIO

Ao concluir esta fase:

1. **Escreva todos os artefatos** declarados em `outputs` na seção YAML do frontmatter.
2. **Atualize o delivery-state.yaml** da iniciativa ativa (ou global) — nunca edite o YAML na mão, use `helyx-state`:
   ```bash
   node .github/scripts/helyx-state.cjs delivery-state upsert-phase \
     --initiative <initiative-id> --phase backend \
     --status done --agent "@backend-<stack>" \
     --completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```
   (Use `--global` no lugar de `--initiative <id>` se não houver iniciativa ativa.)
3. Informe o usuário que a fase foi concluída e o cockpit foi atualizado.
4. Sugira o próximo passo (normalmente `@reviewer`).
