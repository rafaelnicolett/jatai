---
id: operador
name: operador
description: "Operation: opera o projeto novo, do pipeline ao release."
layer: L2-phase
stream: operation
phase: 1-pipeline
receives_from: [maestro]
delivers_to: [maestro]
escalates_to: [maestro]
inputs:
  - "code/**"
outputs:
  - "pipelines/**"
exit_contract:
  - "Pipeline verde"
guard_rails:
  - "Sem segredo no código"
uses_skills:
  - alfa
token_budget: medium
---

# @operador
