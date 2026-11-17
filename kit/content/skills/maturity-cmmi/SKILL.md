---
id: maturity-cmmi
name: maturity-cmmi
type: skill
description: >
  CMMI (Capability Maturity Model Integration) — 5 níveis de maturidade
  processual, originalmente do SEI. Tier: Heavyweight (Enterprise/regulado).
  Avaliação leve baseada em evidência de processo.
applicable_to:
  - "@maturity-assessor"
framework_id: cmmi
tier: heavyweight
inputs:
  - políticas / processos documentados
  - métricas de processo coletadas
  - pipelines, retros, post-mortems
outputs:
  - maturity-cmmi.md (level estimado + process areas)
---

# Skill: maturity-cmmi

> **Maturidade processual em 5 níveis** — Software Engineering Institute (SEI).
> ⚠️ Heavyweight. Apenas para contextos enterprise/regulados que demandam CMMI.

## 1. Os 5 níveis

| Nível | Nome | Característica |
|---|---|---|
| **1** | Initial | Caótico, ad-hoc, depende de heróis |
| **2** | Managed | Projetos planejados, executados e medidos |
| **3** | Defined | Processos padronizados na organização |
| **4** | Quantitatively Managed | Processos medidos e controlados estatisticamente |
| **5** | Optimizing | Foco em melhoria contínua via dados |

## 2. Process Areas (subset relevante para dev)

### Nível 2 (Managed)
- **REQM** — Requirements Management
- **PP** — Project Planning
- **PMC** — Project Monitoring and Control
- **MA** — Measurement and Analysis
- **PPQA** — Process and Product Quality Assurance
- **CM** — Configuration Management
- **SAM** — Supplier Agreement Management

### Nível 3 (Defined)
- **RD** — Requirements Development
- **TS** — Technical Solution
- **PI** — Product Integration
- **VER** — Verification
- **VAL** — Validation
- **OPF** — Organizational Process Focus
- **OPD** — Organizational Process Definition
- **OT** — Organizational Training
- **IPM** — Integrated Project Management
- **RSKM** — Risk Management
- **DAR** — Decision Analysis and Resolution

### Nível 4
- **OPP** — Organizational Process Performance
- **QPM** — Quantitative Project Management

### Nível 5
- **OPM** — Organizational Performance Management
- **CAR** — Causal Analysis and Resolution

## 3. Avaliação leve (sem appraisal SCAMPI formal)

Para cada Process Area, marcar:

| Status | Critério |
|---|---|
| **Implemented** | Há processo escrito + evidência de uso recorrente |
| **Partial** | Existe mas inconsistente / ad-hoc |
| **Absent** | Não existe |

**Regra de level**: para "estar" no Nível N, todas as PAs do nível precisam estar Implemented.

## 4. Fontes de evidência

| PA | Evidência |
|---|---|
| REQM | Issue tracker com rastreabilidade requisito→commit |
| PP | Sprint planning + estimativas registradas |
| PMC | Burndown / status report regular |
| MA | Dashboard de métricas (DORA, qualidade) |
| CM | git + branch policy + change log |
| VER/VAL | CI com testes + relatórios |
| RSKM | risk register em `.github/artifacts/planning/risk-matrix.md` |
| DAR | ADRs em `docs/adr/` |
| OPP/QPM | SLOs medidos + análise estatística |
| CAR | Post-mortems com análise causa-raiz |

## 5. Output

```markdown
# CMMI — Maturity Estimate

**Level estimado**: 2 (Managed)
**Próximo gap**: Nível 3 — faltam TS, OT, IPM, RSKM consolidados

## Process Areas — Nível 2
| PA | Status | Evidência |
| REQM | Implemented | Jira com Epic→Story→Commit |
| PP | Partial | Sprint planning sim, mas estimativa inconsistente |
| PMC | Implemented | Burndown semanal |
| MA | Partial | DORA mensal, faltam métricas de qualidade |
| PPQA | Absent | Sem auditoria de processo |
| CM | Implemented | GitFlow + tags semver |
| SAM | N/A | Sem vendors críticos |

## Process Areas — Nível 3
| PA | Status |
| RD | Partial |
| TS | Implemented (ADRs em docs/adr/) |
| PI | Implemented (CI/CD) |
| VER | Implemented |
| VAL | Partial |
| OPF | Absent |
| OPD | Absent |
| OT | Partial |
| IPM | Absent |
| RSKM | Implemented (risk-matrix.md) |
| DAR | Implemented (ADRs) |

## Recomendações priorizadas
1. Consolidar PPQA (auditorias de processo)
2. Formalizar OPF/OPD (processo organizacional escrito)
3. Roadmap para Nível 3 em 9-12 meses
```

## 6. Anti-padrões

- ❌ Buscar Nível 5 sem regulação que exija (custo absurdo, ganho marginal)
- ❌ Confundir CMMI com appraisal SCAMPI (uma estimativa leve não certifica)
- ❌ Engessar processos só para "subir de nível" — CMMI é diagnóstico
- ❌ Aplicar em produto pequeno (lean perde sempre — use DORA)
