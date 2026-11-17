---
id: openapi-governance
name: openapi-governance
type: skill
description: Padrões e governança para contratos OpenAPI — versionamento, lint, breaking change detection, geração de SDK, modelos C4 (4 níveis) e diagramas de sequência.
applicable_to:
  - "@architecture"
  - "@arch-cross"
  - "@backend-*"
  - "@reviewer"
---

# Skill: openapi-governance

## 1. Princípios fundamentais
- **Contract-first**: OpenAPI é a fonte da verdade. Código implementa o contrato — nunca o contrário.
- **Versionamento semver** (`/v1/`, `/v2/`); breaking change = nova major.
- **Lint obrigatório** (Spectral ou similar) no CI.
- **Geração de SDK** para clientes (backends e frontends) a partir do contrato.
- **Linguagem ubíqua**: `operationId`, schemas e parâmetros em UL do domínio.

## 2. Padrões transversais

### 2.1 Error Envelope (único por sistema)
```json
{
  "code": "DOMINIO.CONTEXTO.CODIGO_ERRO",
  "message": "Mensagem legível para humanos",
  "details": [
    { "field": "cupom", "issue": "expirado", "value": "PROMO10" }
  ],
  "traceId": "4b3e2a1f..."
}
```
- `code`: hierárquico com pontos. Ex: `CHECKOUT.CUPOM.EXPIRADO`
- `message`: nunca expõe stack trace ou nome de tabela
- `details`: lista de problemas por campo (ideal para validação)
- `traceId`: propagado do header `X-Trace-Id`

### 2.2 Headers obrigatórios
- Requisição: `X-Request-Id` (UUID gerado pelo cliente), `Authorization: Bearer <jwt>`
- Resposta: `X-Trace-Id` (propagado do span OTel), `X-Request-Id` (ecoado)

### 2.3 Paginação cursor-based
```yaml
parameters:
  - name: cursor
    in: query
    schema: { type: string }
    description: Cursor opaco da página anterior (base64)
  - name: limit
    in: query
    schema: { type: integer, default: 20, maximum: 100 }
responses:
  '200':
    content:
      application/json:
        schema:
          properties:
            items: { type: array, items: { $ref: '#/components/schemas/Pedido' } }
            next_cursor: { type: string, nullable: true }
            total: { type: integer }
```

### 2.4 Datas e IDs
- Datas: ISO 8601 UTC (`2024-01-15T10:30:00Z`)
- IDs: UUID v4 (string). Nunca integer auto-increment na API pública.
- Monetário: integer em centavos (evita float) ou `string` com ponto (`"19.90"`)

### 2.5 Versionamento de API
- URL path versioning: `/v1/`, `/v2/`
- Breaking changes (novos major): novo endpoint paralelo, deprecation notice, período de sunset
- Non-breaking: adicionar campo opcional, adicionar endpoint, relaxar validação

## 3. Validações no gate (`@arch-cross`)
- [ ] Lint OpenAPI verde (Spectral + `spectral:oas` ruleset)
- [ ] Sem breaking change não intencional vs. versão anterior (`oasdiff`)
- [ ] Cobre todas as features do `feature-list.md`
- [ ] Backend implementa todos os endpoints (schemathesis confirma)
- [ ] Front consome via SDK gerado, não chamadas raw
- [ ] Error envelope único em todos os endpoints de erro
- [ ] Paginação cursor-based em todas as listagens
- [ ] Auth declarada em todos os endpoints (SecurityScheme)

## 4. Modelos C4 — obrigatórios para cada serviço

O modelo C4 (C4Model.com) define 4 níveis de abstração arquitetural.
O `@architecture` produz os níveis 1-3 antes do downstream.

### 4.1 Nível 1 — Context (visão macro)

Mostra o **sistema como caixa preta** e seus atores/sistemas externos.

```markdown
<!-- docs/architecture/c4-context.md -->
## C4 — Nível 1: Context

```mermaid
C4Context
  title Sistema de Checkout — Diagrama de Contexto

  Person(cliente, "Cliente", "Comprador que finaliza pedido")
  Person(admin, "Operador", "Gerencia cupons e aprovações")

  System(checkout, "Checkout System", "Gerencia carrinho, cupons e criação de pedidos")

  System_Ext(pagamento, "Gateway de Pagamento", "Stripe / PagSeguro")
  System_Ext(estoque, "Sistema de Estoque", "ERP de estoque e reservas")
  System_Ext(email, "Serviço de Email", "SendGrid / SES")
  System_Ext(auth, "Identity Provider", "Keycloak / Auth0")

  Rel(cliente,  checkout,  "Finaliza carrinho", "HTTPS")
  Rel(admin,    checkout,  "Gerencia cupons",   "HTTPS")
  Rel(checkout, pagamento, "Processa cobrança", "HTTPS/webhook")
  Rel(checkout, estoque,   "Reserva itens",     "gRPC/Kafka")
  Rel(checkout, email,     "Envia confirmação", "HTTPS")
  Rel(checkout, auth,      "Valida JWT",        "HTTPS")
