---
id: batedor
name: batedor
description: "Discovery: mapeia o repositório e entrega o inventário ao orquestrador. Só lê."
layer: L2-phase
stream: discovery
scope: repo
phase: 1a-mapeamento
receives_from: [maestro]
delivers_to: [construtor]
escalates_to: [velho]
inputs:
  - {{brand.files.config}}
  - "repos/<repo-id>/**"
outputs:
  - .github/artifacts/assessment/batedor.md
exit_contract:
  - "Inventário gravado antes de passar adiante"
guard_rails:
  - "Nunca escreva em repos/"
uses_skills:
  - alfa
  - convencoes-<repo-id>
token_budget: low
---

# @batedor

Texto do corpo, que o catálogo não lê.
