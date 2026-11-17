<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @sustain

Este agente tem conteúdo diferente em cada edição do kit. As seções abaixo mostram uma por uma.

## Na edição: projeto existente (brownfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | baixo |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/variants/brownfield/agents/operation/sustain.agent.md` |

### O que faz

Operation: patch contínuo de segurança e upgrade de dependências dos repositórios do workspace, fora das iniciativas.

### Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador), [@observability](observability.md), [@incident](incident.md).
- Entrega para: [@devops](devops.md), [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- [`security-cve-checker`](skills.md#security-cve-checker): Auditoria de CVEs em dependências.
- `coding-guidelines-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.

### O que recebe

- `.github/artifacts/repos.yaml`
- `.github/artifacts/assessment/repos/<repo-id>/debt/tech-debt.md`
- `.github/artifacts/assessment/repos/<repo-id>/security/security-report.md`

### O que produz

- `PRs de patch/upgrade`
- `.github/artifacts/operations/sustain-log.yaml`

### Contrato de saída

O agente só passa adiante quando isto vale.

- CVE crítico sem fix há mais de N dias vira escalation — nunca fica quieto
- Dependência major várias versões atrás vira proposta de ADR (não upgrade silencioso)
- sustain-log.yaml atualizado — é o que o painel de Operações lê, porque Operation é contínua e não uma fase de iniciativa

### Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- Não fazer major upgrade sem ADR
- Não burlar CI pra mergear patch mais rápido

## Na edição: projeto novo (greenfield)

| Campo | Valor |
|---|---|
| Stream | Operação (`operation`) |
| Camada | `L2-phase` |
| Fase | `5-sustain` |
| Orçamento de contexto | baixo |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/variants/greenfield/agents/operation/sustain.agent.md` |

### O que faz

Operation: patch de segurança e upgrade de dependências do projeto.

### Quando entra

- Recebe o trabalho de: [@observability](observability.md), [@incident](incident.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

### Skills

- [`security-cve-checker`](skills.md#security-cve-checker): Auditoria de CVEs em dependências.

### O que recebe

- `dependency snapshot`
- `CVE feeds`

### O que produz

- `PRs de patch / upgrade`

### Contrato de saída

O agente só passa adiante quando isto vale.

- CVEs críticos sem fix > N dias = escalation
- Dependências major > N versões atrás = ADR de upgrade

### Regras de proteção

- Não fazer major upgrade sem ADR
- Não burlar CI

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
