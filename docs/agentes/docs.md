<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @docs

> Side-car: mantém docs, ADRs e CHANGELOG sincronizados com os artefatos versionados.

| Campo | Valor |
|---|---|
| Stream | Side-car (`sidecar`) |
| Camada | `L2-sidecar` |
| Orçamento de contexto | baixo |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/sidecar/docs.agent.md` |

## O que faz

Side-car: mantém docs, ADRs e CHANGELOG sincronizados com os artefatos versionados.

## Quando entra

- Recebe o trabalho de: `*`.
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`docs-writer`](skills.md#docs-writer): Padrões de escrita de documentação.

## O que recebe

- `artefato a documentar`

## O que produz

- `docs/**`
- `CHANGELOG.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Doc/ADR/CHANGELOG atualizados, com link para o artefato origem

## Regras de proteção

- Não inventar conteúdo — sempre baseado em artefato existente
- Não chamar outro side-car

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
