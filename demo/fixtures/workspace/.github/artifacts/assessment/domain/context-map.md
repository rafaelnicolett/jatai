# Mapa de contextos · Biblioteca de Bairro

> Workspace demo fictício: os números e os achados abaixo são inventados.

O `@domain-extractor` leu os dois repositórios juntos. Os contextos abaixo foram
aceitos no gate e estão em [`context-repos.yaml`](../../context-repos.yaml).

| Contexto | Vive em | Linguagem própria |
|---|---|---|
| Empréstimos | `biblioteca-api` (`app/services/emprestimo_service.py`, `app/services/prazo.py`) e `biblioteca-web` (`src/features/emprestimos`) | exemplar, retirada, prazo, devolução |
| Reservas | `biblioteca-api` (`app/services/reserva_service.py`) e `biblioteca-web` (`src/features/reservas`) | fila de espera, posição, pedido |

Um contexto atravessa os dois repositórios: o portal repete no código o formato
da reserva que a API define. É esse acoplamento que o grafo de dependências
registra como aresta de contrato.
