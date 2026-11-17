<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @maturity-assessor

> Discovery (opcional): avalia a maturidade do projeto nos frameworks escolhidos no config (DORA, SAMM, ASVS, CMMI e outros).

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1-maturity-assessment` |
| Escopo | o workspace inteiro (`workspace`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/maturity-assessor.agent.md` |

## O que faz

Discovery (opcional): avalia a maturidade do projeto nos frameworks escolhidos no config (DORA, SAMM, ASVS, CMMI e outros).

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`maturity-dora-4keys`](skills.md#maturity-dora-4keys): DORA Four Keys — métricas canônicas de performance de entrega (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR).
- [`maturity-dora-capabilities`](skills.md#maturity-dora-capabilities): DORA 24 Capabilities — práticas técnicas, processuais e culturais que dirigem as 4 Keys.
- [`maturity-owasp-samm`](skills.md#maturity-owasp-samm): OWASP SAMM (Software Assurance Maturity Model) v2.0 — 5 business functions × 3 security practices × 3 maturity levels.
- [`maturity-owasp-asvs`](skills.md#maturity-owasp-asvs): OWASP ASVS (Application Security Verification Standard) v4 — checklist de verificação de controles de segurança em aplicação, com 3 níveis (L1 opportunistic, L2 standard, L3 advanced).
- [`maturity-cmmi`](skills.md#maturity-cmmi): CMMI (Capability Maturity Model Integration) — 5 níveis de maturidade processual, originalmente do SEI.
- [`maturity-iso-25010`](skills.md#maturity-iso-25010): ISO/IEC 25010:2011 — Qualidade de produto de software em 8 características × 31 sub-características.
- [`maturity-space-devex`](skills.md#maturity-space-devex): SPACE Framework (Forsgren, Storey, Maddila, Zimmermann, Houck — Microsoft Research 2021) — produtividade de devs em 5 dimensões: Satisfaction, Performance, Activity, Communication, Efficiency.
- [`maturity-bsimm`](skills.md#maturity-bsimm): BSIMM (Building Security In Maturity Model) — modelo descritivo (não prescritivo) baseado em observação de práticas em empresas reais.
- [`maturity-spotify-health`](skills.md#maturity-spotify-health): Spotify Squad Health Check Model — auto-avaliação leve de saúde do time em 11 dimensões com semáforo verde/amarelo/vermelho + trend.
- [`maturity-tech-radar`](skills.md#maturity-tech-radar): ThoughtWorks-style Technology Radar — classificação de tech/práticas em 4 rings (Adopt/Trial/Assess/Hold) × 4 quadrants (Techniques/Tools/Platforms/ Languages-Frameworks).

## O que recebe

- `jatai.config.yaml`
- `.github/artifacts/assessment/tech-stack/tech-radar.md`
- `.github/artifacts/assessment/architecture/arch-discovery.md`
- `.github/artifacts/assessment/quality/quality-report.md`
- `.github/artifacts/assessment/security/security-report.md`
- `.github/artifacts/assessment/test-coverage/coverage-gaps.md`
- `.github/artifacts/assessment/debt/tech-debt.md`
- `git history (90 dias) + CI logs (quando disponível)`

## O que produz

- `.github/artifacts/assessment/maturity/maturity-<framework>.md`
- `.github/artifacts/assessment/maturity/maturity-scorecard.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- 1 arquivo maturity-&lt;framework>.md por framework declarado em config.assessment.maturity_frameworks
- Cada relatório segue o template da skill correspondente (rubric + evidência + recomendações priorizadas)
- maturity-scorecard.md consolida scores globais por framework + recomendações cross-framework
- Quando uma dimensão exige humano (cultural, satisfação) → marcada como 'no_evidence' com lista de perguntas

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build, nem cache.
- Não inventar scores sem evidência objetiva
- Sempre rotular dimensões qualitativas como 'no_evidence' quando faltar input humano
- Não rodar framework que não esteja declarado no config (custo desnecessário)
- Não substituir @security-auditor (este foca em vulns; @maturity-assessor mede maturidade do programa)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
