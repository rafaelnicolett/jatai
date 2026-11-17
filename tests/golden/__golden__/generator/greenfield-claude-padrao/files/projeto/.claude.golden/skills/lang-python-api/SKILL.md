---
id: lang-python-api
name: lang-python-api
type: skill
description: Boas práticas da linguagem Python para APIs com FastAPI — idiomas, bibliotecas canônicas, naming, testes e observabilidade. Independente do padrão arquitetural.
applicable_to:
  - "@backend-python-api"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-python-api

> Boas práticas da **linguagem e framework**, não do padrão arquitetural.
> Para estrutura de pastas e camadas, use a skill `arch-*` correspondente.

---

## 1. Runtime e tooling

| Item | Padrão | Observação |
|---|---|---|
| Python | 3.12+ | `pyproject.toml` com `requires-python = ">=3.12"` |
| Gerenciador de dependências | `uv` (preferido) ou `pip-tools` | `uv lock` gera lock determinístico |
| Linter + formatter | `ruff` | Substitui flake8, isort, black — configurar em `pyproject.toml` |
| Type checker | `mypy --strict` ou `pyright strict` | CI falha em qualquer erro de tipo |
| Framework HTTP | FastAPI (ASGI) | Sempre com `lifespan` em vez de `@app.on_event` |
| Async | `asyncio` + `async/await` end-to-end | `to_thread` para CPU-bound |
| Schemas HTTP | Pydantic v2 **somente na borda** | Domain usa `dataclass` puro ou `@dataclass(frozen=True)` |
| ORM / DB | SQLAlchemy 2.x async | `AsyncSession`, `mapped_column`, `DeclarativeBase` |
| Migrations | Alembic | `alembic upgrade head` no startup do container |
| HTTP client (saída) | `httpx.AsyncClient` | Nunca `requests` em código async |
| Logs | `structlog` + JSON em produção | `bind_contextvars(trace_id=...)` |
| Observabilidade | `opentelemetry-sdk` + auto-instrumentation | Span por use case entry point |
| Test runner | `pytest` + `pytest-asyncio` | `asyncio_mode = "auto"` no `pyproject.toml` |
| Test HTTP | `httpx.AsyncClient(app=app)` | Nunca TestClient sync em código async |
| Containers em teste | `testcontainers-python` | PostgreSQL, Redis, Kafka reais |
| Contract tests | `schemathesis` | Roda contra `api/openapi.yaml` |

## 2. Idiomas da linguagem

### 2.1 Type hints — obrigatório em todo código novo
```python
# ✅ Correto
async def aplicar_cupom(
    carrinho_id: CarrinhoId,
    codigo: str,
    hoje: date,
) -> Carrinho:
    ...

# ❌ Sem tipo
async def aplicar_cupom(carrinho_id, codigo, hoje):
    ...
```

### 2.2 Pydantic v2 apenas na borda HTTP
```python
# ✅ Schema de entrada HTTP (borda) — usa Pydantic
class AplicarCupomRequest(BaseModel):
    codigo: str = Field(min_length=1, max_length=50)

# ✅ Entidade de domínio — usa dataclass puro
@dataclass(frozen=True)
class Cupom:
    id: CupomId
    codigo: str
    validade: date
    desconto: Desconto

# ❌ Pydantic no domínio — acopla domínio ao framework
class Cupom(BaseModel):
    id: str
    validade: date
```

### 2.3 Result type para erros de domínio (sem exceção de controle de fluxo)
```python
from typing import TypeVar, Generic
T = TypeVar("T")
E = TypeVar("E")

@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T

@dataclass(frozen=True)
class Err(Generic[E]):
    error: E

Result = Ok[T] | Err[E]

# No domínio:
def validar_cupom(cupom: Cupom, hoje: date) -> Result[Cupom, CupomError]:
    if cupom.validade < hoje:
        return Err(CupomError.EXPIRADO)
    return Ok(cupom)

# No adapter HTTP — converte Result em resposta HTTP
match resultado:
    case Ok(cupom): return CupomResponse.from_domain(cupom)
    case Err(CupomError.EXPIRADO): raise HTTPException(422, detail=error_envelope("CHECKOUT.CUPOM.EXPIRADO"))
```

### 2.4 FastAPI — padrões obrigatórios

```python
# ✅ Lifespan (não @app.on_event deprecated)
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await db.connect()
    yield
    # shutdown
    await db.disconnect()

app = FastAPI(lifespan=lifespan)

# ✅ Router por bounded context (não arquivo monolítico)
router = APIRouter(prefix="/v1/carrinhos", tags=["carrinho"])

# ✅ Dependency injection via Depends (não singleton global)
async def get_use_case(
    session: AsyncSession = Depends(get_session),
) -> AplicarCupomUseCase:
    return AplicarCupomUseCase(
        carrinho_repo=PostgresCarrinhoRepository(session),
        cupom_repo=PostgresCupomRepository(session),
    )

@router.post("/{id}/cupom", response_model=CarrinhoResponse)
async def aplicar_cupom(
    id: UUID,
    body: AplicarCupomRequest,
    use_case: AplicarCupomUseCase = Depends(get_use_case),
) -> CarrinhoResponse:
    result = await use_case.execute(CarrinhoId(id), body.codigo)
    ...
```

### 2.5 Naming conventions

