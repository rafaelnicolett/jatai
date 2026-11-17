<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @release

> Operation: cria a tag semver, as release notes e publica o artefato.

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Fase | `2-release` |
| Orçamento de contexto | baixo |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/operation/release.agent.md` |

## O que faz

Operation: cria a tag semver, as release notes e publica o artefato.

## Quando entra

- Recebe o trabalho de: [@devops](devops.md).
- Entrega para: [@observability](observability.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`commit-assistant`](skills.md#commit-assistant): Conventional Commits, Semantic Versioning e Release Notes para o @release.

## O que recebe

- `pipelines/**`
- `CHANGELOG.md`

## O que produz

- `tag vX.Y.Z`
- `release-notes`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Tag semver criada
- Release notes publicadas
- Artefato publicado (registry/store)

## Regras de proteção

- Não pular versionamento semântico
- Não publicar com CI vermelho

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
