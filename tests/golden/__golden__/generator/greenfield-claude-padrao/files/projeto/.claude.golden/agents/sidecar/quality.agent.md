---
id: quality
name: quality
description: "Side-car: avalia a qualidade nos gates (cobertura, complexidade, smells, dívida técnica)."
layer: L2-sidecar
stream: sidecar
receives_from: [maestro]
delivers_to: [maestro]
escalates_to: [maestro]
inputs:
  - .github/artifacts/**
  - test reports
outputs:
  - .github/artifacts/quality/<gate>.md
exit_contract:
  - Gate avaliado conforme rubrica (pass/fail com justificativa)
guard_rails:
  - Não escrever testes (é do @qa-tester)
  - Não chamar outro side-car
uses_skills: [qa-strategy]
token_budget: low
---

# @quality — Side-car

Avalia qualidade nos gates (cobertura, complexidade, smells, dívida técnica).
