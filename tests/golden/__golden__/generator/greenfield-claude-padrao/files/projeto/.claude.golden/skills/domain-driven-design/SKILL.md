---
id: domain-driven-design
name: domain-driven-design
type: skill
description: Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service). Define artefatos canônicos em `docs/domain/` consumidos por @domain-modeler, @architecture, @bdd e @backend-*.
applicable_to:
  - "@domain-modeler"
  - "@architecture (consome Context Map para definir serviços/OpenAPI)"
  - "@bdd (usa Ubiquitous Language nos cenários)"
  - "@backend-* (implementa agregados/eventos)"
---

# Skill: domain-driven-design

> DDD não é "só nomes bonitos". É **alinhar negócio↔código** via uma
> linguagem compartilhada e **descobrir fronteiras** que minimizam
> acoplamento. Esta skill define o que produzir, em que ordem, e como
> validar.

---

## 0. Ciclo DDD ↔ BDD (fundamento do processo)

**DDD e BDD não são sequenciais — são uma espiral de 4 rodadas.**

```
Rodada 1 — @domain-modeler
  Event Storming → BCs + UL bruta + eventos brutos
        ↓ entrega para @bdd
Rodada 2 — @bdd
  Example Mapping por BC → cenários em UL bruta + bdd-hotspots.md
        ↓ entrega hotspots para @domain-modeler
Rodada 3 — @domain-modeler
  DDD Tático: Aggregates + VOs + invariantes + Domain Events (ricos pelos exemplos)
        ↓ entrega UL madura + modelo tático para @bdd
Rodada 4 — @bdd
  Cenários finais em UL madura → zero hotspot aberto
        ↓ entrega para @architecture e @sprint-planner
```

**Por que espiral?**
- Event Storming descobre *o que existe* (BCs, eventos brutos).
- Example Mapping descobre *o que deve acontecer* (invariantes, casos de borda, UL ambígua).
- Os exemplos concretos revelam lacunas que o Event Storming não captura.
- O DDD tático fica 10x mais rico quando alimentado por cenários reais.

**Hotspot**: qualquer ambiguidade que `@bdd` encontra nos cenários e não
consegue resolver com a UL bruta. Documenta em `bdd-hotspots.md` e devolve
ao `@domain-modeler`. Nunca inventa — sempre escala.

**Convergência**: máximo 2 ciclos. Se na rodada 3 ainda houver hotspots
críticos, `@domain-modeler` escala ao `@maestro` (stakeholder/negócio).

**Rastreabilidade resultante**:
```
BC → glossary.md (UL) → features/<bc>/*.feature → aggregates.md (invariantes)
```
Esta rastreabilidade é o que `@stream-align` valida no Gate G1.

---

## 1. Estratégico — descobrir fronteiras (Rodada 1)

### 1.1 Event Storming (Big Picture)
Antes de qualquer modelagem, conduza Event Storming a partir do
`business-brief.md` e `prd.md`:

1. Liste **eventos de domínio** (passado, em laranja): "PedidoCriado",
   "PagamentoAprovado", "EstoqueReservado".
2. Identifique **comandos** (azul) que disparam eventos.
3. Identifique **atores** (amarelo) e **políticas** (lilás).
4. Agrupe eventos por afinidade temporal e linguística → candidatos a
   **Bounded Contexts**.

Output: [docs/domain/event-storming.md](../../docs/domain/event-storming.md)
(lista ordenada de eventos + agrupamentos + hotspots/perguntas em aberto).

### 1.2 Bounded Contexts
Cada BC tem:
- **Nome** no idioma do negócio (não técnico).
- **Propósito** em 1 frase.
- **Linguagem ubíqua local** (glossário próprio — termos podem colidir entre BCs e está OK).
- **Conceitos centrais** (3-7 agregados/conceitos).
- **Eventos publicados** e **eventos consumidos**.

Output: [docs/domain/bounded-contexts.md](../../docs/domain/bounded-contexts.md).

### 1.3 Context Map
Relacionamento **entre** BCs com padrão explícito:

| Padrão | Quando |
|---|---|
| **Partnership** | Times alinhados, evolução conjunta |
| **Customer/Supplier** | Upstream define API; downstream tem voz |
| **Conformist** | Downstream se adapta sem voz |
| **Anti-Corruption Layer (ACL)** | Downstream protege seu modelo |
| **Open Host Service + Published Language** | Upstream expõe contrato estável |
| **Shared Kernel** | Subset compartilhado (USE COM PARCIMÔNIA) |
| **Separate Ways** | Sem integração |

Output: [docs/domain/context-map.md](../../docs/domain/context-map.md) +
diagrama Mermaid.

### 1.4 Subdomínios
Classifique cada BC:
- **Core** — vantagem competitiva (investimento alto, time sênior).
- **Supporting** — necessário, não diferencia (build com cuidado).
- **Generic** — comprar/usar SaaS/OSS quando possível.

## 2. Tático — modelar dentro de UM Bounded Context

### 2.1 Building blocks

