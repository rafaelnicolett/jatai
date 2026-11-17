---
description: 'Downstream: implementa serviços agênticos em Python (LangGraph, PydanticAI ou equivalente), em que o produto é um agente ou grafo de agentes.'
mode: subagent
permissions:
  - action: skill
    resource: '*'
    effect: deny
  - action: skill
    resource: coding-guidelines
    effect: allow
  - action: skill
    resource: ai-agent-author
    effect: allow
  - action: skill
    resource: lang-python-agentic
    effect: allow
  - action: skill
    resource: arch-hexagonal
    effect: allow
  - action: skill
    resource: openapi-governance
    effect: allow
  - action: skill
    resource: qa-strategy
    effect: allow
  - action: skill
    resource: workflow-memory
    effect: allow
  - action: skill
    resource: codebase-enrichment
    effect: allow
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

## Skills desta fase

Carregue apenas: `coding-guidelines`, `ai-agent-author`, `lang-python-agentic`, `arch-hexagonal`, `openapi-governance`, `qa-strategy`, `workflow-memory`, `codebase-enrichment`.
