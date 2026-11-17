---
id: arch-layered
name: arch-layered
type: skill
description: Arquitetura em Camadas (Layered) — Controller → Service → Repository. Simples e pragmática para CRUD. Agnóstica de linguagem.
applicable_to:
  - "@backend-python-api"
  - "@backend-java"
  - "@backend-dotnet"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-layered

> Define a **estrutura e regras** do padrão Layered Architecture (N-Tier).
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.

---

## 1. Princípio fundamental

Camadas horizontais com dependência de cima para baixo.
Cada camada conhece apenas a camada imediatamente abaixo.

```
┌────────────────────────────────┐
│  Presentation / API Layer      │  Controllers, Routers, Handlers
│  (HTTP, eventos, CLI)          │
├────────────────────────────────┤
│  Service / Business Layer      │  Lógica de negócio, orquestração
│  (Use Cases, Workflows)        │
├────────────────────────────────┤
│  Repository / Data Layer       │  Acesso a dados, ORM, cache
│  (Persistence, External APIs)  │
├────────────────────────────────┤
│  Domain / Model Layer          │  Entidades, Value Objects, DTOs
│  (Transversal — sem deps)      │
└────────────────────────────────┘
```

**Regra de dependência**: Presentation → Service → Repository → Domain.
Nenhuma camada salta outra.

## 2. Estrutura de diretórios canônica

### Python (FastAPI)
```
src/<context>/
├── api/                     # Presentation
│   ├── routers/
│   │   └── carrinho_router.py   # FastAPI @router.post(...)
│   └── schemas/
│       └── carrinho_schema.py   # Pydantic request/response
├── services/                # Business Logic
│   └── carrinho_service.py      # Orquestração, regras de negócio
├── repositories/            # Data Access
│   └── carrinho_repository.py   # SQLAlchemy queries
├── models/                  # Domain / ORM Models
│   ├── domain/
│   │   └── carrinho.py          # Pure domain dataclass
│   └── orm/
│       └── carrinho_orm.py      # SQLAlchemy ORM model
└── main.py
```

### Java (Spring Boot)
```
src/main/java/com/empresa/<context>/
├── controller/              # Presentation
│   └── CarrinhoController.java
├── service/                 # Business Logic
│   ├── CarrinhoService.java     # Interface
│   └── CarrinhoServiceImpl.java # Implementação
├── repository/              # Data Access
│   └── CarrinhoRepository.java  # Spring Data JPA interface
├── dto/                     # DTOs (request/response) — transversais
│   ├── AplicarCupomRequest.java
│   └── CarrinhoResponse.java
└── entity/                  # JPA Entities
    └── CarrinhoEntity.java
```

### .NET (ASP.NET Core)
```
src/<Context>/
├── Controllers/              # ou Endpoints/ para Minimal API
│   └── CarrinhoController.cs
├── Services/
│   ├── ICarrinhoService.cs
│   └── CarrinhoService.cs
├── Repositories/
│   ├── ICarrinhoRepository.cs
│   └── CarrinhoRepository.cs
├── Models/
│   ├── Domain/
│   │   └── Carrinho.cs
│   └── Dto/
│       ├── AplicarCupomRequest.cs
│       └── CarrinhoResponse.cs
└── Program.cs
```

## 3. Responsabilidades por camada

### 3.1 Presentation (Controller / Router)
```python
# ✅ Apenas: validar input, chamar service, mapear para response
@router.post("/{id}/cupom", response_model=CarrinhoResponse)
async def aplicar_cupom(
    id: UUID,
    body: AplicarCupomRequest,
    service: Annotated[CarrinhoService, Depends(get_carrinho_service)],
) -> CarrinhoResponse:
    resultado = await service.aplicar_cupom(id, body.codigo)
    return CarrinhoResponse.from_domain(resultado)

# ❌ Lógica de negócio no controller
async def aplicar_cupom(id: UUID, body: AplicarCupomRequest):
    cupom = await db.query(Cupom).filter_by(codigo=body.codigo).first()
    if cupom.validade < date.today():  # ❌ regra de negócio aqui
        raise HTTPException(422, "Cupom expirado")
```

