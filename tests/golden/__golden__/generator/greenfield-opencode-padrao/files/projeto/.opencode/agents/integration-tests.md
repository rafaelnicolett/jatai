---
description: 'Side-car: roda a suíte de ponta a ponta e os contract tests entre serviços quando backend e frontend fecham uma onda.'
mode: subagent
permissions:
  - action: skill
    resource: '*'
    effect: deny
  - action: skill
    resource: integration-testing
    effect: allow
  - action: skill
    resource: qa-strategy
    effect: allow
---

# @integration-tests — Side-car

Roda suíte ponta-a-ponta quando back+front fecham. Contract tests entre
serviços via OpenAPI.

## Skills desta fase

Carregue apenas: `integration-testing`, `qa-strategy`.
