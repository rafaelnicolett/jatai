---
id: maturity-iso-25010
name: maturity-iso-25010
type: skill
description: >
  ISO/IEC 25010:2011 — Qualidade de produto de software em 8 características
  × 31 sub-características. Tier: Mid. Avaliação técnica formal.
applicable_to:
  - "@maturity-assessor"
framework_id: iso-25010
tier: mid
inputs:
  - quality-report.md
  - security-report.md
  - coverage-gaps.md
  - openapi.yaml
  - performance benchmarks (se houver)
outputs:
  - maturity-iso-25010.md (radar por característica)
---

# Skill: maturity-iso-25010

> **Modelo de qualidade de produto** — ISO/IEC 25010:2011 (SQuaRE family).

## 1. As 8 características

| # | Característica | Foco |
|---|---|---|
| 1 | **Functional Suitability** | Faz o que precisa? |
| 2 | **Performance Efficiency** | Faz com eficiência de recursos? |
| 3 | **Compatibility** | Convive bem com outros sistemas? |
| 4 | **Usability** | É usável? |
| 5 | **Reliability** | Funciona quando preciso? |
| 6 | **Security** | Está protegido? |
| 7 | **Maintainability** | É mantível? |
| 8 | **Portability** | É portável? |

## 2. Sub-características (31)

| Característica | Sub-características |
|---|---|
| Functional Suitability | Completeness · Correctness · Appropriateness |
| Performance Efficiency | Time behaviour · Resource utilization · Capacity |
| Compatibility | Co-existence · Interoperability |
| Usability | Appropriateness recognizability · Learnability · Operability · UI aesthetics · Accessibility · User error protection |
| Reliability | Maturity · Availability · Fault tolerance · Recoverability |
| Security | Confidentiality · Integrity · Non-repudiation · Accountability · Authenticity |
| Maintainability | Modularity · Reusability · Analysability · Modifiability · Testability |
| Portability | Adaptability · Installability · Replaceability |

## 3. Scoring

| Score | Significado |
|---|---|
| 0 | Não atende / evidência ruim |
| 1 | Atende minimamente |
| 2 | Atende adequadamente |
| 3 | Atende fortemente |
| 4 | Atende com excelência mensurável |

`score(característica) = avg(sub-características)`

## 4. Fontes de evidência

| Característica | Fonte |
|---|---|
| Functional Suitability | BDD scenarios + acceptance tests + UAT logs |
| Performance Efficiency | Benchmarks, load tests, profiling |
| Compatibility | Contract tests + OpenAPI versioning + integration tests |
| Usability | A11y audit (axe), UX research, NPS, task success rate |
| Reliability | DORA MTTR + uptime SLO + chaos engineering |
| Security | OWASP SAMM/ASVS + CVE scans + pentest |
| Maintainability | code-quality-audit (CC, hotspots, duplication) + cobertura |
| Portability | IaC declarativa + 12-factor compliance + container fitness |

## 5. Output

```markdown
# ISO/IEC 25010 — Quality Scorecard

**Score global**: 2.3 / 4

## Radar
| Característica | Score | Pontos fortes | Pontos fracos |
| Functional Suitability | 3.0 | BDD cobertura alta | poucos cenários edge |
| Performance Efficiency | 1.5 | sem load test | latência p95 desconhecida |
| Compatibility | 2.0 | OpenAPI versionado | sem contract tests |
| Usability | 1.0 | — | sem A11y, UX research ausente |
| Reliability | 2.5 | MTTR < 1h | sem chaos engineering |
| Security | 2.0 | secrets em vault, SAST | TLS 1.0 ainda ativo |
| Maintainability | 2.5 | modular, cobertura 68% | god classes em 3 módulos |
| Portability | 3.0 | IaC + 12-factor + Docker | — |

## Detalhe — Usability (1.0) — gap crítico
- Accessibility: sem audit (gap WCAG)
- User error protection: msgs de erro genéricas, sem inline validation
- Learnability: sem onboarding flow

## Recomendações priorizadas
1. Implementar load tests (Performance Efficiency)
2. A11y audit + correções WCAG AA (Usability)
3. Contract tests entre serviços (Compatibility)
```

## 6. Anti-padrões

- ❌ Pontuar tudo igual ("score 2 em geral") sem análise por sub-característica
- ❌ Ignorar Usability porque "é técnico" (afeta valor entregue)
- ❌ Buscar 4/4 em tudo (overengineering — priorize por contexto)
