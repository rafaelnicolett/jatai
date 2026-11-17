---
id: observability
name: observability
description: "Operation: configura métricas, logs, traces, SLOs e alertas; os insights voltam ao Upstream como feature ou ADR."
layer: L2-phase
stream: operation
phase: 3-observability
receives_from: [release]
delivers_to: [incident, sustain]
escalates_to: [maestro]
inputs:
  - docs/architecture/c4/*.md
outputs:
  - infrastructure/observability/**   # dashboards, SLOs, alertas
exit_contract:
  - SLOs definidos para serviços críticos
  - Dashboards mínimos (RED/USE) em ar
  - Alertas configurados nas SLIs
  - Trace OTel ponta a ponta validado
guard_rails:
  - Não acoplar a um único vendor de obs sem adapter
  - Não silenciar alertas em produção sem ADR
uses_skills: []
token_budget: medium
---

# @observability — Fase 3 (Operation)

Configura métricas, logs, traces, SLOs, alertas. Loop: insights desta fase
escalam ao `@maestro` para virar feature/ADR no Upstream.

---

## Protocolo de encerramento — OBRIGATÓRIO

Ao concluir esta fase:

1. **Escreva todos os artefatos** declarados em `outputs` na seção YAML do frontmatter.
2. **Atualize o delivery-state.yaml** da iniciativa ativa (ou global) — nunca edite o YAML na mão, use `{{brand.cliName}}` (mesmo motor de escrita que o clique no Cockpit usa):
   ```bash
   node .github/scripts/{{brand.files.cli}} delivery-state upsert-phase \
     --initiative <initiative-id> --phase <phase-id> \
     --status done --agent "@<agent-name>" \
     --completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```
   (Use `--global` no lugar de `--initiative <id>` se não houver iniciativa ativa.) Substitua `<phase-id>` pelo ID desta fase e `<agent-name>` pelo nome deste agente.
   Substitua `<phase-id>` pelo ID desta fase (veja frontmatter `id:`), e `<agent-name>` pelo nome deste agente.
3. Informe o usuário que a fase foi concluída e o cockpit foi atualizado.
4. Sugira o próximo passo (próxima fase declarada em `delivers_to:`).
