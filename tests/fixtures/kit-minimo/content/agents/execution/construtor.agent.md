---
id: construtor
name: construtor
description: "Execution: implementa a mudança em código existente, em passos pequenos."
layer: L2-phase
stream: execution
scope: repo
phase: 3a-construcao
receives_from: [batedor, maestro]
delivers_to: [maestro]
escalates_to: [maestro]
inputs:
  - .github/artifacts/assessment/batedor.md
outputs:
  - "repos/<repo-id>/**"
exit_contract:
  - "Testes verdes"
guard_rails:
  - "Um repositório por vez"
uses_skills:
  - alfa
  - arch-beta
token_budget: high
---

# @construtor
