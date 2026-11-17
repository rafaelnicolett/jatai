---
id: arch-ddd-tactical
name: arch-ddd-tactical
type: skill
description: DDD Tático — Aggregate Root, Entity, Value Object, Domain Event, Repository por aggregate, Domain Service. Aplicável a qualquer stack backend.
applicable_to:
  - "@backend-python-api"
  - "@backend-java"
  - "@backend-dotnet"
  - "@domain-modeler"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-ddd-tactical

> Define a **estrutura e padrões táticos do DDD** — blocos de construção do modelo de domínio.
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.
> Para padrões estratégicos (Bounded Contexts, Context Map), veja `domain-driven-design`.

---

## 1. Blocos de construção do DDD Tático

```
┌─────────────────────────────────────────────────────────┐
│  Bounded Context: Checkout                              │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │  Aggregate: Carrinho                         │       │
│  │  ┌───────────────┐  ┌────────────────────┐  │       │
│  │  │ Aggregate Root│  │ Entity: ItemCarrinho│  │       │
│  │  │ Carrinho      │→ │ (id próprio, dentro │  │       │
│  │  │ (id global)   │  │  do aggregate)      │  │       │
│  │  └───────────────┘  └────────────────────┘  │       │
│  │         │                                    │       │
│  │         ↓ Value Objects (imutáveis)          │       │
│  │  Money, Percentual, CarrinhoId, CupomCodigo │       │
│  │         │                                    │       │
│  │         ↓ Domain Events (after change)       │       │
│  │  CupomAplicadoEvent, ItemAdicionadoEvent     │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
│  Repository: ICarrinhoRepository (interface no domínio) │
│  Domain Service: CalculadoraFrete (lógica sem estado)   │
└─────────────────────────────────────────────────────────┘
```

## 2. Aggregate Root

- É o único ponto de entrada do aggregate
- Garante invariantes do grupo de objetos
- Tem um ID global único
- **Uma transação = um aggregate** (regra padrão)

```python
# Python — Aggregate Root
@dataclass
class Carrinho:  # Aggregate Root
    id: CarrinhoId                          # ID único
    cliente_id: ClienteId
    _itens: list[ItemCarrinho] = field(default_factory=list, repr=False)
    _cupom: Cupom | None = field(default=None, repr=False)
    _eventos: list[DomainEvent] = field(default_factory=list, repr=False)

    # ✅ Método de negócio — garante invariante
    def adicionar_item(self, produto_id: ProdutoId, quantidade: int, preco: Money) -> None:
        if quantidade <= 0:
            raise ValueError("Quantidade deve ser positiva")
        item_existente = self._encontrar_item(produto_id)
        if item_existente:
            item_existente.incrementar(quantidade)
        else:
            self._itens.append(ItemCarrinho(ItemCarrinhoId.novo(), produto_id, quantidade, preco))
        self._eventos.append(ItemAdicionadoEvent(self.id, produto_id, quantidade))

    def aplicar_cupom(self, cupom: Cupom) -> None:
        if cupom.expirado:
            raise CupomExpirado(cupom.validade)
        if self._cupom is not None:
            raise CupomJaAplicado()
        self._cupom = cupom
        self._eventos.append(CupomAplicadoEvent(self.id, cupom.codigo))

    @property
    def eventos(self) -> list[DomainEvent]:
        return list(self._eventos)

    def limpar_eventos(self) -> None:
        self._eventos.clear()
```

## 3. Entity

- Tem identidade própria dentro do aggregate
- Pode ter estado mutável
- Só acessada através do Aggregate Root

```python
@dataclass
class ItemCarrinho:  # Entity (pertence ao aggregate Carrinho)
    id: ItemCarrinhoId     # ID próprio, mas só relevante dentro do carrinho
    produto_id: ProdutoId
    _quantidade: int
    preco_unitario: Money

    def incrementar(self, delta: int) -> None:
        if delta <= 0:
            raise ValueError("Delta deve ser positivo")
        self._quantidade += delta

    @property
    def quantidade(self) -> int:
        return self._quantidade

    @property
    def subtotal(self) -> Money:
        return self.preco_unitario * self._quantidade
```

## 4. Value Object

- Sem identidade — igualdade por valor
- Imutável
- Auto-valida no construtor

```python
# Python — Value Object com frozen dataclass
@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str = "BRL"

    def __post_init__(self) -> None:
        if self.amount < 0:
            raise ValueError("Money não pode ser negativo")
        if len(self.currency) != 3:
            raise ValueError("Currency deve ser código ISO 3166")

    def __add__(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError("Não é possível somar moedas diferentes")
        return Money(self.amount + other.amount, self.currency)

    def __mul__(self, factor: int | Decimal) -> "Money":
        return Money(self.amount * Decimal(str(factor)), self.currency)

@dataclass(frozen=True)
class CarrinhoId:
    value: UUID

    def __str__(self) -> str:
        return str(self.value)

    @classmethod
    def novo(cls) -> "CarrinhoId":
        return cls(uuid4())
```

