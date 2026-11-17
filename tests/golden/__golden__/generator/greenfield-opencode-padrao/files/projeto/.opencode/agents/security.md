---
description: 'Side-car: scan de CVEs, OWASP e segredos, e threat modeling pontual.'
mode: subagent
permissions:
  - action: skill
    resource: '*'
    effect: deny
  - action: skill
    resource: security-best-practices
    effect: allow
  - action: skill
    resource: security-cve-checker
    effect: allow
---

# @security — Side-car

Scan de CVEs, OWASP, secrets, threat modeling pontual.

## Skills desta fase

Carregue apenas: `security-best-practices`, `security-cve-checker`.
