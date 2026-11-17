<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @dependency-mapper

> Discovery: mapeia como os repositórios se conectam (chamadas, contratos, dados compartilhados) e produz o grafo de dependências entre eles.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1i-dependency-graph` |
| Escopo | o workspace inteiro (`workspace`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/dependency-mapper.agent.md` |

## O que faz

Discovery: mapeia como os repositórios se conectam (chamadas, contratos, dados compartilhados) e produz o grafo de dependências entre eles.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md), [@domain-extractor](domain-extractor.md), [@modernization-planner](modernization-planner.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`legacy-modernization-patterns`](skills.md#legacy-modernization-patterns): Padrões canônicos para modernizar sistemas legados de forma incremental e reversível: Strangler Fig, Branch by Abstraction, Anti-Corruption Layer, Parallel Run, Expand-Contract.

## O que recebe

- `.github/artifacts/repos.yaml`
- `.github/artifacts/assessment/repos/*/tech-stack/tech-radar.md`
- `.github/artifacts/assessment/repos/*/architecture/arch-discovery.md`
- `repos/*/pom.xml`
- `repos/*/build.gradle*`
- `repos/*/package.json`
- `repos/*/*.csproj`
- `repos/*/pyproject.toml`
- `repos/*/requirements.txt`
- `repos/*/go.mod`
- `repos/*/**/openapi*.{yaml,yml,json}`
- `repos/*/**/*.{java,py,ts,js,cs,go,kt,rb}`
- `repos/*/**/{docker-compose*.yml,*.tf,application*.{yml,yaml,properties}}`

## O que produz

- `.github/artifacts/assessment/repo-graph.yaml`
- `.github/artifacts/assessment/repo-graph.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- repo-graph.yaml com uma aresta por acoplamento encontrado, cada uma com evidence verificável
- Ciclos entre repositórios identificados e destacados
- Repositórios-folha identificados (ninguém depende deles — por onde começar a modernizar)
- Acoplamento por banco compartilhado (kind: db) sinalizado como risco crítico
- repo-graph.md com o diagrama Mermaid e a leitura para humanos

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build, nem cache.
- NUNCA registre aresta sem evidence — grafo de achismo é pior que grafo nenhum
- NUNCA infira acoplamento por semelhança de nome — exija evidência no código ou manifesto
- Não mapear acoplamento DENTRO de um repo — isso é a coupling matrix do @arch-discoverer
- Não propor modernização — cabe ao @modernization-planner

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
