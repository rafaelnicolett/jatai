---
id: operador
name: operador
description: "Operation: opera os repositórios existentes, um por vez, fora das iniciativas."
layer: L2-phase
stream: operation
scope: repo
receives_from: [maestro, construtor]
delivers_to: [maestro]
escalates_to: [maestro]
inputs:
  - .github/artifacts/repos.yaml
outputs:
  - .github/artifacts/operations/devops-status.yaml
exit_contract:
  - "Estado de operação atualizado"
guard_rails:
  - "Um repositório por vez"
uses_skills:
  - alfa
  - maturity-gama
token_budget: medium
---

# @operador
