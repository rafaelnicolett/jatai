# painel-ficticio-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Python 3.12+
- **Framework**: FastAPI, com LangGraph e LangChain
- **Arquitetura**: Layered/N-Tier Architecture
- **Testes**: pytest

## Estrutura

Controladores chamam serviços, que chamam repositórios, que acessam os modelos.

Diretórios que o gerador criou:

```
src/controllers
src/services
src/repositories
src/models
src/config
tests/unit
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

- **`@backend-python-agentic`**: implementa código conforme Layered/N-Tier Architecture
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de layered

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
