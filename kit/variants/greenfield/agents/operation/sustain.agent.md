---
id: sustain
name: sustain
description: "Operation: patch de segurança e upgrade de dependências do projeto."
layer: L2-phase
stream: operation
phase: 5-sustain
receives_from: [observability, incident]
delivers_to: []
escalates_to: [maestro]
inputs:
  - dependency snapshot
  - CVE feeds
outputs:
  - PRs de patch / upgrade
exit_contract:
  - CVEs críticos sem fix > N dias = escalation
  - Dependências major > N versões atrás = ADR de upgrade
guard_rails:
  - Não fazer major upgrade sem ADR
  - Não burlar CI
uses_skills: [security-cve-checker]
token_budget: low
---

# @sustain — Fase 5 (Operation)

Patch de segurança e upgrade de dependências.

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
