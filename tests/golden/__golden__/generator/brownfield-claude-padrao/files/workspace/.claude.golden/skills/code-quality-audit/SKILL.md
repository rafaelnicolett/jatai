---
id: code-quality-audit
name: code-quality-audit
type: skill
description: >
  Métricas objetivas para auditar qualidade de código existente: complexidade
  ciclomática, hotspots (churn × complexidade), god classes, duplicação, dead
  code. Estilo Adam Tornhill (Code as a Crime Scene). Usada por @quality-auditor.
applicable_to:
  - "@quality-auditor"
inputs:
  - código fonte
  - histórico git (para churn)
outputs:
  - quality-report.md com métricas e top hotspots
---

# Skill: code-quality-audit

> **Métricas > opiniões.**
> "Esse código é ruim" não cabe num relatório. "Complexidade ciclomática 47 e
> 312 commits nos últimos 12 meses" cabe.

## 1. Métricas básicas

| Métrica | Como calcular | Threshold ruim |
|---|---|---|
| LOC total | wc -l (excluindo blank/comment) | — |
| % por linguagem | LOC por extensão / total | — |
| % comentários | linhas-comentário / LOC | <5% (subdocumentado) ou >40% (rude) |
| Cobertura testes | se houver coverage.xml/lcov | <50% (baixo) |

## 2. Complexidade ciclomática (CC)

Heurística por linguagem (sem ferramenta):

```
CC = 1
+ 1 para cada: if, elif, else if, case, when, for, while, foreach, catch,
              &&, ||, ?, =>(em conditional), match arm
```

| CC | Avaliação |
|---|---|
| 1-5 | simples |
| 6-10 | aceitável |
| 11-20 | complexo (refatorar) |
| 21-50 | muito complexo (risco alto) |
| >50 | inaceitável (crítico) |

## 3. Hotspots (Adam Tornhill)

**Fórmula**: `hotspot_score = complexidade × churn`

- **Churn** = número de commits que tocaram o arquivo nos últimos N meses
  (`git log --format= --name-only --since=N.months.ago | sort | uniq -c | sort -rn`)
- **Complexidade** = CC máxima do arquivo OU LOC

**Top hotspots** = candidatos prioritários a refactor (alto risco de bug + alto custo de mudança).

## 4. God classes / files

Critérios (qualquer combinação):
- LOC > 500
- Métodos públicos > 20
- Imports/deps > 15
- Responsabilidades múltiplas (heurística: contar verbos distintos nos nomes de métodos)

## 5. Duplicação

Detecção heurística:
- Blocos de ≥6 linhas idênticas (ignorando whitespace/identifiers)
- Funções com assinatura+corpo equivalente em arquivos distintos
- Copy-paste óbvio: blocos consecutivos quase idênticos no mesmo arquivo

## 6. Dead code

- Exports não importados (TS/JS, Python `__all__`)
- Funções/métodos privados não chamados
- Classes não instanciadas
- Arquivos não importados em nenhum entry point

⚠️ Cuidado: reflection, DI por anotação, lazy loading podem mascarar uso.
Marque "candidato a dead code" — não afirme.

## 7. Output (formato sugerido)

```markdown
# Quality Report — {project}

## Métricas globais
| Métrica | Valor |
| LOC | 87,432 |
| Linguagens | Java 82% / Kotlin 12% / SQL 6% |
| % comentários | 6.3% |
| Cobertura | 34% |

## Top 10 hotspots
| Rank | Path | CC | Churn (12m) | Score |
| 1 | services/OrderService.java | 47 | 312 | 14,664 |
| 2 | controllers/CheckoutController.java | 38 | 198 | 7,524 |

## Top 5 god classes
| Path | LOC | Métodos | Sugestão |
| services/OrderService.java | 1,247 | 38 | Split por responsabilidade (pricing, validation, persistence) |

## Duplicação suspeita
- Bloco de validação de CPF: 7 ocorrências em [paths...]
- Função `formatCurrency`: 4 implementações em [paths...]

## Dead code candidato
- exports/legacy/oldPricing.ts — nenhum import detectado
- services/UnusedService.java — sem instanciação

## Score por dimensão (0-10)
- Legibilidade: 6/10 — naming inconsistente, comentários escassos
- Modularidade: 4/10 — god classes em 12 módulos
- Testabilidade: 5/10 — DI mas alto coupling em services
- Aderência a guidelines: 5/10 — várias violações de naming
```
