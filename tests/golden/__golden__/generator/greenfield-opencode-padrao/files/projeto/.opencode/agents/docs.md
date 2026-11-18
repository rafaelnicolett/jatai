---
description: 'Side-car: mantém docs, ADRs e CHANGELOG sincronizados com os artefatos versionados.'
mode: subagent
permissions:
  - action: skill
    resource: '*'
    effect: deny
  - action: skill
    resource: docs-writer
    effect: allow
---

# @docs — Side-car

Mantém docs, ADRs e CHANGELOG sincronizados com os artefatos versionados.

## Skills desta fase

Carregue apenas: `docs-writer`.
