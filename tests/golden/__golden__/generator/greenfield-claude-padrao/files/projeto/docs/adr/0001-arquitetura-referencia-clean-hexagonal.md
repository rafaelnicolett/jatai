# ADR-0001 — Arquitetura de referência por stack

**Status:** accepted  
**Agente:** `@architecture`

> Este é o ADR de referência que o kit instala. A arquitetura que vale para o
> seu projeto é a que o Wizard registrou. Se o time decidir outra coisa,
> registre um novo ADR e marque este como `superseded-by ADR-NNNN`.

## Contexto

A Helyx gera o esqueleto de um projeto para quatro stacks de
backend e quatro de frontend. Sem uma decisão explícita de arquitetura, cada
agente de build poderia produzir uma estrutura diferente, e isso atrapalha as
revisões, os gates e a chegada de quem entra no time.

## Decisão

Cada stack tem uma arquitetura de referência recomendada. O Wizard mostra a
recomendada e deixa escolher outra. Os agentes `@backend-*` e `@frontend-*`
seguem a que ficou registrada, pela skill `arch-*` correspondente, e o
`@arch-cross` e o `@reviewer` conferem a conformidade nos gates.

| Stack | Arquitetura recomendada | Skill | Por quê |
|---|---|---|---|
| `python-api` | Hexagonal (ports & adapters) | `arch-hexagonal` | FastAPI e Pydantic mapeiam bem para portas e adaptadores. |
| `java-spring` | Hexagonal | `arch-hexagonal` | Os pacotes `domain/`, `application/` e `infrastructure/` casam com o Spring Boot. |
| `dotnet-core` | Vertical Slice | `arch-vertical-slice` | Cada feature fica auto-contida, o que combina com o ecossistema .NET. |
| `python-agentic` | Hexagonal | `arch-hexagonal` | O fluxo do agente (grafo ou chamadas ao LLM) fica atrás de uma porta, e o domínio continua testável sem o provider. |
| `react-vite` | Feature-based | `arch-feature-based` | Componentes, hooks, stores e testes ficam juntos, por feature. |
| `flutter` | Clean Architecture (data, domain, presentation) | `arch-clean-frontend` | É o padrão dominante do ecossistema Flutter. |
| `android-compose` | MVVM | `arch-mvvm` | ViewModel observável com o Compose. |
| `ios-swiftui` | MVVM | `arch-mvvm` | ViewModels observáveis, sem exagero para um MVP. |

As outras opções do Wizard (em camadas, DDD tático, MVC e Clean no mobile)
também têm skill e valem quando o time as escolhe.

## Consequências

### Positivas
- Os agentes de build e quem revisa falam do mesmo padrão em cada stack, e o
  `@arch-cross` confere a conformidade com este ADR nos gates.
- O README do backend gerado aponta para este ADR.

### Negativas / trade-offs
- A recomendação é um ponto de partida. Um projeto com outra necessidade (um
  CRUD simples numa stack em que a recomendada é hexagonal, por exemplo) paga
  uma estrutura maior do que precisa até registrar o ADR que a troque.

### Neutras
- Mudar de arquitetura depois de gerado é uma decisão de modernização, feita
  de forma incremental (nunca em big bang) e registrada num novo ADR.
