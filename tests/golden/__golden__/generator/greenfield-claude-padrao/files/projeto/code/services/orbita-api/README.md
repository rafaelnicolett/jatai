# orbita-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Python 3.12+
- **Framework**: FastAPI
- **Arquitetura**: Clean/Hexagonal (Ports & Adapters)
- **Testes**: pytest

## Estrutura

O domínio não depende de infraestrutura: as portas ficam no domínio, os casos de uso na aplicação e os adaptadores na infraestrutura.

Diretórios que o gerador criou:

```
src/domain/model
src/domain/ports
src/application/use_cases
src/infrastructure/adapters
src/infrastructure/config
src/api/routes
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

- **`@backend-python-api`**: implementa código conforme Clean/Hexagonal (Ports & Adapters)
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de hexagonal

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
