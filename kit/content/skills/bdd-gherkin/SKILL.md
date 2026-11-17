---
id: bdd-gherkin
name: bdd-gherkin
type: skill
description: Padrão profundo de BDD/Gherkin — escrita de cenários executáveis em UL do domínio, given/when/then declarativos, scenario outline, tags por release/risco/persona. Consumida por @bdd (escreve) e @qa-tester (implementa step defs).
applicable_to:
  - "@bdd (autoria)"
  - "@qa-tester (step definitions)"
  - "@stream-align (rubrica de cobertura)"
---

# Skill: bdd-gherkin

> BDD bom é **conversa antes de código**. Cenário ruim duplica teste e
> mente sobre cobertura. Cenário bom é executável, expressa intenção em
> UL e sobrevive a refactor.

---

## 0. Posição no ciclo DDD↔BDD

`@bdd` atua em **2 rodadas** dentro da espiral com `@domain-modeler`:

| Rodada | Input que recebe | O que produz |
|--------|-----------------|--------------|
| 2 (pré-tático) | BCs + UL bruta + eventos brutos | Cenários em UL bruta + `bdd-hotspots.md` |
| 4 (final) | UL madura + agregados formais | Cenários refinados (zero hotspot aberto) |

**Hotspot**: termo ambíguo, regra de negócio incerta, ou invariante não
coberta que `@bdd` encontra durante o Example Mapping. Nunca inventa —
documenta em `bdd-hotspots.md` e devolve ao `@domain-modeler`.

```yaml
# .github/artifacts/bdd-hotspots.md (exemplo de entrada)
- id: HS-01
  feature: checkout/aplicar-cupom
  termo: "carrinho abandonado"
  questao: "Cupom aplicado em carrinho abandonado expira junto? ou mantém?"
  impacto: high  # bloqueia invariante do Aggregate Carrinho
  status: open   # open | resolved
```

Hotspots `high` e `open` bloqueiam a rodada 4. `@domain-modeler` resolve
consultando especialistas do negócio / stakeholders via `@maestro`.

---

## 1. Estrutura canônica

```
features/
├── <bounded-context>/
│   └── <feature-slug>.feature       # 1 feature = 1 capability
└── support/
    └── README.md                    # convenções de step defs
```

Naming: `<feature-slug>.feature` em **kebab-case** com termos da UL.
Exemplo: `features/checkout/aplicar-cupom-de-desconto.feature`.

## 2. Template de feature

```gherkin
# language: pt
@bc:checkout @persona:cliente @release:R12 @risk:medium
Funcionalidade: Aplicar cupom de desconto no carrinho
  Como cliente do checkout
  Quero aplicar um cupom de desconto válido no meu carrinho
  Para reduzir o valor total da compra

  Contexto:
    Dado que existe um carrinho com itens no valor total de "R$ 200,00"
    E que o cliente está autenticado

  @happy-path
  Cenário: Cupom válido aplicado com sucesso
    Quando o cliente aplica o cupom "PROMO10"
    Então o carrinho exibe desconto de "R$ 20,00"
    E o valor final do carrinho é "R$ 180,00"
    E o evento "CupomAplicadoNoCarrinho" é publicado

  @validation
  Esquema do Cenário: Cupom inválido é rejeitado com mensagem específica
    Quando o cliente aplica o cupom "<cupom>"
    Então o carrinho mantém o valor de "R$ 200,00"
    E o sistema responde com a mensagem "<mensagem>"

    Exemplos:
      | cupom        | mensagem                          |
      | EXPIRADO     | Cupom expirado                    |
      | NAO_EXISTE   | Cupom não encontrado              |
      | JA_USADO     | Cupom já utilizado por este cliente |
```

## 3. Regras de escrita

### Estilo declarativo (não imperativo)
- ✅ `Quando o cliente aplica o cupom "PROMO10"`
- ❌ `Quando o cliente clica no input #cupom e digita "PROMO10" e clica em "Aplicar"`

UI/HTTP/SQL **não aparecem no .feature**. Vivem nos step defs.

### Linguagem ubíqua
Termos do `docs/domain/<bc>/glossary.md`. Se aparecer "DTO", "endpoint",
"tabela", está errado.