```
```

**Checklist nível 1:**
- [ ] Todos os atores humanos identificados
- [ ] Todos os sistemas externos identificados
- [ ] Protocolos de comunicação rotulados
- [ ] Sistema principal descrito com responsabilidade clara

### 4.2 Nível 2 — Container (serviços e tecnologias)

Mostra os **containers** (apps, databases, microserviços) dentro do sistema.

```markdown
<!-- docs/architecture/c4-container.md -->
## C4 — Nível 2: Container

```mermaid
C4Container
  title Sistema de Checkout — Diagrama de Container

  Person(cliente, "Cliente")
  Person(admin, "Operador")

  System_Boundary(checkout_sys, "Checkout System") {
    Container(portal, "Portal Web", "React + Vite", "Interface do cliente e admin")
    Container(api_gw, "API Gateway", "Nginx / Kong", "Rate limit, auth bypass, routing")
    Container(checkout_api, "Checkout API", "Python + FastAPI", "Lógica de checkout")
    Container(cupom_api, "Cupom API", "Python + FastAPI", "Gerenciamento de cupons")
    ContainerDb(db, "Database", "PostgreSQL 16", "Pedidos, cupons, carrinhos")
    ContainerDb(cache, "Cache", "Redis 7", "Sessões de carrinho, rate limit")
    Container(event_bus, "Event Bus", "Kafka", "PedidoCriado, CupomAplicado...")
  }

  System_Ext(pagamento, "Gateway de Pagamento")
  System_Ext(estoque, "Sistema de Estoque")

  Rel(cliente,      portal,       "Usa",            "HTTPS")
  Rel(admin,        portal,       "Administra",     "HTTPS")
  Rel(portal,       api_gw,       "API calls",      "HTTPS/REST")
  Rel(api_gw,       checkout_api, "Routes",         "HTTP")
  Rel(api_gw,       cupom_api,    "Routes",         "HTTP")
  Rel(checkout_api, db,           "Lê/Escreve",     "PostgreSQL")
  Rel(checkout_api, cache,        "Sessão",         "Redis")
  Rel(checkout_api, event_bus,    "Publica eventos","Kafka")
  Rel(checkout_api, pagamento,    "Cobra",          "HTTPS")
  Rel(checkout_api, estoque,      "Reserva",        "gRPC")
  Rel(event_bus,    estoque,      "PedidoCriado",   "Kafka")
```
```

**Checklist nível 2:**
- [ ] Todos os microserviços identificados com tecnologia
- [ ] Databases, caches e message brokers presentes
- [ ] Protocolos entre containers rotulados
- [ ] Frontends e API Gateways incluídos

### 4.3 Nível 3 — Component (módulos internos de um serviço)

Mostra os **componentes principais** dentro de um container específico.
Produza para cada serviço **core** (classificado como Core Subdomain).

```markdown
<!-- docs/architecture/c4-component-checkout-api.md -->
## C4 — Nível 3: Component — Checkout API

```mermaid
C4Component
  title Checkout API — Diagrama de Componente

  Container_Boundary(checkout_api, "Checkout API (FastAPI)") {
    Component(router, "HTTP Router", "FastAPI router", "Recebe requests, valida JWT, formata responses")
    Component(uc_finalizar, "FinalizarCarrinhoUseCase", "Application", "Orquestra finalização do pedido")
    Component(uc_aplicar, "AplicarCupomUseCase", "Application", "Valida e aplica cupom no carrinho")
    Component(domain_carrinho, "Carrinho Aggregate", "Domain", "Invariantes do carrinho")
    Component(domain_cupom, "Cupom Aggregate", "Domain", "Regras de validade e uso de cupom")
    Component(repo_carrinho, "CarrinhoRepository", "Adapter/Out", "PostgreSQL — persiste estado do carrinho")
    Component(repo_cupom, "CupomRepository", "Adapter/Out", "PostgreSQL — busca e atualiza cupons")
    Component(event_pub, "DomainEventPublisher", "Adapter/Out", "Publica eventos no Kafka")
  }

  Rel(router,       uc_finalizar,    "Chama")
  Rel(router,       uc_aplicar,      "Chama")
  Rel(uc_finalizar, domain_carrinho, "Usa")
  Rel(uc_aplicar,   domain_cupom,    "Usa")
  Rel(uc_finalizar, repo_carrinho,   "Persiste via Port")
  Rel(uc_aplicar,   repo_cupom,      "Busca/Atualiza via Port")
  Rel(uc_finalizar, event_pub,       "Publica PedidoCriado")
  Rel(uc_aplicar,   event_pub,       "Publica CupomAplicado")
