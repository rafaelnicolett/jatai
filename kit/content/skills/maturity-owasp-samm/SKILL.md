---
id: maturity-owasp-samm
name: maturity-owasp-samm
type: skill
description: >
  OWASP SAMM (Software Assurance Maturity Model) v2.0 — 5 business functions
  × 3 security practices × 3 maturity levels. Tier: Mid (Enterprise-value).
applicable_to:
  - "@maturity-assessor"
framework_id: owasp-samm
tier: mid
inputs:
  - security-report.md (do @security-auditor)
  - pipelines, threat models, secure design docs
  - políticas de incidente e patch management
outputs:
  - maturity-owasp-samm.md (scorecard 15 practices)
---

# Skill: maturity-owasp-samm

> **Modelo prescritivo de maturidade em segurança aplicada a software.**
> OWASP SAMM v2.0 — https://owaspsamm.org/

## 1. Estrutura

```
5 Business Functions × 3 Security Practices = 15 Practices
Cada Practice tem 2 Streams (A e B) × 3 Maturity Levels (1, 2, 3)
```

## 2. As 15 Practices

| Business Function | Practice 1 | Practice 2 | Practice 3 |
|---|---|---|---|
| **Governance** | Strategy & Metrics | Policy & Compliance | Education & Guidance |
| **Design** | Threat Assessment | Security Requirements | Security Architecture |
| **Implementation** | Secure Build | Secure Deployment | Defect Management |
| **Verification** | Architecture Assessment | Requirements-driven Testing | Security Testing |
| **Operations** | Incident Management | Environment Management | Operational Management |

## 3. Maturity Levels

| Level | Significado |
|---|---|
| **0** | Practice não implementada |
| **1** | Compreensão inicial, ad-hoc |
| **2** | Adoção sistemática, parcialmente automatizada |
| **3** | Otimizada, medida, integrada |

Cada level tem **Activities** (o que fazer) e **Quality Criteria** (como saber que tá bom).

## 4. Fontes de evidência (mapeáveis ao repo)

| Practice | Evidência objetiva |
|---|---|
| Secure Build | SAST/SCA em pipeline, builds reproduzíveis |
| Secure Deployment | secrets em vault (não em code), IaC scanning, deploy gates |
| Defect Management | tracking de vulns (issues label `security`), SLA por severidade |
| Security Testing | DAST, pentest reports, fuzz tests |
| Threat Assessment | threat models em `docs/threat-models/`, STRIDE/PASTA |
| Security Requirements | requisitos não-funcionais documentados, ASVS mapping |
| Incident Management | runbooks, post-mortems, alerting on security events |
| Environment Management | hardening baseline, patch SLA, segregação prod/non-prod |

Practices de Governance, Policy, Education → exigem **entrevista**.

## 5. Scoring por Stream

```
score(practice) = avg(stream_A_level, stream_B_level)
score(business_function) = avg(practice_scores)
score(global) = avg(business_function_scores)
```

## 6. Output

```markdown
# OWASP SAMM — Maturity Scorecard

**Score global**: 1.4 / 3 (Iniciante)
**Practices ≥ 2**: 4/15
**Practices = 0**: 6/15

## Por Business Function
| Function | Score | Practice mais forte | Practice mais fraca |
| Governance | 0.5 | Education (1) | Strategy & Metrics (0) |
| Design | 0.7 | Security Requirements (1) | Threat Assessment (0) |
| Implementation | 2.0 | Secure Build (3) | Defect Management (1) |
| Verification | 1.7 | Security Testing (2) | Architecture Assessment (1) |
| Operations | 2.0 | Incident Management (3) | Environment Management (1) |

## Detalhe — Implementation > Secure Build
- Stream A (Build Process): Level 3 — pipeline automatizado, SAST/SCA bloqueante, SBOM gerado
- Stream B (Software Dependencies): Level 3 — Renovate ativo, license check, vulnerability DB

## Detalhe — Design > Threat Assessment
- Stream A (Application Risk Profile): Level 0 — não há classificação de risco
- Stream B (Threat Modeling): Level 0 — sem threat models documentados

## Roadmap recomendado (próximos 6 meses)
1. **Quick wins (L0→L1)**: Strategy & Metrics, Threat Assessment, Architecture Assessment
2. **Consolidações (L1→L2)**: Education, Security Requirements, Defect Management
3. **Próximo nível (L2→L3)**: Security Testing
```

## 7. Anti-padrões

- ❌ Misturar SAMM com ASVS (SAMM = maturidade do programa; ASVS = verificação de app)
- ❌ Pular para L3 sem consolidar L1/L2
- ❌ Auto-avaliar sem evidência (artefato, métrica, processo escrito)
- ❌ Ignorar Governance (mesmo cobrindo Implementation, programa frágil)