### Um cenário, um comportamento
Se o título tem "e", é 2 cenários.

### Dados como exemplos, não código
Use **Esquema do Cenário** (`Scenario Outline`) para variações de dados.

### Background com moderação
Só state realmente compartilhado por TODOS os cenários da feature.

## 4. Tags obrigatórias

| Tag | Valores | Uso |
|---|---|---|
| `@bc:<slug>` | nome do BC | Filtro por contexto |
| `@persona:<slug>` | persona do PRD | Filtro por usuário |
| `@release:<id>` | R12, R13... | Subset por release |
| `@risk:<level>` | low/medium/high | Prioriza execução |
| `@happy-path` / `@edge` / `@validation` / `@error` | — | Categorização |
| `@wip` | — | Excluir do CI principal |
| `@flaky` | — | Quarentena |

## 5. Step definitions (handoff p/ @qa-tester)

### Princípios
1. **1 step phrase = 1 step def** (sem `(.*)` engolindo tudo).
2. **Step def fina**: chama método de Page Object / API client / Domain helper.
3. **Sem assert no step Then?** Errado. Then SEMPRE valida.
4. **Sem state global**. Use World/Context object por cenário.

### Estrutura por stack (mesma intenção, idiomas diferentes)
```
features/support/
├── world.<ext>            # contexto compartilhado por cenário
├── steps/
│   ├── checkout_steps.<ext>
│   └── ...
└── helpers/
    ├── api_client.<ext>
    └── page_objects/
```

| Stack | Runner | Linguagem |
|---|---|---|
| python-api / python-agentic | `behave` ou `pytest-bdd` | Python |
| java | `cucumber-jvm` | Java |
| dotnet | `SpecFlow` (ou Reqnroll) | C# |
| react | `@cucumber/cucumber` + Playwright | TypeScript |
| flutter | `flutter_gherkin` | Dart |
| android | `cucumber-android` | Kotlin |
| ios | `XCUITest` + `Cucumberish` | Swift |

## 6. Rubricas de qualidade (usadas por @stream-align e @reviewer)

- [ ] Toda feature priorizada no `feature-list.md` tem `.feature`
- [ ] Toda feature tem **happy-path** + ≥1 **edge** + ≥1 **validation/error**
- [ ] Step phrases são únicas (sem ambiguidade)
- [ ] Linguagem é UL do BC (zero termos técnicos)
- [ ] `@release:<id>` presente em 100% dos cenários ativos
- [ ] CI roda subset por tag (smoke/regression/release)
- [ ] Cobertura: cada **comando** do agregado tem ≥1 cenário

## 7. Anti-padrões

- ❌ Cenário imperativo (clicks, IDs de DOM, SQL)
- ❌ `Cenário: tudo funciona` (vago)
- ❌ Background gigante (>5 steps)
- ❌ Step def regex catch-all
- ❌ Assert no Quando
- ❌ Compartilhar variável entre cenários (state leak)
- ❌ "Test Driven Documentation": .feature gerado depois do código (BDD perde sentido)
- ❌ Skip permanente sem ticket

---

## 8. Enforcement automático (CI)

O agente `@bdd` deve propor e o `@devops` deve configurar estas verificações
no pipeline de CI para garantir a qualidade dos cenários em toda release.

### 8.1 Linting de feature files

```bash
# gherkin-lint — verifica estrutura e tags
npx gherkin-lint features/ --config .gherkin-lintrc.json

# .gherkin-lintrc.json (regras recomendadas)
{
  "no-restricted-patterns": {
    "Global": [["click", "touch", "button", "input", "select", "SQL", "HTTP", "endpoint", "DTO"]]
  },
  "required-tags": {
    "tags": ["@bc:", "@persona:", "@release:", "@risk:"]
  },
  "no-unnamed-scenarios": true,
  "no-duplicate-scenarios": true
}
```

### 8.2 Cobertura de cenários vs. PRD features

```bash
# Verificar que cada feature do feature-list.md tem arquivo .feature
python scripts/check-bdd-coverage.py \
  --feature-list .github/artifacts/feature-list.md \
  --bdd-dir features/
```

Script: para cada feature no feature-list, verificar que existe pelo menos
um arquivo em `features/<bc>/<slug>.feature`.

