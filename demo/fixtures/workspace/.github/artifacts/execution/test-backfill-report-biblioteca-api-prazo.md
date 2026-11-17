# Test Backfill · prazo de devolução da biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

Hotfix `hotfix-prazo-de-devolucao`, onda 1 (`wave-1/item-1.1`), por
`@test-backfill-agent`.

## Alvo

- Módulo: `app/services/prazo.py`
- Cobertura antes: 0%
- Cobertura depois: 100%

## O bug

O prazo era contado em UTC. Um empréstimo às 22h30 em São Paulo (1h30 do dia
seguinte em UTC) ganhava um dia a mais.

## Testes criados

| Arquivo | Tipo | O que fixa |
|---|---|---|
| `tests/test_prazo.py` | caracterização | empréstimo de dia vence em 14 dias |

O comportamento errado foi caracterizado primeiro, com o teste vermelho para o
caso da noite. A correção veio na onda 2.

## Status

Bug reproduzido e pinado. Pronto para o fix.
