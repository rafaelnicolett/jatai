# painel-ficticio-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Python 3.12+
- **Framework**: FastAPI
- **Arquitetura**: Vertical Slice Architecture
- **Testes**: pytest

## Estrutura

Cada feature é autocontida (domínio, infraestrutura e API juntos). O que é comum a todas fica em shared.

Diretórios que o gerador criou:

```
src/features/health
src/shared/database
src/shared/observability
src/api
tests/features
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

- **`@backend-python-api`**: implementa código conforme Vertical Slice Architecture
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de vertical-slice

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