| Elemento | Convenção | Exemplo |
|---|---|---|
| Módulos/pacotes | `snake_case` | `aplicar_cupom.py` |
| Classes | `PascalCase` | `CarrinhoRepository` |
| Funções/métodos | `snake_case` | `aplicar_cupom()` |
| Constantes | `UPPER_SNAKE` | `MAX_ITENS_CARRINHO = 50` |
| Variáveis privadas | `_snake_case` | `_session` |
| Type aliases | `PascalCase` | `CarrinhoId = NewType("CarrinhoId", UUID)` |
| IDs de domínio | `NewType` | `CarrinhoId = NewType("CarrinhoId", UUID)` — nunca `str` puro |

### 2.6 Async — regras críticas

```python
# ✅ CPU-bound em thread pool
import asyncio
resultado = await asyncio.to_thread(processar_pdf, arquivo)

# ❌ Blocking call em coroutine — trava event loop
time.sleep(1)          # nunca em produção
open("file.txt").read() # usar aiofiles

# ✅ Cancelamento propagado via asyncio.CancelledError
async def handler():
    try:
        await long_operation()
    except asyncio.CancelledError:
        await cleanup()
        raise  # re-raise obrigatório

# ✅ Task group para concorrência estruturada (Python 3.11+)
async with asyncio.TaskGroup() as tg:
    tg.create_task(reservar_estoque(pedido))
    tg.create_task(notificar_email(pedido))
```

## 3. Pirâmide de testes (Python)

```
     ▲ E2E (≤10%)       httpx contra container real
    ╱─╲ Contract (≈15%)  schemathesis contra openapi.yaml
   ╱───╲ Integração (≈25%) testcontainers (postgres, redis, kafka)
  ╱─────╲ Unitário (≥50%) pytest puro, zero IO, zero framework
```

### 3.1 Unitário — sem nada de infra
```python
# tests/unit/checkout/test_cupom.py
def test_cupom_expirado_retorna_err():
    cupom = Cupom(id=CupomId(uuid4()), codigo="X", validade=date(2020,1,1), desconto=Desconto.pct(10))
    result = validar_cupom(cupom, hoje=date(2024,1,1))
    assert isinstance(result, Err)
    assert result.error == CupomError.EXPIRADO

# Sem mock, sem banco, sem HTTP — puro Python
```

### 3.2 Integração com Testcontainers
```python
# tests/integration/test_carrinho_repository.py
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres_url():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg.get_connection_url().replace("postgresql://", "postgresql+asyncpg://")

@pytest.mark.asyncio
async def test_salvar_e_buscar_carrinho(postgres_url: str):
    engine = create_async_engine(postgres_url)
    async with AsyncSessionLocal(engine) as session:
        repo = PostgresCarrinhoRepository(session)
        carrinho = Carrinho.novo(ClienteId(uuid4()))
        await repo.salvar(carrinho)
        recuperado = await repo.buscar(carrinho.id)
        assert recuperado == carrinho
```

### 3.3 Contract — schemathesis
```bash
# Roda em CI após testes de integração
schemathesis run api/openapi.yaml \
  --url http://localhost:8000 \
  --checks all \
  --hypothesis-max-examples 50
```

## 4. Observabilidade obrigatória

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

class AplicarCupomUseCase:
    async def execute(self, carrinho_id: CarrinhoId, codigo: str) -> Carrinho:
        with tracer.start_as_current_span("AplicarCupom") as span:
            span.set_attribute("carrinho.id", str(carrinho_id))
            span.set_attribute("cupom.codigo", codigo)
            # lógica...
```

```python
# structlog — log estruturado com contexto de trace
import structlog
log = structlog.get_logger()

log.info("cupom_aplicado", carrinho_id=str(carrinho_id), desconto_pct=10)
# Saída JSON: {"event":"cupom_aplicado","carrinho_id":"...","desconto_pct":10,"trace_id":"..."}
```

## 5. Segurança baseline

```python
# ✅ Parametrize SEMPRE — sem SQL injection
await session.execute(
    select(CupomModel).where(CupomModel.codigo == codigo)  # SQLAlchemy parametriza
)

# ❌ NUNCA string concat
query = f"SELECT * FROM cupons WHERE codigo = '{codigo}'"  # SQL injection

# ✅ Sem secrets em código — via env
import os
DATABASE_URL = os.environ["DATABASE_URL"]  # explode rápido se ausente

# ✅ Logs sem PII
log.info("usuario_autenticado", user_id=hash_id(user.id))  # nunca user.email

# ✅ Input validado na borda (Pydantic), não no domínio
class AplicarCupomRequest(BaseModel):
    codigo: str = Field(min_length=1, max_length=50, pattern=r"^[A-Z0-9_-]+$")
```

## 6. Anti-padrões específicos do Python

- ❌ `from __future__ import annotations` como desculpa para não tipar
- ❌ `Any` como tipo de retorno ou parâmetro
- ❌ `@lru_cache` em objetos com estado mutável
- ❌ `global` ou variáveis de módulo como estado de aplicação
- ❌ Pydantic no domínio (acopla a framework)
- ❌ `requests` em código async (use `httpx.AsyncClient`)
- ❌ `print()` em produção (use `structlog`)
- ❌ Exceção de domínio como `Exception` base (use hierarquia própria)
- ❌ `session.commit()` fora do adapter (domínio não conhece transação)
