# Feature · reservas na biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

Tarefas `epic-1/task-1.3` (concluída, espera aprovação) e `epic-2/task-2.1` (em
andamento), por `@feature-adder`.

## Feature-list leve

Rodou. Cenários em `features/epic-1/reservar-livro.feature` e
`features/epic-2/fila-de-espera.feature`, escritos antes do código.

## Padrão arquitetural respeitado

Camadas `router → service → repository`, como o Discovery descreveu. A regra da
reserva fica em `app/services/reserva_service.py`; o router só traduz o erro para
HTTP. Nenhum refactor de passagem.

## Arquivos alterados ou criados

- `app/routers/reservas.py`, `app/services/reserva_service.py`
- `app/repositories/reserva_repository.py`, `app/schemas/reserva.py`
- `tests/test_reserva_service.py`

## Testes adicionados

| Tipo | Arquivo | O que cobre |
|---|---|---|
| unitário | `tests/test_reserva_service.py` | reservar com exemplar livre manda fazer o empréstimo; a fila anda por ordem de pedido |

## ADR criada?

Não nesta tarefa: a decisão da ordem da fila é a
[ADR-0001](../../../docs/adr/0001-fila-de-reservas-por-ordem-de-pedido.md).

## Riscos identificados

- O contrato do `POST /reservas` (`task-1.3`) espera aprovação humana. O portal
  só segue depois disso; por isso `task-2.3` está bloqueada.
- `task-2.1` ainda precisa de testes para o empate de pedidos no mesmo instante.
