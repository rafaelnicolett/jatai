<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @security-auditor

> Discovery: mapeia o perfil de risco de segurança do projeto existente (dependências vulneráveis, segredos expostos, superfícies de ataque) sem explorar nada.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1f-security-audit` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/security-auditor.agent.md` |

## O que faz

Discovery: mapeia o perfil de risco de segurança do projeto existente (dependências vulneráveis, segredos expostos, superfícies de ataque) sem explorar nada.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`security-best-practices`](skills.md#security-best-practices): Padrões de segurança aplicados por @security e @devops.
- [`security-cve-checker`](skills.md#security-cve-checker): Auditoria de CVEs em dependências.

## O que recebe

- `**/*`
- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/security/security-report.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Inventário de CVEs em dependências (severidade + path + fix version)
- Secrets detectados em código/configs (paths + tipo, NÃO o segredo)
- OWASP Top 10 checklist com evidências encontradas
- Threat surface: endpoints expostos, autenticação/autorização, dados sensíveis
- Score de risco geral (low/medium/high/critical) com justificativa

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/, .venv/), nem cache. Se precisar compilar, copie para o scratchpad.
- NUNCA reproduza secrets em texto claro no relatório (mostre só path e tipo)
- Não execute exploits; apenas identifique surface
- Distinguir vulnerabilidade real vs. teórica

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
