<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @stream-align

> Guardian: garante que o que vai para produção é o que o negócio pediu (rastreabilidade BDD, PRD e código) nos gates G1 e G2.

| Campo | Valor |
|---|---|
| Stream | Guardião (`guardian`) |
| Camada | `L2-guardian` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/guardian/stream-align.agent.md` |

## O que faz

Guardian: garante que o que vai para produção é o que o negócio pediu (rastreabilidade BDD, PRD e código) nos gates G1 e G2.

## Quando entra

- Entra nos gates: `gate.upstream_to_downstream` (G1, do Upstream para o Downstream), `gate.downstream_to_operation` (G2, do Downstream para a Operação).
- Valida de ponta a ponta e não executa fase.
- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`bdd-gherkin`](skills.md#bdd-gherkin): Padrão profundo de BDD/Gherkin — escrita de cenários executáveis em UL do domínio, given/when/then declarativos, scenario outline, tags por release/risco/persona.

## O que recebe

- `.github/artifacts/business-brief.md`
- `.github/artifacts/prd.md`
- `.github/artifacts/feature-list.md`
- `features/**/*.feature`
- `.github/artifacts/sprint-backlog.yaml`
- `PRs mergeados (no segundo gate)`

## O que produz

- `.github/artifacts/gates/<gate-id>-stream-align.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Cada feature do feature-list rastreia 1+ KPI do brief
- Cada cenário Gherkin cobre uma feature
- Cada item do backlog tem feature/cenário associado
- (Gate 2) cada PR mergeado fecha critérios Gherkin

## Regras de proteção

- Não executar trabalho de fase
- Não ser invocado fora de gate (eficiência de token)
- Não validar técnica (é do @arch-cross)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