### 8.3 Verificação de Linguagem Ubíqua

```bash
# Detectar termos técnicos proibidos nos .feature
grep -rn "click\|SQL\|endpoint\|DTO\|HTTP\|request\|response\|database\|table\|column" features/ \
  && echo "FALHOU: termos técnicos detectados" || echo "OK"
```

### 8.4 Integração no pipeline (exemplo GitHub Actions)

```yaml
# .github/workflows/bdd-quality.yml
name: BDD Quality Gate
on: [pull_request]
jobs:
  bdd-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint feature files
        run: npx gherkin-lint features/ --config .gherkin-lintrc.json
      - name: Check tags coverage
        run: |
          # Verificar @bc, @persona, @release, @risk em todos os cenários
          python scripts/check-bdd-tags.py features/
      - name: Detect technical terms
        run: |
          ! grep -rn "click\|SQL\|endpoint\|DTO" features/**/*.feature
```

---

## 9. Example Mapping — processo de descoberta

O **Example Mapping** é o workshop que o `@bdd` conduz com o cliente/PO
antes de escrever os cenários. Formato: 4 cores de post-its.

```
🟡 Feature / User Story (o quê)
🟢 Regras de negócio (invariantes)
🔵 Exemplos concretos (Given/When/Then)
🔴 Questões/Hotspots (incertezas)
```

**Protocolo para `@bdd`:**

1. Leia a feature do `feature-list.md` e os fluxos de UX (`docs/design/`).
2. Identifique as **regras de negócio** (amarelo) — cada regra vira Given/Then.
3. Para cada regra, liste **exemplos concretos** (azul) com dados reais.
4. Questões sem resposta → `bdd-hotspots.md` (vermelho).
5. Escreva os cenários APENAS após os hotspots serem resolvidos (status: resolved).

**Template de Example Mapping rápido (markdown):**

```markdown
## Example Mapping — [Feature: Aplicar Cupom]

### Regras
1. Cupom expirado deve ser rejeitado
2. Cupom já utilizado pelo mesmo cliente não pode ser reutilizado
3. Cupom com desconto > 50% precisa de aprovação manual

### Exemplos (por regra)
| Regra | Cenário | Dado | Quando | Então |
|---|---|---|---|---|
| 1 | Cupom expirado | cupom EXPIRADO com validade passada | aplicar cupom | rejeitado: "Cupom expirado" |
| 2 | Cupom já usado | cupom PROMO10 já usado por cliente X | cliente X aplica de novo | rejeitado: "Cupom já utilizado" |
| 3 | Desconto alto | cupom BIG60 com 60% de desconto | cliente aplica | entra em fila de aprovação |

### Hotspots (incertezas)
- [HS-01] "Aprovação manual" — quem aprova? em quanto tempo? o cupom fica reservado?
```

---

## 10. Mapeamento Event Storming → BDD

Os Domain Events do Event Storming mapeiam diretamente para os `Então` dos cenários.

| Event Storming | BDD Gherkin |
|---|---|
| **Comando** (`CriarPedido`) | `Quando o cliente cria um pedido com...` |
| **Domain Event** (`PedidoCriado`) | `Então o evento "PedidoCriado" é publicado` |
| **Política** (`Ao criar pedido, notificar estoque`) | Cenário de integração: `E o estoque é reservado` |
| **Read Model** (`Lista de pedidos`) | Cenário de Query: `Então o painel exibe o pedido em "Em andamento"` |
| **Hotspot** (sticker vermelho) | `bdd-hotspots.md` com status: open |

**Exemplo de mapeamento:**

```gherkin
# Event Storming: Comando "FinalizarCarrinho" → Event "PedidoCriado" → Policy "Reservar Estoque"

@bc:checkout @persona:cliente @release:R12 @risk:high @happy-path
Cenário: Carrinho finalizado gera pedido e reserva estoque
  Dado que o carrinho do cliente tem "2x Camiseta M" no valor de "R$ 120,00"
  E que o cliente tem endereço de entrega cadastrado
  Quando o cliente finaliza o carrinho
  Então o pedido é criado com status "Aguardando Pagamento"
  E o evento "PedidoCriado" é publicado com os itens do carrinho
  E o estoque de "Camiseta M" é reservado em "2 unidades"
```
