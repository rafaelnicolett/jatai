<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @migration-agent

> Execution: migra versão de runtime ou framework e troca bibliotecas de forma incremental e reversível (Expand-Contract, nunca big bang).

| Campo | Valor |
|---|---|
| Stream | Execução (`execution`) |
| Camada | `L2-phase` |
| Fase | `3c-migration` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/execution/migration-agent.agent.md` |

## O que faz

Execution: migra versão de runtime ou framework e troca bibliotecas de forma incremental e reversível (Expand-Contract, nunca big bang).

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador), [@test-backfill-agent](test-backfill-agent.md), [@security-auditor](security-auditor.md).

## Skills

- `coding-guidelines-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.
- `design-system-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.
- [`version-migration-playbook`](skills.md#version-migration-playbook): Playbook de upgrades de versão major em runtimes/frameworks comuns: Java 8→21, Spring Boot 2→3, Python 2→3, Node 14→20, .NET Framework→.NET 8, React classes→hooks.
- [`safe-refactoring-recipes`](skills.md#safe-refactoring-recipes): Catálogo de receitas de refactoring (Fowler — Refactoring 2nd ed.) com protocolo test-first.
- [`security-cve-checker`](skills.md#security-cve-checker): Auditoria de CVEs em dependências.
- [`commit-assistant`](skills.md#commit-assistant): Conventional Commits, Semantic Versioning e Release Notes para o @release.
- [`workflow-memory`](skills.md#workflow-memory): Sistema de memória cross-task para agentes downstream.

## O que recebe

- `.github/artifacts/planning/modernization-roadmap.md`
- `.github/artifacts/assessment/tech-radar.md`
- `.github/artifacts/assessment/security-report.md`

## O que produz

- `repos/<repo-id>/** — mudanças SOMENTE dentro dos paths do contexto`
- `.github/artifacts/execution/migration-report.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Migração aplicada seguindo playbook (Java 8→21, Spring 2→3, Python 2→3, Node 16→20, etc)
- CHANGELOG das deprecations tratadas referenciado
- Testes pré-existentes verdes; novos testes para comportamentos que mudaram intencionalmente
- Rollback plan documentado e testado
- CVEs introduzidas pelo upgrade auditadas (escalar @security-auditor se necessário)

## Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- CONFORM: escreva no padrão descoberto do repo (arch_current em repos.yaml) — carregue a skill coding-guidelines-&lt;repo-id>
- Se o padrão for inadequado: NÃO refatore. Registre achado e sugira iniciativa modernization
- SEMPRE migração incremental (Branch by Abstraction, Expand-Contract)
- NUNCA migration + feature na mesma PR
- Lock de deps atualizado (package-lock/poetry.lock/Cargo.lock)
- Se houver breaking change na API pública — bumpe major SEMVER e documente

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
