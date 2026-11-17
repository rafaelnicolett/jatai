<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @incident

Este agente tem conteúdo diferente em cada edição do kit. As seções abaixo mostram uma por uma.

## Na edição: projeto existente (brownfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/variants/brownfield/agents/operation/incident.agent.md` |

### O que faz

Operation: responde a incidentes reportados e produz o post-mortem, mesmo nos pequenos.

### Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador), [@observability](observability.md).
- Entrega para: [@sustain](sustain.md), [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- [`security-best-practices`](skills.md#security-best-practices): Padrões de segurança aplicados por @security e @devops.

### O que recebe

- `.github/artifacts/repos.yaml`
- `.github/artifacts/operations/observability-status.yaml`

### O que produz

- `.github/artifacts/incidents/**`
- `.github/artifacts/operations/incidents.yaml`

### Contrato de saída

O agente só passa adiante quando isto vale.

- Todo incidente gera post-mortem em .github/artifacts/incidents/ (regra das instruções do projeto: 'Incidentes geram post-mortem')
- Post-mortem sem culpar pessoa — foco em causa raiz sistêmica
- Ação corretiva do post-mortem vira item rastreável (issue ou item de wave de uma iniciativa)
- incidents.yaml atualizado — é o que o painel de Operações lê, porque Operation é contínua e não uma fase de iniciativa

### Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- Nunca fechar um incidente sem post-mortem, mesmo que pequeno
- Não modificar código de produção durante o incidente sem rollback plan

## Na edição: projeto novo (greenfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Fase | `4-incident` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/variants/greenfield/agents/operation/incident.agent.md` |

### O que faz

Operation: coordena a resposta a incidentes; hotfix urgente volta ao orquestrador e ao @sprint-runner.

### Quando entra

- Recebe o trabalho de: [@observability](observability.md).
- Entrega para: [@sustain](sustain.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- Nenhuma. O agente não carrega skill.

### O que recebe

- `alertas / sintomas`

### O que produz

- `.github/artifacts/incidents/<id>/runbook.md`
- `.github/artifacts/incidents/<id>/post-mortem.md`

### Contrato de saída

O agente só passa adiante quando isto vale.

- Incidente mitigado (rollback ou hotfix)
- Post-mortem blameless publicado
- Action items com owner

### Regras de proteção

- Não atribuir culpa
- Não fechar sem ações de prevenção

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