```
```

**Checklist nível 3:**
- [ ] Componentes de cada camada hexagonal visíveis
- [ ] Ports (interfaces) distinguíveis de adapters
- [ ] Domínio sem dependência de adapters
- [ ] Use cases como orquestradores explícitos

### 4.4 Nível 4 — Code (opcional)

Diagramas de classe para agregados complexos. Use Mermaid `classDiagram`.
Só para domínios com muitas invariantes cruzadas (ex: sistema financeiro).

```mermaid
classDiagram
  class Carrinho {
    +CarrinhoId id
    +ClienteId clienteId
    +List~ItemCarrinho~ itens
    +Cupom? cupomAplicado
    +Money totalBruto()
    +Money totalLiquido()
    +aplicarCupom(Cupom, LocalDate)
    +finalizar() PedidoId
  }
  class ItemCarrinho {
    +ProdutoId produtoId
    +Quantidade quantidade
    +Money precoUnitario
  }
  class Cupom {
    +CupomId id
    +String codigo
    +LocalDate validade
    +Desconto desconto
    +validar(LocalDate) Result~Cupom, CupomError~
  }
  Carrinho "1" *-- "*" ItemCarrinho
  Carrinho "0..1" --> "1" Cupom
```

## 5. Diagramas de sequência — fluxos críticos

Produza um diagrama `sequenceDiagram` (Mermaid) para cada **fluxo crítico**
do sistema. Mínimo: autenticação/autorização + fluxo principal do BC core.

### 5.1 Template de fluxo síncrono (REST)

```markdown
<!-- docs/architecture/seq-aplicar-cupom.md -->
## Sequência — Aplicar Cupom

```mermaid
sequenceDiagram
  actor Cliente
  participant Portal as Portal Web
  participant GW as API Gateway
  participant API as Checkout API
  participant DB as PostgreSQL
  participant Cache as Redis
  participant Kafka

  Cliente->>Portal: Clica em "Aplicar cupom PROMO10"
  Portal->>GW: POST /v1/carrinhos/{id}/cupom<br/>Authorization: Bearer JWT
  GW->>GW: Valida JWT (JWKS do IdP)
  GW->>API: POST /v1/carrinhos/{id}/cupom

  API->>Cache: GET carrinho:{id} (session)
  alt Cache hit
    Cache-->>API: Carrinho serializado
  else Cache miss
    API->>DB: SELECT * FROM carrinhos WHERE id = ?
    DB-->>API: Carrinho row
    API->>Cache: SET carrinho:{id} EX 300
  end

  API->>DB: SELECT * FROM cupons WHERE codigo = 'PROMO10'
  DB-->>API: Cupom row

  API->>API: Carrinho.aplicarCupom(cupom, hoje)
  alt Cupom válido
    API->>DB: UPDATE carrinhos SET cupom_id = ?
    API->>Kafka: CupomAplicadoNoCarrinho { carrinhoId, cupomCodigo, desconto }
    API-->>GW: 200 { totalBruto, desconto, totalLiquido }
    GW-->>Portal: 200
    Portal-->>Cliente: Exibe desconto aplicado
  else Cupom inválido
    API-->>GW: 422 { code: "CHECKOUT.CUPOM.EXPIRADO", message: "..." }
    GW-->>Portal: 422
    Portal-->>Cliente: Exibe mensagem de erro
  end
```
```

### 5.2 Template de fluxo assíncrono (Event-driven)

```markdown
<!-- docs/architecture/seq-pedido-criado-event.md -->
## Sequência — PedidoCriado (Event-Driven)

```mermaid
sequenceDiagram
  participant CheckoutAPI as Checkout API
  participant Kafka
  participant EstoqueAPI as Estoque API (Consumer)
  participant EmailAPI as Email API (Consumer)
  participant DB_Est as Estoque DB

  CheckoutAPI->>Kafka: Publish PedidoCriado<br/>{ pedidoId, itens, clienteEmail }

  par Consumo paralelo
    Kafka->>EstoqueAPI: PedidoCriado
    EstoqueAPI->>DB_Est: UPDATE estoque SET reservado += qtd WHERE produto_id IN (...)
    EstoqueAPI->>Kafka: EstoqueReservado (ou EstoqueInsuficiente)
  and
    Kafka->>EmailAPI: PedidoCriado
    EmailAPI->>EmailAPI: Renderiza template "Pedido Confirmado"
    EmailAPI-->>Kafka: EmailEnviado
  end

  Note over CheckoutAPI,DB_Est: Idempotência: event_id no header Kafka<br/>Consumer verifica deduplicação por event_id
