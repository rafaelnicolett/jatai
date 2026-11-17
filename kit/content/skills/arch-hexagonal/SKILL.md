---
id: arch-hexagonal
name: arch-hexagonal
type: skill
description: Arquitetura Hexagonal (Ports & Adapters) — estrutura de pastas, regras de dependência, adaptadores e fitness functions. Agnóstica de linguagem.
applicable_to:
  - "@backend-python-api"
  - "@backend-java"
  - "@backend-dotnet"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-hexagonal

> Define a **estrutura e regras de camadas** do padrão Hexagonal (Ports & Adapters).
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.

---

## 1. Princípios fundamentais

O hexágono isola o **domínio** do mundo externo. Toda dependência aponta **para dentro**.

```
Mundo externo          │  Hexágono (seu app)  │  Mundo externo
─────────────────      │                      │  ─────────────────
REST / CLI / MQ  ──→   │  Driving Adapters     │
                       │    ↓                  │
                       │  Driving Ports        │
                       │    ↓                  │
                       │  Application Layer    │
                       │  (Use Cases)          │
                       │    ↓                  │
                       │  Domain Layer         │
                       │  (Aggregates, VOs)    │
                       │    ↓                  │
                       │  Driven Ports         │
                       │    ↓                  │
                       │  Driven Adapters  ──→ │  Postgres, Redis, S3
```

**Regra de dependência**: camadas internas não importam camadas externas.

```
Domain ← Application ← Adapters ← Main/Config
```

Nenhuma flecha pode inverter o sentido.

## 2. Estrutura de diretórios canônica

### Python (FastAPI)
```
src/
└── <bounded_context>/
    ├── domain/
    │   ├── model/           # Aggregates, Entities, Value Objects
    │   ├── ports/           # Interfaces de repositórios e serviços externos
    │   │   ├── outbound/    # ex: CarrinhoRepository (interface)
    │   │   └── inbound/     # ex: AplicarCupomUseCase (interface, opcional)
    │   └── events/          # Domain Events
    ├── application/
    │   ├── use_cases/       # Orquestração — depende só de domain.ports
    │   └── dto/             # Command/Query objects (entrada/saída do application)
    ├── adapters/
    │   ├── inbound/
    │   │   ├── http/        # FastAPI routers, request/response schemas
    │   │   └── events/      # Consumers (Kafka, SQS)
    │   └── outbound/
    │       ├── postgres/    # SQLAlchemy repositories
    │       ├── redis/       # Cache adapters
    │       └── http_client/ # Chamadas a serviços externos
    └── main.py              # Wiring: DI, router registration
```

### Java (Spring Boot)
```
src/main/java/com/empresa/<context>/
├── domain/
│   ├── model/               # Aggregates, Entities, Value Objects
│   ├── port/
│   │   ├── in/              # Driving ports (interfaces de use case)
│   │   └── out/             # Driven ports (interfaces de repositório/serviço)
│   └── event/               # Domain Events
├── application/
│   └── service/             # Use Case implementations (dependem de port.out)
├── adapter/
│   ├── in/
│   │   ├── web/             # @RestController, DTOs HTTP
│   │   └── messaging/       # @KafkaListener, message DTOs
│   └── out/
│       ├── persistence/     # @Repository, JPA entities, mappers
│       └── client/          # RestClient/WebClient calls
└── HexApplication.java      # @SpringBootApplication + @Bean wiring
```

### .NET (Minimal API)
```
src/
└── <Context>/
    ├── Domain/
    │   ├── Model/           # Aggregates, Value Objects, Domain Events
    │   └── Ports/
    │       ├── In/          # IXxxUseCase interfaces
    │       └── Out/         # IXxxRepository, IXxxService interfaces
    ├── Application/
    │   └── UseCases/        # Implementations of Domain.Ports.In
    ├── Adapters/
    │   ├── In/
    │   │   ├── Http/        # Minimal API endpoints, request/response records
    │   │   └── Messaging/   # Consumer handlers
    │   └── Out/
    │       ├── Postgres/    # EF Core DbContext, Repository implementations
    │       └── HttpClient/  # Typed HttpClient implementations
    └── Program.cs           # DI wiring + route registration
```

