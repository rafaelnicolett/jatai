# Matriz de risco · Reserva de livros com fila de espera

> Workspace demo fictício: os números e os achados abaixo são inventados.

A ordem sai de risco × valor × esforço, incluindo o risco de não fazer. Escala de
1 (baixo) a 5 (alto).

| Item | Risco de fazer | Risco de não fazer | Valor | Esforço | Ordem |
|---|---|---|---|---|---|
| Characterization tests do fluxo de empréstimo (`task-1.1`) | 1 | 4 | 4 | 2 | 1 |
| Tabela `reservas` (Expand, `task-1.2`) | 3 | 2 | 4 | 2 | 2 |
| Contrato e endpoint `POST /reservas` (`task-1.3`) | 3 | 2 | 5 | 3 | 3 |
| Fila por ordem de pedido (`task-2.1`) | 2 | 2 | 5 | 2 | 4 |
| Tela de reservas (`task-3.1`) | 2 | 1 | 4 | 3 | 5 |

## Riscos que pedem decisão humana

- A tabela nova mexe no banco: `task-1.2` exige aprovação antes de seguir.
- O contrato da API é consumido pelo portal: `task-1.3` exige aprovação.
