---
id: maturity-dora-capabilities
name: maturity-dora-capabilities
type: skill
description: >
  DORA 24 Capabilities — práticas técnicas, processuais e culturais que dirigem
  as 4 Keys. Tier: Mid. Self-assessment estruturado com evidência.
applicable_to:
  - "@maturity-assessor"
framework_id: dora-capabilities
tier: mid
inputs:
  - estrutura do repo
  - pipelines/configs de CI/CD
  - práticas de teste, documentação, observabilidade
  - entrevista/self-assessment do time (quando disponível)
outputs:
  - maturity-dora-capabilities.md (radar por capability)
---

# Skill: maturity-dora-capabilities

> **As 24 capacidades que predizem performance** — DORA Research Program.

## 1. As 24 capabilities (5 categorias)

### Continuous Delivery (8)
1. Version control para tudo (código, config, infra)
2. Deployment automation
3. Continuous integration
4. Trunk-based development
5. Test automation
6. Test data management
7. Shift-left on security
8. Continuous delivery (deployable a qualquer momento)

### Architecture (2)
9. Loosely coupled architecture
10. Empowered teams (escolhem ferramentas)

### Product & Process (4)
11. Customer feedback loops
12. Value stream visibility
13. Working in small batches
14. Team experimentation

### Lean Management & Monitoring (5)
15. Change approval process leve (peer review > CAB)
16. Monitoring & observability
17. Proactive failure notification
18. WIP limits
19. Visual management

### Cultural (5)
20. Westrum generative culture
21. Job satisfaction
22. Learning culture
23. Collaboration (Dev↔Ops)
24. Transformational leadership

## 2. Scoring rubric (por capability)

| Score | Significado |
|---|---|
| 0 | Não existe / desconhecido |
| 1 | Adoção parcial / ad-hoc |
| 2 | Adoção sistemática em parte do time/produto |
| 3 | Adoção consistente em toda organização |
| 4 | Otimizado + métrica de melhoria contínua |

## 3. Fontes de evidência (automatizáveis)

| Capability | Evidência objetiva |
|---|---|
| Version control | `.git` em código + IaC + config? |
| Deployment automation | `pipelines/` com deploy job? |
| CI | `.github/workflows/` ou equivalente roda em todo PR? |
| Trunk-based | Avg branch lifetime (< 1 dia = trunk-based) |
| Test automation | Cobertura > 0 + CI rodando testes |
| Shift-left security | SAST/DAST/SCA em pipeline? |
| Loose coupling | Análise de imports cross-module |
| Monitoring | OpenTelemetry / Prometheus / logs estruturados? |
| Small batches | PR size p50 < 200 LOC? |

Capabilities culturais e de leadership exigem **entrevista** — sem evidência
no código, marcar como "no_evidence" e listar perguntas para humano responder.

## 4. Output

```markdown
# DORA Capabilities — Maturity Report

**Score global**: 2.4 / 4 (Performing)
**Capabilities maduras (≥3)**: 7/24
**Gaps críticos (≤1)**: 5/24

## Radar por categoria
| Categoria | Score médio | Capabilities ≥3 |
| Continuous Delivery | 2.8 | 5/8 |
| Architecture | 2.5 | 1/2 |
| Product & Process | 1.9 | 0/4 |
| Lean Management | 2.4 | 1/5 |
| Cultural | (no evidence) | — |

## Capabilities por score
### Forte (3-4)
- Version control · Score 4 · Tudo versionado, branches protegidas
- CI · Score 3 · GitHub Actions em todo PR
- ...

### Adoção parcial (1-2)
- Test data management · Score 1 · Apenas seed manual em dev
- Trunk-based · Score 2 · Feature branches duram ~3 dias

### Gaps (0)
- Test automation (cobertura 23%) · Score 0
- Shift-left security · Score 0 · Sem SAST/SCA em pipeline

## Recomendações priorizadas
1. Test automation (impacta CFR diretamente)
2. Shift-left security (compliance + CFR)
3. WIP limits + small batches (reduz Lead Time)

## Pendente entrevista
- Job satisfaction, Westrum culture, Leadership — questionário em anexo
```

## 5. Anti-padrões

- ❌ Auto-avaliar como Elite sem evidência objetiva
- ❌ Ignorar capabilities culturais ("não tem como medir") — colete via entrevista
- ❌ Tratar como checklist ("já temos CI ✓") sem qualidade
- ❌ Score sem contexto (não comparar com benchmark sem normalizar)
