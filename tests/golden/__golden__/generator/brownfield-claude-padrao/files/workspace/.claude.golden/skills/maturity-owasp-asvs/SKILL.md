---
id: maturity-owasp-asvs
name: maturity-owasp-asvs
type: skill
description: >
  OWASP ASVS (Application Security Verification Standard) v4 — checklist de
  verificação de controles de segurança em aplicação, com 3 níveis (L1
  opportunistic, L2 standard, L3 advanced). Tier: Mid.
applicable_to:
  - "@maturity-assessor"
  - "@security-auditor"
framework_id: owasp-asvs
tier: mid
inputs:
  - código fonte (auth, session, input validation, crypto)
  - openapi.yaml (autenticação, autorização)
  - security-report.md
outputs:
  - maturity-owasp-asvs.md com % de cobertura por capítulo + nível
---

# Skill: maturity-owasp-asvs

> **Padrão para o que verificar, não como verificar.**
> ASVS v4.0.3 — 14 capítulos · 286 requirements (a depender do nível).

## 1. Níveis

| Nível | Para quem | Requirements |
|---|---|---|
| **L1 — Opportunistic** | Apps com risco baixo / públicos | ~131 |
| **L2 — Standard** | Apps com dados sensíveis (default) | ~267 |
| **L3 — Advanced** | Apps críticos / alta segurança | ~286 |

> Recomendação: a maior parte dos sistemas business deve mirar **L2**.

## 2. Capítulos (14)

| V | Capítulo |
|---|---|
| V1 | Architecture, Design and Threat Modeling |
| V2 | Authentication |
| V3 | Session Management |
| V4 | Access Control |
| V5 | Validation, Sanitization and Encoding |
| V6 | Stored Cryptography |
| V7 | Error Handling and Logging |
| V8 | Data Protection |
| V9 | Communication |
| V10 | Malicious Code |
| V11 | Business Logic |
| V12 | Files and Resources |
| V13 | API and Web Service |
| V14 | Configuration |

## 3. Algoritmo de verificação

Para cada requirement do nível alvo:

```
status = pass | fail | not_applicable | manual_review_required
evidence = arquivo:linha / commit / config / threat-model
```

### Pass automatizável (exemplos)
- V2.1.1 (passwords ≥ 12 chars) → grep regex de policy em código
- V3.2.1 (session tokens 64 bits entropy) → audit lib de sessão usada
- V4.1.1 (deny by default) → middleware de autorização padrão
- V5.1.5 (URL redirects validation) → search por `redirect(` sem allowlist
- V6.2.1 (algoritmos aprovados) → grep MD5/SHA1/DES
- V9.1.1 (TLS only) → configs nginx/ingress/server.go
- V14.1.4 (sem credenciais em código) → secret scanning

### Manual review (exemplos)
- V1.x — exige threat model
- V11.x — business logic, contexto-dependente

## 4. Output

```markdown
# OWASP ASVS L2 — Coverage Report

**Nível avaliado**: L2 (Standard)
**Requirements**: 267
**Pass**: 142 (53%)
**Fail**: 38 (14%)
**Not Applicable**: 31 (12%)
**Manual Review**: 56 (21%)

## Por capítulo
| V | Capítulo | Pass | Fail | N/A | Manual | % automatizado |
| V1 | Architecture | 0 | 0 | 0 | 12 | manual-only |
| V2 | Authentication | 18 | 4 | 0 | 6 | 64% |
| V3 | Session | 9 | 2 | 0 | 3 | 64% |
| ... |

## Top fails (críticos)
- V2.4.1 — Verify password storage uses approved cryptographic algorithm
  → app/auth.py:45 usa SHA-256 puro (sem bcrypt/argon2)
- V8.1.1 — Verify sensitive data identified at rest
  → schema sem classification; PII em logs (V7.3.4 também)
- V9.1.2 — TLS configuration tested with up-to-date tools
  → nginx.conf permite TLS 1.0

## Recomendações priorizadas
1. Migrar password hash → argon2id (V2.4.1)
2. Classificar campos PII + redact em logs (V8.1.1, V7.3.4)
3. Disable TLS < 1.2 (V9.1.2)
```

## 5. Anti-padrões

- ❌ Mirar L3 para todos os apps (custo desproporcional)
- ❌ Marcar Pass sem evidência rastreável
- ❌ Tratar ASVS como compliance checkbox (use como design guide)
- ❌ Misturar com SAMM (ASVS = verificação de app, SAMM = maturidade do programa)
