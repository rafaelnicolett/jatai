# Radar de tecnologia · biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

O snapshot não traz arquivo de lock. As versões abaixo são as do manifesto
(`pyproject.toml`), não as instaladas (`debt-api-04`).

| Item | Declarado | Anel | Observação |
|---|---|---|---|
| Python | >= 3.12 | Adopt | `zoneinfo` da biblioteca padrão |
| FastAPI | >= 0.115 | Adopt | três routers: livros, empréstimos e reservas |
| SQLAlchemy | >= 2.0 | Adopt | estilo declarativo com `Mapped` |
| Pydantic | >= 2.8 | Adopt | schemas de entrada e saída |
| pytest | >= 8.2 | Adopt | testes em `tests/` |
| SQLite | padrão do `DATABASE_URL` | Assess | uso em desenvolvimento; o banco de produção não foi descoberto |

Agente de Execução para este repositório: `@backend-python-api`.