### 3.2 Service (Business Logic)
```python
# ✅ Orquestra, aplica regras, não conhece HTTP
class CarrinhoService:
    def __init__(self, carrinho_repo: CarrinhoRepository, cupom_repo: CupomRepository):
        self._carrinho_repo = carrinho_repo
        self._cupom_repo = cupom_repo

    async def aplicar_cupom(self, carrinho_id: UUID, codigo: str) -> Carrinho:
        carrinho = await self._carrinho_repo.buscar(carrinho_id)
        if not carrinho:
            raise CarrinhoNaoEncontrado(carrinho_id)

        cupom = await self._cupom_repo.buscar_por_codigo(codigo)
        if not cupom:
            raise CupomNaoEncontrado(codigo)
        if cupom.expirado:
            raise CupomExpirado(cupom.validade)

        carrinho.aplicar_cupom(cupom)
        await self._carrinho_repo.salvar(carrinho)
        return carrinho
```

### 3.3 Repository (Data Access)
```python
# ✅ Apenas CRUD — sem lógica de negócio
class PostgresCarrinhoRepository(CarrinhoRepository):
    async def buscar(self, id: UUID) -> Carrinho | None:
        row = await self._session.get(CarrinhoORM, str(id))
        return CarrinhoORM.to_domain(row) if row else None

    async def salvar(self, carrinho: Carrinho) -> None:
        orm = CarrinhoORM.from_domain(carrinho)
        self._session.merge(orm)
        await self._session.flush()
```

## 4. DTO por camada — não vaze ORM/entity

```
HTTP Request JSON
      ↓
  RequestDTO (Pydantic/record/etc) — validação + deserialização
      ↓
  Domain Model (puro) — lógica de negócio
      ↓
  ORM Entity — mapeamento banco
      ↓
  SQL
```

Nunca exponha ORM Entity como response HTTP. Nunca coloque anotação JPA/SQLAlchemy no Domain Model.

## 5. Risco principal — Anemic Domain Model

Layered tem risco de virar **modelo anêmico**: entidades só com getters/setters, lógica toda no Service.

Mitigação:
- Mova invariantes para o domain model (`cupom.aplicar()` verifica expiração)
- Services **orquestram**, domínio **decide**
- Agregados com comportamento, não apenas dados

```python
# ✅ Domain model com comportamento
@dataclass
class Carrinho:
    id: CarrinhoId
    itens: list[ItemCarrinho]
    cupom: Cupom | None = None

    def aplicar_cupom(self, cupom: Cupom) -> None:
        if cupom.expirado:
            raise CupomExpirado(cupom.validade)
        if self.cupom is not None:
            raise CupomJaAplicado()
        self.cupom = cupom  # invariante garantida no domínio

# ❌ Anemic — só dados, lógica escapa para service
class Carrinho:
    def get_cupom(self): return self.cupom
    def set_cupom(self, c): self.cupom = c  # sem invariante
```

## 6. Anti-padrões de Layered Architecture

- ❌ Controller com lógica de negócio
- ❌ Repository retornando lógica de negócio
- ❌ Service importando `HTTPException` ou request/response schema
- ❌ Salto de camada: Controller chama diretamente Repository
- ❌ Modelos JPA/ORM retornados como response HTTP
- ❌ God Service com > 500 linhas (divida por domínio)
- ❌ Circular: Service A chama Service B que chama Service A

## 7. Fitness functions

```yaml
- name: No controller → repository direct call
  run: |
    # Python
    if grep -rn "Repository\|_repo" src/*/api/; then
      echo "❌ Controller acessando repository diretamente" && exit 1
    fi

- name: No service importing http schemas
  run: |
    if grep -rn "from.*api.*schema\|from.*router\|HTTPException" src/*/services/; then
      echo "❌ Service importando conceitos HTTP" && exit 1
    fi
```
