<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @quality-auditor

> Discovery: diagnóstico objetivo da saúde do código (complexidade, hotspots, duplicação, código morto), com métricas e não opiniões.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1e-quality-audit` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/quality-auditor.agent.md` |

## O que faz

Discovery: diagnóstico objetivo da saúde do código (complexidade, hotspots, duplicação, código morto), com métricas e não opiniões.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`code-quality-audit`](skills.md#code-quality-audit): Métricas objetivas para auditar qualidade de código existente: complexidade ciclomática, hotspots (churn × complexidade), god classes, duplicação, dead code.
- [`coding-guidelines`](skills.md#coding-guidelines): Índice de diretrizes de código do kit.

## O que recebe

- `.github/artifacts/repos.yaml`
- `**/*`
- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/quality/quality-report.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Métricas globais: LOC, files, % por linguagem, % comentários
- Top 10 hotspots (alta complexidade + alto churn) com path e score
- Top 10 god files (>500 LOC, >20 métodos) com path
- Duplicação detectada (% e blocos suspeitos)
- Dead code candidato (exports/funções sem uso)
- Score de saúde por dimensão (0-10): legibilidade, modularidade, testabilidade

## Regras de proteção

- Se has_history: false no repos.yaml — NÃO calcule hotspot. Declare no relatório que não foi avaliado por ausência de histórico
- NUNCA use data de arquivo, tamanho ou contagem de TODO como proxy de churn — seria inventar o dado
- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build (target/, dist/, .venv/), nem cache. Se precisar compilar, copie para o scratchpad.
- Não sugerir refactor agora — apenas relatar. Refactor é fase de execution.
- Use métricas concretas, não opiniões vagas

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
