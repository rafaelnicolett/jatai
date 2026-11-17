---
id: maturity-dora-4keys
name: maturity-dora-4keys
type: skill
description: >
  DORA Four Keys — métricas canônicas de performance de entrega (Deployment
  Frequency, Lead Time for Changes, Change Failure Rate, MTTR). Tier:
  Lightweight. Coleta automatizada via git + CI/CD logs.
applicable_to:
  - "@maturity-assessor"
framework_id: dora-4keys
tier: lightweight
inputs:
  - histórico git (commits, tags, PRs mergeados)
  - logs/runs de CI/CD (build status, deploy timestamps)
  - sistema de incidentes (incidents, MTTR records)
outputs:
  - maturity-dora.md com 4 métricas + categoria (Elite/High/Medium/Low)
---

# Skill: maturity-dora-4keys

> **4 métricas que predizem performance organizacional** — Forsgren, Humble,
> Kim (Accelerate, 2018).

## 1. As 4 métricas

| Métrica | Pergunta | Como medir |
|---|---|---|
| **Deployment Frequency** | Com que frequência você implanta em produção? | Contagem de deploys/dia ou /semana (tags ou GitHub Releases ou CD logs) |
| **Lead Time for Changes** | Quanto tempo entre commit e produção? | Média p50/p95 de `commit_ts → deploy_ts` |
| **Change Failure Rate** | % de deploys que causaram falha em produção? | (rollbacks + hotfixes + incidents) / total deploys |
| **MTTR** (Mean Time to Restore) | Quanto tempo para restaurar após incidente? | Média de `incident_open_ts → incident_closed_ts` |

## 2. Categorias (State of DevOps Report 2023)

| Categoria | Deploy Freq | Lead Time | CFR | MTTR |
|---|---|---|---|---|
| **Elite** | On-demand (várias/dia) | < 1 dia | 0-5% | < 1 hora |
| **High** | Diário a semanal | 1 dia a 1 semana | 0-15% | < 1 dia |
| **Medium** | Semanal a mensal | 1 sem a 1 mês | 0-30% | < 1 dia |
| **Low** | Mensal+ | > 1 mês | 16-30% | > 1 semana |

## 3. Fontes de evidência (em ordem de preferência)

1. **Tags semver / releases** → deploy frequency
2. **CI/CD logs** (GitHub Actions, GitLab, Jenkins) → deploy timestamps + status
3. **Git log + PR merge dates** → lead time
4. **Issue tracker** (label `incident`, `hotfix`) → CFR + MTTR
5. **Observability** (Sentry, Datadog) → MTTR real

## 4. Algoritmo de coleta (últimos 90 dias)

```
window = last 90 days
deploys = git tag --list 'v*' --sort=-creatordate | filter(in window)
deploy_freq = count(deploys) / weeks_in_window

for pr in merged_prs_in_window:
  lead_time[pr] = first_deploy_after(pr.merge_ts).ts - pr.first_commit_ts
lead_time_p50 = percentile(lead_time, 50)
lead_time_p95 = percentile(lead_time, 95)

failed_deploys = deploys.filter(rollback OR hotfix-followup OR incident-triggered)
cfr = failed_deploys / deploys

mttr = avg(incident.closed_ts - incident.opened_ts) for incidents in window
```

## 5. Output

```markdown
# DORA 4 Keys — Maturity Report

**Período**: 2026-02-19 a 2026-05-19 (90 dias)
**Categoria geral**: 🟡 **Medium**

| Métrica | Valor | Categoria | Evidência |
| Deployment Frequency | 1.2 / dia | Elite | 108 tags em 90d |
| Lead Time (p50) | 3.4 dias | High | 84 PRs analisados |
| Lead Time (p95) | 11 dias | Medium | outliers em DB migrations |
| Change Failure Rate | 18% | Medium | 19 rollbacks/hotfixes em 108 |
| MTTR | 4.2 horas | High | 14 incidentes |

## Gaps para chegar a Elite
- Reduzir CFR < 5%: investigar incidentes recorrentes (top 3: DB schema, env config, auth)
- Reduzir Lead Time p95: paralelizar migrations, dividir PRs grandes
- Manter Deploy Freq + MTTR atuais

## Recomendações priorizadas
1. Adotar feature flags (reduz CFR)
2. Trunk-based + PR pequenos (reduz Lead Time p95)
3. Automatizar rollback (reduz MTTR ainda mais)
```

## 6. Anti-padrões

- ❌ Medir só Deploy Frequency (incentiva deploys vazios)
- ❌ Ignorar CFR (deploys frequentes com falha alta = pior que infrequente)
- ❌ Comparar entre times sem normalizar contexto (criticidade, regulação)
- ❌ Usar DORA como métrica de produtividade individual
