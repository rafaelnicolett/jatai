<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @devops

Este agente tem conteúdo diferente em cada edição do kit. As seções abaixo mostram uma por uma.

## Na edição: projeto existente (brownfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/variants/brownfield/agents/operation/devops.agent.md` |

### O que faz

Operation: constrói e mantém CI/CD e IaC dos repositórios do workspace e executa as ações N1 de deploy e rollback.

### Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador), [@sustain](sustain.md).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- [`security-best-practices`](skills.md#security-best-practices): Padrões de segurança aplicados por @security e @devops.
- `coding-guidelines-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.

### O que recebe

- `.github/artifacts/repos.yaml`
- `repos/<repo-id>/**`

### O que produz

- `repos/<repo-id>/pipelines/**`
- `repos/<repo-id>/infrastructure/**`
- `.github/artifacts/operations/devops-status.yaml`

### Contrato de saída

O agente só passa adiante quando isto vale.

- Pipeline build/test/deploy verde
- IaC validada (terraform validate / equivalente do provedor)
- Sem secret no código (gitleaks/trufflehog limpo)
- devops-status.yaml atualizado — é o que o painel de Operações lê, porque Operation é contínua e não uma fase de iniciativa

### Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- Não acoplar a um único provedor de CI sem adapter
- Não hardcode de credenciais
- Não publicar release sozinho fora do pipeline (deploy/rollback são ações do pipeline, não passos manuais)

## Na edição: projeto novo (greenfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Fase | `1-pipeline` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/variants/greenfield/agents/operation/devops.agent.md` |

### O que faz

Operation: constrói os pipelines de CI/CD (via adapter) e a infraestrutura como código do projeto.

### Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador).
- Entrega para: [@release](release.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- [`pipeline-adapter`](skills.md#pipeline-adapter): Padrão Port & Adapter para pipelines de CI/CD e IaC.
- [`security-best-practices`](skills.md#security-best-practices): Padrões de segurança aplicados por @security e @devops.

### O que recebe

- `code/**`
- `api/openapi.yaml`

### O que produz

- `pipelines/**`
- `infrastructure/**`

### Contrato de saída

O agente só passa adiante quando isto vale.

- Pipeline build/test/deploy verde
- IaC validada (terraform validate / bicep build)
- Sem secret no código (gitleaks/trufflehog limpo)

### Regras de proteção

- Não acoplar a um único provedor de CI sem adapter
- Não hardcode de credenciais
- Não publicar release (é do @release)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