```java
// Java — Value Object com record
public record Money(BigDecimal amount, String currency) {
    public Money {
        Objects.requireNonNull(amount);
        if (amount.compareTo(BigDecimal.ZERO) < 0)
            throw new IllegalArgumentException("Money não pode ser negativo");
        if (currency.length() != 3)
            throw new IllegalArgumentException("Currency deve ser código ISO 3166");
    }

    public Money add(Money other) {
        if (!this.currency.equals(other.currency))
            throw new IllegalArgumentException("Moedas diferentes");
        return new Money(this.amount.add(other.amount), this.currency);
    }
}
```

## 5. Domain Event

- Imutável — descreve o que aconteceu
- Levantado pelo Aggregate Root
- Processado fora do aggregate (handler, outbox)

```python
@dataclass(frozen=True)
class DomainEvent:
    id: EventId = field(default_factory=EventId.novo)
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))

@dataclass(frozen=True)
class CupomAplicadoEvent(DomainEvent):
    carrinho_id: CarrinhoId = field(default=None)
    cupom_codigo: str = field(default=None)
    desconto_percentual: Decimal = field(default=None)
```

```java
// Java — Domain Event
public record CupomAplicadoEvent(
    EventId id,
    Instant occurredAt,
    CarrinhoId carrinhoId,
    String cupomCodigo,
    BigDecimal descontoPercentual
) implements DomainEvent {
    public static CupomAplicadoEvent of(CarrinhoId id, Cupom cupom) {
        return new CupomAplicadoEvent(
            EventId.random(), Instant.now(), id, cupom.getCodigo(), cupom.getDesconto()
        );
    }
}
```

## 6. Repository — interface no domínio, implementação no adapter

```python
# domain/ports/carrinho_repository.py — INTERFACE no domínio
from abc import ABC, abstractmethod

class CarrinhoRepository(ABC):
    @abstractmethod
    async def buscar(self, id: CarrinhoId) -> Carrinho | None: ...

    @abstractmethod
    async def salvar(self, carrinho: Carrinho) -> None: ...

# Regras:
# - 1 repository por aggregate root (não por entity interna)
# - Retorna aggregate completo — nunca lazy load depois
# - Repositório não tem lógica de negócio
# - Coleções de agregados, não de tabelas
```

## 7. Domain Service

Quando uma lógica não pertence naturalmente a nenhum aggregate:

```python
# domain/services/calculadora_frete.py
class CalculadoraFrete:
    """
    Lógica de frete envolve Carrinho + Endereço + Tabela de preços.
    Não pertence a nenhum aggregate — domain service.
    """
    def calcular(self, carrinho: Carrinho, destino: Endereco, tabela: TabelaFrete) -> Money:
        peso_total = sum(item.peso * item.quantidade for item in carrinho.itens)
        distancia = tabela.distancia_km(destino)
        return tabela.calcular_custo(peso_total, distancia)
```

## 8. Estrutura de diretórios canônica

```
src/<context>/
├── domain/
│   ├── model/
│   │   ├── carrinho.py              # Aggregate Root
│   │   ├── item_carrinho.py         # Entity
│   │   ├── value_objects.py         # Money, CarrinhoId, ProdutoId
│   │   └── cupom.py                 # Aggregate pequeno
│   ├── events/
│   │   └── carrinho_events.py       # CupomAplicadoEvent, ItemAdicionadoEvent
│   ├── services/
│   │   └── calculadora_frete.py     # Domain Service
│   ├── ports/
│   │   ├── carrinho_repository.py   # Interface
│   │   └── cupom_repository.py      # Interface
│   └── exceptions/
│       └── checkout_errors.py       # CupomExpirado, CarrinhoNaoEncontrado
├── application/
│   └── use_cases/
│       └── aplicar_cupom.py         # Orquestra domain objects
└── adapters/
    └── outbound/
        └── postgres/
            └── pg_carrinho_repo.py  # Implementação do repository
```

## 9. Anti-padrões de DDD Tático

- ❌ `CarrinhoService.get_cupom()` e `CarrinhoService.set_cupom()` — anemic
- ❌ Repository por tabela (ex: `ItemRepository`) — deve ser por aggregate root
- ❌ Domain Event com campo mutável
- ❌ Acesso direto a entity interna sem passar pelo Aggregate Root
- ❌ Lógica de negócio no repository (ex: `repo.buscar_carrinhos_com_desconto()` com regra embutida)
- ❌ Aggregate Root com referência a outro Aggregate Root (use ID)
- ❌ Domain Service com estado (deve ser stateless)
- ❌ Framework annotations no domain model (`@Entity`, `@Column`, `@Mapped`)
