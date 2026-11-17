<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @observability

Este agente tem conteúdo diferente em cada edição do kit. As seções abaixo mostram uma por uma.

## Na edição: projeto existente (brownfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/variants/brownfield/agents/operation/observability.agent.md` |

### O que faz

Operation: configura health checks, métricas, dashboards e alertas dos serviços do workspace e escala para o @incident.

### Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador), [@devops](devops.md).
- Entrega para: [@incident](incident.md), [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- [`security-best-practices`](skills.md#security-best-practices): Padrões de segurança aplicados por @security e @devops.
- `coding-guidelines-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.

### O que recebe

- `.github/artifacts/repos.yaml`
- `repos/<repo-id>/**`

### O que produz

- `repos/<repo-id>/observability/**`
- `.github/artifacts/operations/observability-status.yaml`

### Contrato de saída

O agente só passa adiante quando isto vale.

- Health checks configurados para os serviços do repositório
- Alertas com threshold justificado (nunca copiado de outro projeto sem revisão)
- observability-status.yaml atualizado — é o que o painel de Operações lê, porque Operation é contínua e não uma fase de iniciativa

### Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- Não criar alerta sem plano de resposta associado (alerta sem ação é ruído)
- Não silenciar alerta sem justificativa registrada

## Na edição: projeto novo (greenfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Fase | `3-observability` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/variants/greenfield/agents/operation/observability.agent.md` |

### O que faz

Operation: configura métricas, logs, traces, SLOs e alertas; os insights voltam ao Upstream como feature ou ADR.

### Quando entra

- Recebe o trabalho de: [@release](release.md).
- Entrega para: [@incident](incident.md), [@sustain](sustain.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- Nenhuma. O agente não carrega skill.

### O que recebe

- `docs/architecture/c4/*.md`

### O que produz

- `infrastructure/observability/**`

### Contrato de saída

O agente só passa adiante quando isto vale.

- SLOs definidos para serviços críticos
- Dashboards mínimos (RED/USE) em ar
- Alertas configurados nas SLIs
- Trace OTel ponta a ponta validado

### Regras de proteção

- Não acoplar a um único vendor de obs sem adapter
- Não silenciar alertas em produção sem ADR

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
