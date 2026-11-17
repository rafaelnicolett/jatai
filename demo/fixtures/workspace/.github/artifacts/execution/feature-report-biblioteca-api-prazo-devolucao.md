# Fix · prazo de devolução da biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

Hotfix `hotfix-prazo-de-devolucao`, onda 2 (`wave-2/item-2.1`), por
`@feature-adder`.

## O que mudou

`calcular_prazo` (`app/services/prazo.py`) passa a converter o horário de
retirada para o fuso da biblioteca (`FUSO_DA_BIBLIOTECA`) antes de somar os
dias. O comportamento para empréstimos de dia não muda.

## Padrão arquitetural respeitado

Só o service de prazo foi tocado. Nenhum refactor de passagem, e nenhuma feature
na mesma mudança.

## Testes adicionados

| Tipo | Arquivo | O que cobre |
|---|---|---|
| regressão | `tests/test_prazo.py` | `test_regressao_emprestimo_a_noite_nao_ganha_um_dia` |

## ADR criada?

Não. A correção não é uma decisão de arquitetura.

## Riscos identificados

- Empréstimos já gravados com o prazo antigo não foram corrigidos; a lista foi
  entregue ao balcão.
