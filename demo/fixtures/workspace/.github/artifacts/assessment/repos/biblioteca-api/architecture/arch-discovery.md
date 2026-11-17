# Arquitetura · biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

**Padrão que o repositório é hoje:** camadas (`router → service → repository`),
com 84% de confiança.

| Camada | Pasta | Papel |
|---|---|---|
| Router | `app/routers` | recebe a chamada, cria o service e traduz o erro para HTTP |
| Service | `app/services` | regras de empréstimo, prazo e reserva |
| Repository | `app/repositories` | consultas do SQLAlchemy |
| Modelos e schemas | `app/models`, `app/schemas` | tabelas e formatos da API |

## Anti-padrões

- `EmprestimoService` consulta `Livro` pela sessão, além de usar o repository
  (`app/services/emprestimo_service.py:28`). A regra e o acesso a dados ficam
  misturados (`debt-api-01`).
- `app/routers/livros.py:13` consulta o banco sem passar por service nem
  repository (`debt-api-03`).

Diagrama: [`arch-discovery.drawio`](arch-discovery.drawio) (C4, nível de
contêineres).
