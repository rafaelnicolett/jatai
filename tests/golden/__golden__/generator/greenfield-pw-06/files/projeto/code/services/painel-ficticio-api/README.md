# painel-ficticio-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Python 3.12+
- **Framework**: FastAPI, com LangGraph e LangChain
- **Arquitetura**: DDD Tactical (Aggregates + Domain Events)
- **Testes**: pytest

## Estrutura

Agregados, entidades, objetos de valor e eventos ficam no domínio; comandos e consultas (CQRS) ficam na aplicação.

Diretórios que o gerador criou:

```
src/domain/aggregates
src/domain/entities
src/domain/value_objects
src/domain/events
src/domain/repositories
src/application/commands
src/application/queries
src/infrastructure/persistence
src/infrastructure/messaging
src/api/routes
tests/unit/domain
tests/integration
```

## Comandos

```bash
# Instalar as dependências, com as de desenvolvimento
pip install -e ".[dev]"

# Rodar localmente
python -m src.main

# Testes
pytest

# Lint
ruff check src/ tests/
```

## Agentes especializados

- **`@backend-python-agentic`**: implementa código conforme DDD Tactical (Aggregates + Domain Events)
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de ddd-tactical

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
