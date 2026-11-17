---
id: maturity-space-devex
name: maturity-space-devex
type: skill
description: >
  SPACE Framework (Forsgren, Storey, Maddila, Zimmermann, Houck — Microsoft
  Research 2021) — produtividade de devs em 5 dimensões: Satisfaction,
  Performance, Activity, Communication, Efficiency. Tier: Mid.
applicable_to:
  - "@maturity-assessor"
framework_id: space-devex
tier: mid
inputs:
  - métricas de atividade (commits, PRs, code reviews) — git
  - métricas de fluxo (Lead Time, WIP) — DORA / tracker
  - tempo de build, CI, feedback loops — CI/CD logs
  - entrevista de satisfação (NPS dev, friction points)
outputs:
  - maturity-space-devex.md por dimensão com 2-3 métricas cada
---

# Skill: maturity-space-devex

> **Produtividade de devs não é uma métrica única.**
> SPACE = 5 dimensões + 3 níveis de análise (individual, time, sistema).

## 1. As 5 dimensões

| Dimensão | Pergunta |
|---|---|
| **S — Satisfaction & well-being** | Devs estão satisfeitos? Burnout? |
| **P — Performance** | Outcome entregue tem qualidade? |
| **A — Activity** | O que está sendo feito? |
| **C — Communication & collaboration** | Como o time interage? |
| **E — Efficiency & flow** | Fluxo sem fricção? |

## 2. Princípio fundamental

> Sempre meça em **múltiplas dimensões** simultaneamente. Métrica única
> incentiva gaming.
> Ex: medir só Activity (commits/dia) leva a commits vazios.

## 3. Métricas sugeridas (por dimensão)

### Satisfaction
- eNPS (developer NPS) — entrevista
- Burnout symptoms — survey periódica
- Retention rate
- Tooling satisfaction

### Performance
- Quality of code (defect density, CFR)
- Customer satisfaction (NPS produto)
- Reliability (SLO atingimento)
- Reviews aprovadas sem ressalvas / total

### Activity
- Commits / PRs / reviews por período
- LOC / pontos de história (com cuidado)
- Story completion rate

### Communication
- PR review time
- Cross-team PRs (silo breakdown)
- Documentation freshness (docs vs. código)
- Sync vs. async ratio

### Efficiency
- Lead Time (DORA)
- Code review cycle time
- Build/CI duration (p50/p95)
- Context switches/dia
- Time to first commit (onboarding)

## 4. Níveis de análise

| Nível | Use para |
|---|---|
| **Individual** | Coaching 1:1 (NUNCA performance review) |
| **Time** | Health do time, retros, melhoria contínua |
| **Sistema** | Investimento em platform, tooling |

⚠️ **Nunca** use métricas individuais para avaliação de performance ou ranking.

## 5. Fontes automatizadas

| Métrica | Fonte |
|---|---|
| PR review time | git/GitHub API: PR created → merged |
| Build duration | CI logs (GitHub Actions, GitLab) |
| Commits/PRs | git log |
| Lead Time | DORA collector |
| Docs freshness | last_commit(docs/) vs last_commit(code/) por módulo |
| Cross-team PRs | reviewers vs. commiter team mapping |

Satisfaction → exige survey/entrevista.

## 6. Output

```markdown
# SPACE — Developer Experience Report

**Período**: últimos 90 dias
**Time avaliado**: nível Time (não individual)

## Por dimensão
### S — Satisfaction (não medido)
- ⚠️ Sem survey nos últimos 6 meses — recomenda-se rodar eNPS
- Sinais indiretos: 2 turnovers em 90 dias (acima da média de 1%)

### P — Performance
- CFR: 12% (categoria High)
- SLO atingimento: 99.2% / target 99.5% (NEGATIVO)
- PR approval sem ressalvas: 68%

### A — Activity
- 412 commits / 84 PRs / 156 reviews
- Story completion: 87%

### C — Communication
- PR review time p50: 6 horas (✅)
- PR review time p95: 38 horas (⚠️)
- Cross-team PRs: 8% (alto silo — esperado 15-25%)
- Docs staleness: 14% dos módulos com docs >180 dias atrás de código

### E — Efficiency
- Lead Time p50: 3.4 dias
- Build duration p50: 4min · p95: 12min
- CI flaky test rate: 7% (acima de 2% saudável)

## Top fricção
1. CI flaky tests (E) — perda de ~30min/dev/dia
2. PR review p95 alto (C) — pode estar atrelado a god classes
3. Silo de comunicação (C) — promover guildas/pair

## Recomendações
1. Quarantine flaky tests + investigar root cause
2. PR templates + size limits (< 400 LOC)
3. Rodar eNPS para validar satisfação
```

## 7. Anti-padrões

- ❌ Usar SPACE individual para avaliação de pessoas
- ❌ Reportar só uma dimensão (gaming garantido)
- ❌ Métrica de Activity como meta (commits vazios, PRs artificiais)
- ❌ Confundir SPACE com DORA (DORA = entrega; SPACE = produtividade do dev)
