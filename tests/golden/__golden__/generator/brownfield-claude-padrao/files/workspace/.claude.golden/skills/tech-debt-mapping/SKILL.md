---
id: tech-debt-mapping
name: tech-debt-mapping
type: skill
description: >
  Inventário e priorização de dívida técnica usando o framework de Martin Fowler
  (prudent/reckless × deliberate/inadvertent) e estimativa de juros. Usada por
  @debt-analyst e @modernization-planner.
applicable_to:
  - "@debt-analyst"
  - "@modernization-planner"
inputs:
  - quality-report.md
  - security-report.md
  - coverage-gaps.md
  - tech-radar.md
  - comentários TODO/FIXME/HACK/XXX no código
outputs:
  - tech-debt.md priorizado
---

# Skill: tech-debt-mapping

> **Dívida não paga gera juros recorrentes.**
> Priorize pelo juros, não só pelo principal.

## 1. Categorias de dívida

| Categoria | Exemplos |
|---|---|
| Arquitetural | Acoplamento alto, god classes, ausência de camadas |
| Testes | Cobertura baixa, flaky tests, sem integração |
| Dependências | Outdated, EOL, CVEs |
| Documentação | Sem ADRs, sem README atualizado, sem onboarding |
| Observabilidade | Sem logs estruturados, sem métricas, sem tracing |
| Segurança | Secrets em código, auth fraca, OWASP findings |
| Performance | N+1 queries, sem cache, bundle gigante |
| DevX | Build lento, CI flaky, setup local quebrado |

## 2. Quadrante Fowler

```
              DELIBERATE              INADVERTENT
PRUDENT    "Shippamos rápido        "Agora sabemos como
            mas vamos voltar"        deveríamos ter feito"
RECKLESS   "Não temos tempo         "Não sabíamos que
            pra design"              estávamos fazendo errado"
```

| Quadrante | Estratégia |
|---|---|
| Prudent-Deliberate | Listar e revisitar quando o contexto muda |
| Prudent-Inadvertent | Refactor incremental com novo aprendizado |
| Reckless-Deliberate | **Pagar urgente** — está sangrando |
| Reckless-Inadvertent | Aprendizado primeiro, refactor depois |

## 3. Estimativa de juros

Para cada dívida, responda:

| Pergunta | Indicador |
|---|---|
| Quantas vezes por sprint isso atrasa entregas? | Velocity tax |
| Quantos bugs vieram disso nos últimos 6 meses? | Bug tax |
| Quanto isso aumenta o tempo de onboarding? | Onboard tax |
| Quanto isso atrasa o time-to-market de features novas? | Opportunity tax |
| Risco de incidente em produção? | Risk premium |

**Juros = soma ponderada dos taxes**.

## 4. Priorização (matriz)

Score = `(juros × valor_se_pago) / esforço_para_pagar`

| Esforço × Juros | Estratégia |
|---|---|
| Baixo esforço × alto juros | **Quick Win** (sempre primeiro) |
| Alto esforço × alto juros | **Investimento estratégico** (planejar wave) |
| Baixo esforço × baixo juros | Fazer quando atravessar a área |
| Alto esforço × baixo juros | Não fazer (aceitar) |

## 5. Coleta no código

Greps obrigatórios:
- `TODO`, `FIXME`, `HACK`, `XXX`, `KLUDGE`, `BUG`
- Commits com: "workaround", "hack", "quick fix", "temp", "remove later", "rewrite"
- Comentários longos sobre limitações
- Issues no tracker marcadas como `tech-debt`/`refactor`

## 6. Output

```markdown
# Tech Debt — {project}

## Resumo
- Total: 47 itens
- Críticos: 8 · Altos: 14 · Médios: 19 · Baixos: 6
- Quadrante: 22 reckless × 25 prudent
- Esforço total: ~14 sprints

## Quadrante Fowler
| Quadrante | Itens |
| Reckless-Deliberate | 12 (priorizar!) |
| Prudent-Deliberate | 18 |
| Reckless-Inadvertent | 10 |
| Prudent-Inadvertent | 7 |

## Top Quick Wins
1. [DEBT-003] Remover dead code em legacy/ — esforço S, juros médio
2. [DEBT-007] Pinar versão de psycopg2 (CVE) — esforço S, juros alto
3. ...

## Críticos (sangrando)
1. [DEBT-001] God class OrderService.java (1247 LOC, 312 commits/12m)
   - Categoria: arquitetural
   - Quadrante: reckless-deliberate
   - Esforço: L (2 sprints)
   - Juros: 6 bugs/quarter rastreados a esse arquivo
   - Recomendação: split em (OrderPricing, OrderValidation, OrderRepository)

## Inventário completo
| ID | Título | Categoria | Quadrante | Esforço | Juros | Score |
```