```
```

### 5.3 Template de fluxo de autenticação (obrigatório)

```markdown
<!-- docs/architecture/seq-autenticacao.md -->
## Sequência — Autenticação e Autorização

```mermaid
sequenceDiagram
  actor Usuario
  participant Client as Frontend (SPA/App)
  participant IdP as Identity Provider<br/>(Keycloak/Auth0)
  participant GW as API Gateway
  participant API as Backend API

  Usuario->>Client: Login com credenciais
  Client->>IdP: POST /oauth/token (PKCE flow)
  IdP->>IdP: Valida credenciais
  IdP-->>Client: { access_token (JWT), refresh_token }

  Client->>GW: GET /v1/recurso<br/>Authorization: Bearer {access_token}
  GW->>IdP: GET /.well-known/jwks.json (cache)
  GW->>GW: Valida assinatura JWT + exp + iss + aud
  alt JWT válido
    GW->>API: GET /v1/recurso + X-User-Id: {sub} + X-Tenant-Id: {tenant}
    API-->>GW: 200 { recurso }
    GW-->>Client: 200
  else JWT expirado
    GW-->>Client: 401 { code: "AUTH.TOKEN.EXPIRADO" }
    Client->>IdP: POST /oauth/token (refresh_token)
    IdP-->>Client: { novo access_token }
    Client->>GW: Retry com novo token
  end
```
```

## 6. Padrões de API por categoria

### 6.1 CRUD com DDD (nunca expor aggregate internals)

```yaml
# ✅ Correto — operações de domínio
paths:
  /v1/carrinhos/{id}/cupom:
    post:
      operationId: aplicarCupomNoCarrinho
      summary: Aplica cupom de desconto no carrinho
  /v1/carrinhos/{id}/finalizar:
    post:
      operationId: finalizarCarrinho
      summary: Finaliza o carrinho e cria um pedido

# ❌ Errado — expõe implementação técnica
paths:
  /v1/carrinhos/{id}:
    patch:
      operationId: updateCarrinho   # PATCH genérico não expressa intenção
      requestBody:
        content:
          application/json:
            schema:
              properties:
                cupom_id: { type: string }   # expõe FK interna
```

### 6.2 CQRS (queries separadas de commands)

```yaml
# Commands (mudam estado) — geralmente POST
POST /v1/pedidos                     # CreatePedido
POST /v1/pedidos/{id}/cancelar       # CancelarPedido
POST /v1/carrinhos/{id}/finalizar    # FinalizarCarrinho

# Queries (apenas leitura) — GET com filtros
GET  /v1/pedidos?status=aguardando&cursor=...&limit=20
GET  /v1/pedidos/{id}
GET  /v1/clientes/{id}/historico-pedidos
```

### 6.3 Eventos (Webhook / Event schema)

```yaml
# Se o sistema publica webhooks, documente em AsyncAPI (complementa OpenAPI)
# asyncapi: "2.6.0"
# channels:
#   pedido.criado:
#     subscribe:
#       message:
#         payload:
#           $ref: '#/components/schemas/PedidoCriado'
components:
  schemas:
    PedidoCriado:
      type: object
      required: [event_id, event_type, occurred_at, payload]
      properties:
        event_id:    { type: string, format: uuid }
        event_type:  { type: string, example: "checkout.pedido.criado" }
        occurred_at: { type: string, format: date-time }
        schema_version: { type: string, example: "1.0" }
        payload:
          $ref: '#/components/schemas/Pedido'
```

## 7. Ferramentas e CI

```yaml
# Workflow de governança OpenAPI
- name: Lint OpenAPI
  run: npx @stoplight/spectral-cli lint api/openapi.yaml --ruleset .spectral.yaml

- name: Breaking change detection
  run: |
    oasdiff breaking api/openapi.yaml main:api/openapi.yaml

- name: Generate SDK
  run: |
    npx @openapitools/openapi-generator-cli generate \
      -i api/openapi.yaml \
      -g typescript-fetch \
      -o code/sdk/typescript/

- name: OpenAPI conformance test
  run: schemathesis run api/openapi.yaml --url $TEST_URL --checks all
```

```yaml
# .spectral.yaml — regras customizadas
extends: ["spectral:oas"]
rules:
  operation-operationId:    error   # todo endpoint deve ter operationId
  operation-summary:        error   # todo endpoint deve ter summary
  no-eval-in-markdown:      error
  info-contact:             warn
  # custom: operationId em camelCase da UL
  operation-id-casing:
    given: "$.paths..operationId"
    then:
      function: casing
      functionOptions: { type: camel }
```
