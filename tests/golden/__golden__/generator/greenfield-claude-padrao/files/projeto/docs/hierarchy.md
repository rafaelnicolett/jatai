# Estrutura Agêntica

## Princípio

O delivery é dividido em **3 streams sequenciais** com o ciclo de vida do produto.
Cada stream tem **fases internas** ordenadas. Cada agente-fase só conhece a
**próxima fase do mesmo stream**. Mudanças de stream sempre passam pelo
`@maestro`. **Guardians** atuam **apenas nos gates** de transição de stream.

```
                       @maestro (orquestrador, L0)
                              │
   ┌──────────────────────────┼───────────────────────────┐
   │                          │                           │
┌──▼──────┐             ┌─────▼──────┐              ┌─────▼──────┐
│UPSTREAM │             │DOWNSTREAM  │              │ OPERATION  │
└──┬──────┘             └─────┬──────┘              └─────┬──────┘
   │                          │                           │
business                sprint-runner                  devops
product                 backend-* ∥ frontend-*         release
domain-modeler          reviewer                       observability
bdd                     merge                          incident
architecture                                           sustain
sprint-planner

         ──────── Guardians (gate-only, fim de stream) ────────
                @stream-align  ·  @arch-cross

         ──────── Side-cars (sob demanda) ────────
   @qa-tester · @quality · @security · @docs · @integration-tests

         ──────── Skills L3 (catálogo opt-in) ────────
   ai-agent-author · openapi-governance · coding-guidelines · ...
```

## Streams

### Upstream — descobrir & definir
**Pergunta:** "O que vamos construir e por quê?"
**Saída final:** specs Gherkin + contrato OpenAPI + ADR + backlog refinado.

### Downstream — construir & validar
**Pergunta:** "Como entregamos com qualidade?"
**Saída final:** PR aprovado e mergeado, CI verde, integration tests OK.

### Operation — rodar & sustentar
**Pergunta:** "Como vai pra produção e fica de pé?"
**Saída final:** versão em produção, observável, com runbook e rollback.

## Stack specialists (Downstream)

A fase de build do Downstream se materializa em **agentes especializados por
stack**, escolhidos no wizard:

| Tipo | Stack | Agente |
|---|---|---|
| Backend | Java + Spring Boot | `@backend-java` |
| Backend | .NET Core (C#) | `@backend-dotnet` |
| Backend | Python APIs (FastAPI) | `@backend-python-api` |
| Backend | Python Agentic | `@backend-python-agentic` |
| Frontend | React + Vite | `@frontend-react` |
| Frontend | Flutter | `@frontend-flutter` |
| Frontend | Android Native | `@frontend-android` |
| Frontend | iOS Native | `@frontend-ios` |

Cada um aplica **arquitetura de referência clean/de mercado** (não específica
de empresa) e tem skills L3 próprias.

## Guardians (NOVO — diferencial)

Atuam **só em gates de transição de stream** (eficiência de token):

| Guardian | Responsabilidade | Visão |
|---|---|---|
| `@stream-align` | Garante que o que entra em produção é o que negócio pediu | Brief → PRD → BDD → feature entregue → métrica |
| `@arch-cross` | Garante que a arquitetura técnica é coerente fim-a-fim entre todas as stacks | OpenAPI ↔ Backend ↔ Frontends ↔ Mobile ↔ infra ↔ obs |

Eles **não executam fase**, são **validadores fim-a-fim**. Trabalham **ao par**:
um cuida do "porquê", outro do "como técnico".

## Side-cars (sob demanda)

| Side-car | Atua quando |
|---|---|
| `@qa-tester` | Build do Downstream (escreve/executa step defs) |
| `@quality` | Gate de entrada/saída de cada stream |
| `@security` | Toda mudança de código/infra/dados |
| `@docs` | Toda fase que produz artefato versionável |
| `@integration-tests` | Quando back+front fecham |

## Por que isso resolve o silo

1. **Um único ponto de entrada** → `@maestro`
2. **Cada fase tem `exit_contract`** — só passa adiante se cumpriu
3. **`guard_rails` no frontmatter** — agente sabe o que NÃO fazer
4. **Cross-stream sempre via Maestro** — sem pular streams na surdina
5. **Skills são commodities**, não pontos de decisão
6. **Guardians garantem coerência fim-a-fim** — negócio e técnica
7. **Loop fechado**: aprendizados de Operation voltam para Upstream
8. **Token-efficient**: guardians só em gates, side-cars sob demanda

## Anti-padrões

❌ Falar com `@backend-*` direto sem passar pelo `@maestro`/`@sprint-runner`
❌ Maestro tentando "ajudar" sem rotear
❌ Agente-fase pulando uma fase do próprio stream
❌ Backend mudando contrato OpenAPI sem voltar ao `@architecture` (cross-stream)
❌ Reviewer aprovando sem `@security`/`@qa-tester` darem green
❌ Sprint-runner fechando ticket sem PR mergeado
❌ Skills L3 invocadas direto pelo usuário
❌ Guardians chamados em toda interação (gasta token sem motivo)
❌ Side-car chamando outro side-car
