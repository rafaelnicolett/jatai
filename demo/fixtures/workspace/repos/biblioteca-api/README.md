# biblioteca-api

API de empréstimos e reservas da **Biblioteca de Bairro**, um projeto fictício
usado como workspace de demonstração. Nada aqui é de uma empresa ou de uma
pessoa de verdade.

## Rodar

```sh
pip install -e ".[dev]"
uvicorn app.main:app --reload
pytest
```

## Estrutura

```text
app/routers        endpoints (FastAPI)
app/services       regras de empréstimo, prazo e reserva
app/repositories   acesso ao banco (SQLAlchemy)
app/models         tabelas
app/schemas        entrada e saída da API (Pydantic)
tests/             testes com pytest
```

O fluxo é `router → service → repository`.
