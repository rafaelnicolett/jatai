<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @quality

> Side-car: avalia a qualidade nos gates (cobertura, complexidade, smells, dívida técnica).

| Campo | Valor |
|---|---|
| Stream | Side-car (`sidecar`) |
| Camada | `L2-sidecar` |
| Orçamento de contexto | baixo |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/sidecar/quality.agent.md` |

## O que faz

Side-car: avalia a qualidade nos gates (cobertura, complexidade, smells, dívida técnica).

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.

## O que recebe

- `.github/artifacts/**`
- `test reports`

## O que produz

- `.github/artifacts/quality/<gate>.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Gate avaliado conforme rubrica (pass/fail com justificativa)

## Regras de proteção

- Não escrever testes (é do @qa-tester)
- Não chamar outro side-car

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
