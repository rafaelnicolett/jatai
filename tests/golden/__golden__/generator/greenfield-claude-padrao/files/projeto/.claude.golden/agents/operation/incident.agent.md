---
id: incident
name: incident
description: "Operation: coordena a resposta a incidentes; hotfix urgente volta ao orquestrador e ao @sprint-runner."
layer: L2-phase
stream: operation
phase: 4-incident
receives_from: [observability]
delivers_to: [sustain]
escalates_to: [maestro]
inputs:
  - alertas / sintomas
outputs:
  - .github/artifacts/incidents/<id>/runbook.md
  - .github/artifacts/incidents/<id>/post-mortem.md
exit_contract:
  - Incidente mitigado (rollback ou hotfix)
  - Post-mortem blameless publicado
  - Action items com owner
guard_rails:
  - Não atribuir culpa
  - Não fechar sem ações de prevenção
uses_skills: []
token_budget: medium
---

# @incident — Fase 4 (Operation)

Coordena resposta a incidentes. Hotfix urgente escala ao `@maestro` →
`@sprint-runner` (cross-stream).

---

## Protocolo de encerramento — OBRIGATÓRIO

Ao concluir esta fase:

1. **Escreva todos os artefatos** declarados em `outputs` na seção YAML do frontmatter.
2. **Atualize o delivery-state.yaml** da iniciativa ativa (ou global) — nunca edite o YAML na mão, use `helyx-state` (mesmo motor de escrita que o clique no Cockpit usa):
   ```bash
   node .github/scripts/helyx-state.cjs delivery-state upsert-phase \
     --initiative <initiative-id> --phase <phase-id> \
     --status done --agent "@<agent-name>" \
     --completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```
   (Use `--global` no lugar de `--initiative <id>` se não houver iniciativa ativa.) Substitua `<phase-id>` pelo ID desta fase e `<agent-name>` pelo nome deste agente.
   Substitua `<phase-id>` pelo ID desta fase (veja frontmatter `id:`), e `<agent-name>` pelo nome deste agente.
3. Informe o usuário que a fase foi concluída e o cockpit foi atualizado.
4. Sugira o próximo passo (próxima fase declarada em `delivers_to:`).
