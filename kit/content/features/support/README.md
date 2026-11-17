# Convenções de Step Definitions

> Guia dos step definitions do projeto, para quem implementa os passos dos
> cenários (`@qa-tester` e o time). Como escrever os cenários está na skill
> `bdd-gherkin`.

---

## Estrutura

```
features/
├── <bounded-context>/             # um por contexto do domínio (docs/domain/)
│   └── <capacidade>.feature       # uma feature = uma capacidade, em kebab-case, com termos da linguagem ubíqua
└── support/
    ├── README.md                  ← este arquivo
    ├── world.<ext>                # contexto de cada cenário
    ├── steps/                     # um arquivo por assunto (ex.: checkout_steps.<ext>)
    └── helpers/                   # clientes de API, page objects, spies de evento
```

Exemplo: `features/checkout/aplicar-cupom-de-desconto.feature`.

---

## Runner por stack

Use o runner da stack do serviço ou do app que o cenário exercita:

| Stack | Runner | Linguagem |
|---|---|---|
| `python-api`, `python-agentic` | `behave` ou `pytest-bdd` | Python |
| `java-spring` | `cucumber-jvm` | Java |
| `dotnet-core` | `SpecFlow` (ou Reqnroll) | C# |
| `react-vite` | `@cucumber/cucumber` + Playwright | TypeScript |
| `flutter` | `flutter_gherkin` | Dart |
| `android-compose` | `cucumber-android` | Kotlin |
| `ios-swiftui` | `XCUITest` + `Cucumberish` | Swift |

Os steps ficam em `features/support/steps/` quando o runner permite. Os runners
de mobile leem os steps do projeto do app: mantenha neles a mesma divisão
(world, steps, helpers), no lugar que o runner exige.

---

## Princípios obrigatórios

1. **1 step phrase = 1 step def.** Sem regex catch-all que engole vários contextos.
2. **Step def fina.** Cada def chama um helper, client ou page object. Regra de negócio não mora no step.
3. **`Then` sempre valida.** Nunca um `Then` sem assert.
4. **Sem estado global.** Use um World/Context por cenário, criado e descartado a cada um.
5. **Termos do domínio.** Se o step diz "endpoint", "DTO" ou "tabela", está errado: use a linguagem ubíqua de `docs/domain/`.

---

## World object (contexto por cenário)

```python
# Python (behave / pytest-bdd): o estado de UM cenário
@dataclass
class ScenarioWorld:
    last_response: Any = None
    last_error: str | None = None
    emitted_events: list[str] = field(default_factory=list)
```

Nas outras stacks, a mesma ideia no idioma do runner (`world.<ext>`).

---

## Tags de seleção para CI

| Tag | Quando executar |
|---|---|
| `@happy-path` | Smoke (todo PR) |
| `@risk:high` | Regressão (todo PR) |
| `@edge`, `@validation`, `@error` | Regressão |
| `@release:<id>` | O pacote de uma release |
| `@wip` | Nunca no CI principal |
| `@flaky` | Em quarentena, fora do gate, por no máximo 7 dias |

**Smoke** (retorno rápido): só `@happy-path`, por exemplo
`behave --tags=@happy-path` ou `npx cucumber-js --tags "@happy-path"`.
**Regressão** (gate): tudo, menos `@wip` e `@flaky`. Cada runner filtra por tag à
sua maneira; confira a documentação dele.

---

## Helpers comuns

- `api_client.<ext>`: cliente HTTP do serviço sob teste, um só ponto para URL, autenticação e erros.
- `page_objects/`: uma classe por tela ou fluxo de UI, quando há frontend.
- `event_spy.<ext>`: espião dos eventos de domínio publicados, para conferir os `Então o evento "X" é publicado` (veja `emitted_events` acima).
- `data_builders.<ext>`: builders dos dados de cada cenário. Nada de fixtures gigantes, e dado de produção nunca entra no repositório.
