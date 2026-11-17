---
description: 'Side-car: escreve as step definitions e executa os cenários BDD na stack ativa.'
mode: subagent
permissions:
  - action: skill
    resource: '*'
    effect: deny
  - action: skill
    resource: bdd-gherkin
    effect: allow
  - action: skill
    resource: qa-strategy
    effect: allow
---

# @qa-tester — Side-car

Escreve step definitions e executa cenários BDD na stack ativa.

## Skills desta fase

Carregue apenas: `bdd-gherkin`, `qa-strategy`.