| Bloco | Definição prática | Regras |
|---|---|---|
| **Value Object (VO)** | Imutável, identidade por valor | Sem ID, igualdade estrutural, validar no construtor |
| **Entity** | Identidade por ID, mutável no ciclo de vida | ID estável, equals por ID |
| **Aggregate** | Cluster transacional com **Aggregate Root** | Único ponto de entrada (Root), invariantes garantidas dentro do agregado |
| **Aggregate Root** | Entity que representa o agregado externamente | Externos só referenciam pelo ID do Root |
| **Domain Event** | Algo relevante que aconteceu (passado) | Imutável, nomeado em passado, sem dependência de infra |
| **Domain Service** | Lógica que não pertence a um único Aggregate | Stateless, opera sobre múltiplos agregados |
| **Repository** | Coleção persistente de Aggregate Roots | Interface no domínio, implementação na infra |
| **Factory** | Criação complexa de agregados | Garante invariantes na criação |
| **Specification** | Predicado de negócio reutilizável | Composable (and/or/not) |

### 2.2 Regras invariantes para Aggregates
1. **Um Aggregate, uma transação.** Sem 2PC entre agregados.
2. Referência entre agregados **por ID**, nunca por objeto.
3. Invariantes **sempre** dentro do Root.
4. Tamanho do agregado é o **menor possível** que mantém invariantes.
5. Mudança em outro agregado → via **Domain Event**, eventualmente consistente.

### 2.3 Ubiquitous Language (UL)
- Glossário **por BC** em `docs/domain/<bc>/glossary.md`.
- Termos da UL aparecem **idênticos** em: PRD, Gherkin, código, OpenAPI, logs.
- Se o time hesitar entre 2 termos → escolha 1, registre o sinônimo banido.

## 3. Artefatos canônicos (estrutura)

```
docs/domain/
├── event-storming.md
├── bounded-contexts.md         # lista + propósito + UL local
├── context-map.md              # relações + diagrama mermaid
├── subdomain-classification.md # core/supporting/generic
└── <bounded-context-slug>/
    ├── glossary.md             # ubiquitous language local
    ├── aggregates.md           # roots, entities, VOs, invariantes
    ├── events.md               # eventos publicados/consumidos
    ├── policies.md             # regras/políticas de negócio
    └── diagram.md              # mermaid (classes + eventos)
```

## 4. Templates

### Aggregate (em `aggregates.md`)
```markdown
## <NomeAgregado>

**Root:** `<EntityRoot>`
**Propósito:** 1 frase em UL.

### Entities/VOs internos
- `<Entity>` — <papel>
- `<VO>` — <invariante principal>

### Invariantes
- INV-1: <regra que SEMPRE é verdadeira>
- INV-2: ...

### Comandos aceitos
- `<Comando>(input) → <Evento> | erro`

### Eventos publicados
- `<EventoNoPassado>` — <quando>

### Referencia outros agregados por
- `<OutroAgregadoId>`
```

### Domain Event (em `events.md`)
```markdown
## <EventoNoPassado>

**Publisher:** `<Agregado>`
**Quando:** <comando que dispara>
**Payload:** (usar UL — sem termos técnicos)
| Campo | Tipo | Descrição |
|---|---|---|
| ... | ... | ... |
**Subscribers conhecidos:**
- `<OutroBC>` — <reação>
```

## 5. Heurísticas de validação (usadas por @arch-cross)

- [ ] Cada BC tem 1 propósito claro em 1 frase
- [ ] Context Map cobre 100% dos BCs (sem ilhas órfãs)
- [ ] Aggregates não passam de ~5-7 entidades internas
- [ ] Nenhuma referência **direta** entre agregados (só por ID)
- [ ] Eventos nomeados no passado e imutáveis
- [ ] UL aparece igual em PRD, Gherkin, código, OpenAPI
- [ ] Subdomain classification feita (core/supporting/generic)
- [ ] Cada agregado declara invariantes verificáveis
- [ ] Polices documentadas separadas dos agregados

## 6. Anti-padrões (que esta skill rejeita)

- ❌ **Anemic Domain Model**: agregado só com getters/setters; lógica em "service".
- ❌ **God Aggregate**: agregado de 30+ entidades, transação eterna.
- ❌ **Direct Reference**: `pedido.cliente.endereco.cep` cross-aggregate.
- ❌ **CRUD-first**: modelar começando pelas tabelas (mate isso).
- ❌ **Linguagem técnica vazando**: "OrderDTO", "OrderRequest" em vez de "Pedido".
- ❌ **BC mega-grande**: 1 BC = "todo o sistema" (não descobriu fronteira).
- ❌ **Shared Database**: 2 BCs no mesmo schema.
- ❌ **Sincrono entre BCs**: chamada HTTP onde devia ser evento.

## 7. Handoff (para outros agentes)

| Para | Entrega |
|---|---|
| `@bdd` | UL + comandos por agregado → cenários Gherkin já no idioma certo |
| `@architecture` | Context Map + eventos → desenho de serviços + OpenAPI + tópicos |
| `@backend-*` | Aggregates + invariantes + eventos → módulos com mesmo nome em UL |
| `@arch-cross` | Rubricas da seção 5 → checklist no gate |
