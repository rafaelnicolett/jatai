---
id: maturity-bsimm
name: maturity-bsimm
type: skill
description: >
  BSIMM (Building Security In Maturity Model) — modelo descritivo (não
  prescritivo) baseado em observação de práticas em empresas reais. 12
  practices × 4 domains. Tier: Heavyweight (Enterprise).
applicable_to:
  - "@maturity-assessor"
framework_id: bsimm
tier: heavyweight
inputs:
  - políticas de segurança escritas
  - composição do SSG (Security Steering Group)
  - métricas e tooling de segurança
  - dados de treinamento, threat modeling, code review
outputs:
  - maturity-bsimm.md (12 practices scorecard + comparação com benchmark)
---

# Skill: maturity-bsimm

> **Descritivo, não prescritivo** — BSIMM diz "o que empresas fazem", não
> "o que você deve fazer". Baseado em 100+ empresas observadas. Synopsys/Cigital.

## 1. Estrutura

```
4 Domains × 12 Practices × 121 Activities
```

## 2. Domains e Practices

### Governance
1. **Strategy & Metrics (SM)**
2. **Compliance & Policy (CP)**
3. **Training (T)**

### Intelligence
4. **Attack Models (AM)**
5. **Security Features & Design (SFD)**
6. **Standards & Requirements (SR)**

### SSDL Touchpoints
7. **Architecture Analysis (AA)**
8. **Code Review (CR)**
9. **Security Testing (ST)**

### Deployment
10. **Penetration Testing (PT)**
11. **Software Environment (SE)**
12. **Configuration Management & Vulnerability Management (CMVM)**

## 3. Activities por Practice

Cada practice tem ~10 activities, agrupadas em 3 níveis de maturidade:

| Level | Característica |
|---|---|
| **Level 1** | Práticas básicas que a maioria das empresas faz |
| **Level 2** | Práticas intermediárias, focadas em melhoria contínua |
| **Level 3** | Práticas avançadas, requerem alto investimento |

Exemplos:
- **SM1.4** — Identify gate locations, gather necessary artifacts
- **CR1.4** — Use automated code review tools
- **ST2.4** — Share security results with QA
- **CMVM3.4** — Operate a bug bounty program

## 4. Scoring

```
Para cada activity: implemented (1) / not implemented (0)
score(practice) = sum(implemented activities) / total activities da practice
score(domain) = avg(practice_scores)
```

## 5. Comparação com benchmark (BSIMM-N report)

BSIMM publica anualmente o "Earth chart" — média da indústria por activity.

**Comparar sua organização vs:**
- Média geral
- Média do seu vertical (FinTech, HealthTech, Tech, etc.)
- Top quartile

## 6. Fontes de evidência

| Practice | Evidência |
|---|---|
| SM | SSG documentado, dashboard de métricas, security in roadmap |
| CP | Política escrita, treinamento de compliance, audit trail |
| T | Plano de treinamento, % devs treinados, security champions |
| AM | Threat models por aplicação, attack pattern library |
| SFD | Patterns reutilizáveis (auth, crypto), security frameworks |
| SR | Standards documentados (ASVS mapping, NIST), enforcement |
| AA | Arquitetura revisada por segurança, threat model em design |
| CR | SAST em pipeline, manual code review com checklist |
| ST | DAST/IAST, fuzz tests, abuse cases nos testes |
| PT | Pentest periódico externo, retest após fixes |
| SE | Hardening baseline, secrets management, network segmentation |
| CMVM | Vulnerability tracking, bug bounty, incident response |

## 7. Output

```markdown
# BSIMM — Security Maturity (Descriptive)

**Activities implementadas**: 34 / 121 (28%)
**Comparação com vertical (FinTech avg)**: -18% (abaixo da média)

## Por Domain
| Domain | Score | vs. Benchmark |
| Governance | 0.30 | -25% (gap em Training) |
| Intelligence | 0.18 | -40% (sem AM, SFD light) |
| SSDL Touchpoints | 0.45 | +5% (CR e ST acima da média) |
| Deployment | 0.42 | -10% (sem bug bounty, CMVM básico) |

## Practices fortes (>= benchmark)
- **CR (Code Review)** · 0.62 · SAST automatizado + manual review
- **ST (Security Testing)** · 0.55 · DAST + integration security tests

## Practices fracas (gap significativo)
- **AM (Attack Models)** · 0.10 · Sem catálogo de attack patterns
- **T (Training)** · 0.20 · Sem plano formal, sem security champions
- **SFD (Security Features & Design)** · 0.15 · Sem patterns reutilizáveis

## Top activities para implementar (quick wins)
1. **SM1.4** — Definir security gates no SDLC
2. **T1.1** — Conduct awareness training
3. **AM1.2** — Create a data classification scheme
4. **SE2.4** — Use code signing for production artifacts

## Roadmap sugerido (12 meses)
- **Q1**: Governance (SM, CP, T) — base do programa
- **Q2-Q3**: Intelligence (AM, SFD, SR) — fundação técnica
- **Q4**: Avançar SSDL Touchpoints + Deployment para Level 2/3
```

## 8. Anti-padrões

- ❌ Tratar BSIMM como prescritivo ("vamos implementar todas as 121")
- ❌ Comparar sem normalizar vertical/tamanho
- ❌ Inflacionar score (auto-avaliação otimista)
- ❌ Confundir com SAMM (SAMM = prescritivo/genérico; BSIMM = descritivo/benchmark)
