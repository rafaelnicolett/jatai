---
id: maturity-spotify-health
name: maturity-spotify-health
type: skill
description: >
  Spotify Squad Health Check Model — auto-avaliação leve de saúde do time em
  11 dimensões com semáforo verde/amarelo/vermelho + trend. Tier: Lightweight.
applicable_to:
  - "@maturity-assessor"
framework_id: spotify-health
tier: lightweight
inputs:
  - respostas do time (preenchidas em entrevista ou survey)
  - opcionalmente: sinais indiretos do código/CI/tracker
outputs:
  - maturity-spotify-health.md (heatmap 11 cards × verde/amarelo/vermelho)
---

# Skill: maturity-spotify-health

> **Saúde do squad em 1 página.**
> Modelo público da Spotify Engineering Culture — leve, qualitativo, perfeito
> como complemento das métricas quantitativas.

## 1. As 11 dimensões (cards)

| Card | Pergunta provocadora |
|---|---|
| **1. Easy to release** | É fácil e seguro fazer release? |
| **2. Suitable process** | Nosso processo funciona bem? |
| **3. Tech quality (code base health)** | Estamos orgulhosos da qualidade do código? |
| **4. Value** | Entregamos coisas que importam? |
| **5. Speed** | Conseguimos avançar rápido? |
| **6. Mission** | Sabemos por que estamos aqui? |
| **7. Fun** | Estamos nos divertindo? |
| **8. Learning** | Estamos aprendendo? |
| **9. Support** | Quando precisamos, temos ajuda? |
| **10. Pawns or players** | Decidimos o que fazer ou só executamos? |
| **11. Teamwork** | Somos um time? |

## 2. Como pontuar

Cada dev pontua **dois eixos** para cada card:

| Eixo | Opções |
|---|---|
| **Status atual** | 🟢 Verde (good) / 🟡 Amarelo (so-so) / 🔴 Vermelho (bad) |
| **Trend** | ⬆️ Melhorando / ➡️ Estável / ⬇️ Piorando |

Agregação: **moda** do status do time (e não média — preserva extremos).

## 3. Sinais indiretos (quando humano não está disponível)

Algumas cards têm proxies observáveis no repo:

| Card | Sinal indireto |
|---|---|
| Easy to release | Deploy frequency (DORA) + CFR |
| Tech quality | code-quality-audit (hotspots, cobertura) |
| Speed | Lead Time (DORA) |
| Suitable process | PR review p95, CI flaky rate |
| Learning | docs freshness, ADR cadence |

⚠️ Sinais indiretos NUNCA substituem o input do time — geram **hipóteses**
para validar na próxima retro.

## 4. Output

```markdown
# Spotify Squad Health Check

**Squad**: backend-payments  ·  **Período**: maio 2026  ·  **Respostas**: 6/7

## Heatmap
| Card | Status | Trend | Hipótese (se sem input) |
| 1. Easy to release | 🟢 | ➡️ | — |
| 2. Suitable process | 🟡 | ⬇️ | retros sem ação clara |
| 3. Tech quality | 🔴 | ⬇️ | 3 god classes em pagamentos |
| 4. Value | 🟢 | ⬆️ | — |
| 5. Speed | 🟡 | ⬇️ | Lead Time p95 subiu 40% |
| 6. Mission | 🟡 | ➡️ | — |
| 7. Fun | 🟡 | ⬇️ | 2 turnovers recentes |
| 8. Learning | 🔴 | ⬇️ | sem time para study |
| 9. Support | 🟢 | ➡️ | — |
| 10. Pawns or players | 🟡 | ⬇️ | roadmap top-down |
| 11. Teamwork | 🟢 | ➡️ | — |

## Top concerns
1. **Tech quality** (🔴⬇️) → priorizar refactor de god classes (vide quality-report.md)
2. **Learning** (🔴⬇️) → reservar 10% Friday para aprendizado
3. **Speed** (🟡⬇️) → quebrar PRs grandes

## Discussão recomendada na próxima retro
- O que mudou em "Tech quality" desde o último health check?
- Que ação concreta tirar para Learning e Speed?
```

## 5. Anti-padrões

- ❌ Usar como ranking entre squads (mata transparência)
- ❌ Forçar resposta anônima e depois pedir nomes para "follow-up"
- ❌ Ignorar trend (vermelho estável é melhor que verde piorando)
- ❌ Coletar e não agir — pior que não coletar
- ❌ Substituir DORA/SPACE — health check é COMPLEMENTAR, qualitativo
