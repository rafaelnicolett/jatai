<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @tech-mapper

> Discovery: inventário preciso e versionado da stack em uso (versões do lock, não as declaradas) e radar tecnológico do repositório.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1a-tech-mapping` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/tech-mapper.agent.md` |

## O que faz

Discovery: inventário preciso e versionado da stack em uso (versões do lock, não as declaradas) e radar tecnológico do repositório.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`tech-stack-detection`](skills.md#tech-stack-detection): Heurísticas para detectar a stack tecnológica real de um projeto brownfield a partir de manifests e lock files.
- [`security-cve-checker`](skills.md#security-cve-checker): Auditoria de CVEs em dependências.

## O que recebe

- `package.json, package-lock.json, pnpm-lock.yaml, yarn.lock`
- `pom.xml, build.gradle, build.gradle.kts, settings.gradle`
- `pyproject.toml, requirements.txt, Pipfile, poetry.lock`
- `Cargo.toml, go.mod, *.csproj, *.fsproj, Gemfile`
- `Dockerfile, docker-compose*.yml`
- `repos/<repo-id>/.github/workflows/**`
- `repos/<repo-id>/.gitlab-ci.yml`
- `repos/<repo-id>/azure-pipelines.yml`
- `repos/<repo-id>/.github/copilot-instructions.md`
- `repos/<repo-id>/CLAUDE.md`
- `repos/<repo-id>/AGENTS.md`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Linguagens com versões (lock) e % de LOC por linguagem
- Frameworks principais com versão atual vs. latest stable
- Build tools, package managers, IaC, CI/CD em uso
- Banco de dados, mensageria, cache identificados
- Top 10 deps por importância + status (latest/outdated/EOL)
- CVEs conhecidas com severidade (input para @security-auditor)
- Score de modernidade (0-10) com justificativa
- Recomendação: qual @backend-{stack} / @frontend-{stack} aplicar no Execution

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/, .venv/), nem cache. Se precisar compilar, copie para o scratchpad.
- Versões devem vir de lock files (não palpite por package.json)
- Distinguir 'em uso' vs. 'declarado mas não importado'
- Não recomendar troca de stack — só relatar estado

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
