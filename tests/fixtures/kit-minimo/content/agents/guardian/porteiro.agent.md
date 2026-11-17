---
id: porteiro
name: porteiro
description: "Guardian: confere a coerência de ponta a ponta nos gates de entrada e de saída."
layer: L2-guardian
stream: guardian
invoke_on:
  - gate.upstream_to_downstream
  - gate.downstream_to_operation
receives_from: [maestro]
delivers_to: [maestro]
escalates_to: [maestro]
inputs:
  - api/openapi.yaml
outputs:
  - .github/artifacts/gates/relatorio-do-porteiro.md
exit_contract:
  - "Gate avaliado"
guard_rails:
  - "Só entra em gate"
uses_skills: []
token_budget: medium
---

# @porteiro