## 3. Regras de importação por camada

| Camada | Pode importar | Proibido importar |
|---|---|---|
| `domain` | Só stdlib / language primitives | `application`, `adapters`, frameworks (FastAPI, Spring, EF) |
| `application` | `domain.*` | `adapters.*`, frameworks de I/O |
| `adapters.inbound` | `application.*`, `domain.dto` | Outros adapters outbound |
| `adapters.outbound` | `domain.ports.out`, `domain.model` | `application.*`, outros adapters |
| `main/config` | Tudo | — |

## 4. Ports — contrato obrigatório

Cada porta é uma interface no domínio. O adaptador implementa a interface.

```python
# domain/ports/outbound/carrinho_repository.py
from abc import ABC, abstractmethod
from domain.model.carrinho import Carrinho, CarrinhoId

class CarrinhoRepository(ABC):
    @abstractmethod
    async def buscar(self, id: CarrinhoId) -> Carrinho | None: ...

    @abstractmethod
    async def salvar(self, carrinho: Carrinho) -> None: ...

# adapters/outbound/postgres/postgres_carrinho_repository.py
# ✅ Adapter conhece a porta, domínio não conhece o adapter
class PostgresCarrinhoRepository(CarrinhoRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def buscar(self, id: CarrinhoId) -> Carrinho | None:
        row = await self._session.get(CarrinhoORM, str(id))
        return CarrinhoORM.to_domain(row) if row else None
```

## 5. Wiring — somente em main/config

```python
# main.py — único lugar onde tudo se conecta
def build_container() -> Container:
    session_factory = create_async_session_factory(settings.DATABASE_URL)

    carrinho_repo = PostgresCarrinhoRepository(session_factory)
    cupom_repo = PostgresCupomRepository(session_factory)
    event_publisher = OutboxEventPublisher(session_factory)

    aplicar_cupom = AplicarCupomUseCase(carrinho_repo, cupom_repo, event_publisher)

    return Container(aplicar_cupom=aplicar_cupom)
```

## 6. Anti-padrões hexagonais

- ❌ ORM entity no domínio (ex: `@Entity` JPA ou SQLAlchemy model em `domain/model`)
- ❌ Import de framework no domínio (ex: `from fastapi import ...` em `domain/`)
- ❌ Use case chamando diretamente outro adapter (deve chamar port)
- ❌ Controller com lógica de negócio
- ❌ Repository sem interface no domínio (viola inversão de dependência)
- ❌ Domain event disparado fora da camada de domínio

## 7. Fitness functions — CI obrigatório

```yaml
# .github/workflows/arch-check.yml
- name: Domain purity (Python)
  run: |
    # Nenhum import de adapter ou framework no domínio
    if grep -rn "from fastapi\|from sqlalchemy\|import redis" src/*/domain/; then
      echo "❌ Framework leak no domínio" && exit 1
    fi

- name: Domain purity (Java — ArchUnit)
  # src/test/java/ArchRulesTest.java
  # layeredArchitecture().layer("Domain").definedBy("..domain..")
  #     .whereLayer("Domain").mayNotAccessLayersExcept()
  run: mvn test -Dtest=ArchRulesTest

- name: Domain purity (.NET — NetArchTest)
  # Types().That().ResideInNamespace("*.Domain").ShouldNot()
  #     .HaveDependencyOn("Microsoft.AspNetCore")
  run: dotnet test --filter Category=ArchTest
```

```python
# Python — ArchUnit equivalent com importlinter
# setup.cfg
[importlinter]
root_packages = src

[importlinter:contract:domain-pure]
name = Domain must not import adapters or frameworks
type = forbidden
source_modules = *.domain
forbidden_modules =
    fastapi
    sqlalchemy
    redis
    adapters
```
