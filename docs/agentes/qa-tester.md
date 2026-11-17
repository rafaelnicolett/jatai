<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @qa-tester

> Side-car: escreve as step definitions e executa os cenários BDD na stack ativa.

| Campo | Valor |
|---|---|
| Stream | Side-car (`sidecar`) |
| Camada | `L2-sidecar` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/sidecar/qa-tester.agent.md` |

## O que faz

Side-car: escreve as step definitions e executa os cenários BDD na stack ativa.

## Quando entra

- Recebe o trabalho de: `backend-*`, `frontend-*`.
- Entrega para: [@reviewer](reviewer.md), [@sprint-runner](sprint-runner.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`bdd-gherkin`](skills.md#bdd-gherkin): Padrão profundo de BDD/Gherkin — escrita de cenários executáveis em UL do domínio, given/when/then declarativos, scenario outline, tags por release/risco/persona.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.

## O que recebe

- `features/**/*.feature`
- `code/**`

## O que produz

- `features/**/*_steps.{ts,py,kt,swift,dart,java,cs}`
- `test reports`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Step defs cobrem 100% dos cenários Gherkin
- Suite de testes passando

## Regras de proteção

- Não escrever cenários (é do @bdd)
- Não chamar outro side-car

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
