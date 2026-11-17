<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @security

> Side-car: scan de CVEs, OWASP e segredos, e threat modeling pontual.

| Campo | Valor |
|---|---|
| Stream | Side-car (`sidecar`) |
| Camada | `L2-sidecar` |
| Orçamento de contexto | médio |
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/content/agents/sidecar/security.agent.md` |

## O que faz

Side-car: scan de CVEs, OWASP e segredos, e threat modeling pontual.

## Quando entra

- Recebe o trabalho de: `backend-*`, `frontend-*`, [@reviewer](reviewer.md), [@devops](devops.md), [@sustain](sustain.md).
- Entrega para: [@reviewer](reviewer.md), [@devops](devops.md), [@sustain](sustain.md), [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`security-best-practices`](skills.md#security-best-practices): Padrões de segurança aplicados por @security e @devops.
- [`security-cve-checker`](skills.md#security-cve-checker): Auditoria de CVEs em dependências.

## O que recebe

- `code/**`
- `infrastructure/**`
- `dependency manifests`

## O que produz

- `.github/artifacts/security/<scan-id>.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Sem CVE crítico aberto
- Sem secret detectado
- OWASP Top 10 endereçado

## Regras de proteção

- Não fazer fix automático em código sem PR review
- Não chamar outro side-car

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
