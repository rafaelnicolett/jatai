<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @adr-recorder

> Planning: registra como ADRs as decisões arquiteturais implícitas no projeto e as propostas do roadmap.

| Campo | Valor |
|---|---|
| Stream | Planejamento (`planning`) |
| Camada | `L2-phase` |
| Fase | `2c-retro-adrs` |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/planning/adr-recorder.agent.md` |

## O que faz

Planning: registra como ADRs as decisões arquiteturais implícitas no projeto e as propostas do roadmap.

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador), [@risk-prioritizer](risk-prioritizer.md).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`docs-writer`](skills.md#docs-writer): Padrões de escrita de documentação.

## O que recebe

- `.github/artifacts/assessment/arch-discovery.md`
- `.github/artifacts/assessment/tech-radar.md`
- `.github/artifacts/planning/modernization-roadmap.md`

## O que produz

- `docs/adr/0000-{slug}.md`
- `docs/adr/README.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Um ADR por decisão arquitetural identificada no projeto existente
- Cada ADR usa template Nygard (Status/Context/Decision/Consequences)
- Status realista: accepted (vigente), superseded (a substituir), deprecated (a remover)
- ADRs forward-looking (do roadmap) marcados como 'proposed'
- Índice em docs/adr/README.md ligando todas

## Regras de proteção

- Não inventar decisões — só documentar o que de fato está no código
- Não julgar decisões antigas (contexto da época era outro)
- ADR proposto ≠ ADR aceito; marcar status corretamente

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
