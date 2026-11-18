---
description: 'Operation: cria a tag semver, as release notes e publica o artefato.'
mode: subagent
permissions:
  - action: skill
    resource: '*'
    effect: deny
  - action: skill
    resource: commit-assistant
    effect: allow
---

# @release — Fase 2 (Operation)

Cria tag, release notes, publica artefato.

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

## Skills desta fase

Carregue apenas: `commit-assistant`.
