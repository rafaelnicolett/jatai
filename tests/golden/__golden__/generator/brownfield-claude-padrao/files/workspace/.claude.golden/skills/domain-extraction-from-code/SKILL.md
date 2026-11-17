---
id: domain-extraction-from-code
name: domain-extraction-from-code
type: skill
description: >
  Engenharia reversa de domínio. Extrai bounded contexts, aggregates e linguagem
  ubíqua a partir do código existente (entities, services, schemas DB, rotas).
  Usada por @domain-extractor.
applicable_to:
  - "@domain-extractor"
inputs:
  - código fonte (entities, models, services)
  - schemas SQL/Prisma/ORM
  - rotas HTTP
outputs:
  - bounded contexts inferidos
  - linguagem ubíqua (tabela termo→significado→fontes)
  - aggregates candidatos com invariantes
---

# Skill: domain-extraction-from-code

> **O domínio está no código — só não escreveram um documento sobre ele.**
> Sua missão: torná-lo explícito.

## 1. Fontes de evidência (por ordem de confiabilidade)

| Fonte | O que extrai | Confiabilidade |
|---|---|---|
| Schemas DB / ORM models | Entities, relacionamentos, invariantes (constraints) | Alta |
| Migrations | Evolução do domínio ao longo do tempo | Alta |
| Use cases / services | Comportamentos do domínio | Média-Alta |
| Rotas HTTP / handlers | Operações expostas (capability) | Média |
| Nomes de classes/métodos | Linguagem ubíqua (com filtragem de ruído) | Média |
| Comentários e docs | Intenção declarada | Variável |
| Commits / PRs | Como o domínio evoluiu | Baixa-Média |

## 2. Extração de Bounded Contexts

Heurísticas:

1. **Agrupamento por pasta/package**: módulos em pastas separadas geralmente
   são contexts (especialmente em DDD-tactical, feature-based).
2. **Agrupamento por banco/schema**: schemas separados = contexts separados.
3. **Agrupamento por integração**: módulos que não compartilham models entre si.
4. **Linguagem inconsistente**: se `Customer` aparece com significado diferente
   em módulos diferentes, são contexts distintos.

## 3. Extração de Aggregates

Para cada contexto:

1. **Identifique entities raiz**: classes referenciadas por outras mas que não
   dependem delas (folha no grafo de composição).
2. **Cluster transacional**: entities que mudam juntas em uma transação são
   parte do mesmo aggregate.
3. **Foreign keys cascateando** → forte indício de mesmo aggregate.
4. **Lock optimistic compartilhado** → mesmo aggregate.
5. **Invariantes inferidas**:
   - Constraints DB (`NOT NULL`, `CHECK`, `UNIQUE`) → invariante
   - Validações em código antes de save → invariante
   - Computed fields → invariante derivada

## 4. Extração de Linguagem Ubíqua

Algoritmo:

1. Tokenizar nomes (classes, métodos, rotas, colunas, enums).
2. Contar frequência e variantes (`User`, `user`, `Account`, `Customer`).
3. Mapear cada termo para suas fontes.
4. **Flag de inconsistência**: termo aparece com significados diferentes
   em contextos diferentes (ex: `Order` é "pedido" em sales, "ordem de execução" em workflow).
5. **Termos de negócio vs. técnicos**: filtrar `Service`, `Repository`,
   `Controller`, `Util`, `Helper`, `Manager`.

## 5. Output sugerido

```markdown
## Bounded Contexts inferidos

### Context: `Sales`
- Módulos: `sales/`, `pricing/`, `discount/`
- Persistência: schema `sales_*`
- Linguagem própria: Order, Customer, Quote, Discount
- Operações expostas: POST /orders, GET /orders/{id}, ...

### Context: `Billing`
- Módulos: `billing/`, `invoicing/`
- Persistência: schema `billing_*`
- Linguagem própria: Invoice, Payment, Statement, BillingCycle
- Customer aqui = "entidade de cobrança" (DIFERENTE de Sales.Customer ⚠️)

## Linguagem Ubíqua

| Termo | Significado | Fontes | Inconsistências |
| Order | Pedido de venda | Sales.OrderEntity, /orders | nenhuma |
| Customer | Comprador | Sales.Customer | ⚠️ Billing.Customer significa "conta de cobrança" |
| Invoice | Fatura | Billing.InvoiceEntity | nenhuma |

## Aggregates candidatos

### Order (em Sales)
- Root: OrderEntity
- Entities: OrderLine, ShippingAddress
- VOs: Money, OrderStatus
- Invariantes inferidas:
  - Order deve ter ≥ 1 OrderLine (constraint DB)
  - status só transita conforme state machine (código em OrderEntity.changeStatus)
  - total = sum(lines) (computed em getTotal())
- Repository: OrderRepository
```

## 6. Anti-padrões a destacar

- **Anemic Domain**: entities só com props (sem comportamento)
- **God Aggregate**: aggregate com >10 entities
- **Sem invariantes**: validações só na controller (não no domínio)
- **Repository por entity** (não por aggregate root) — sinal de design DDD incompleto
