<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @business-archeologist

> Discovery: engenharia reversa do negócio implícito no código e nos documentos do cliente; produz o business-context.md e as métricas de linha de base.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`foundation`) |
| Camada | `L2-phase` |
| Fase | `1-business-assessment` |
| Escopo | o workspace inteiro (`workspace`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/business-archeologist.agent.md` |

## O que faz

Discovery: engenharia reversa do negócio implícito no código e nos documentos do cliente; produz o business-context.md e as métricas de linha de base.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.
- [`domain-driven-design`](skills.md#domain-driven-design): Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service).
- [`docs-writer`](skills.md#docs-writer): Padrões de escrita de documentação.

## O que recebe

- `docs/input/**`
- `README.md`
- `docs/**`
- `package.json / pom.xml / pyproject.toml / *.csproj / go.mod`
- `.github/artifacts/assessment/architecture/arch-discovery.md`
- `.github/artifacts/assessment/domain-map.md`
- `prisma/**, migrations/**, schemas/**`
- `locales/**, i18n/**`
- `opcional — respostas humanas ao stakeholder-interview.md`

## O que produz

- `.github/artifacts/assessment/business/business-context.md`
- `.github/artifacts/assessment/business/stakeholder-interview.md`
- `.github/artifacts/assessment/business/baseline-metrics.json`

## Contrato de saída

O agente só passa adiante quando isto vale.

- business-context.md preenchido com: domínio de negócio, personas inferidas, value props, jornadas existentes, modelo de receita (quando inferível), mercado-alvo, restrições regulatórias (quando detectáveis)
- Cada afirmação no business-context.md tem fonte: ('inferred from &lt;arquivo>' ou 'requires_human_confirmation')
- stakeholder-interview.md com lista de perguntas para o owner confirmar/corrigir o que foi inferido (delta)
- baseline-metrics.json com métricas-âncora consolidadas (técnicas vindas dos sub-relatórios + de negócio quando detectáveis)

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem docs, nem build, nem cache.
- Nunca inventar persona, value prop ou métrica sem fonte rastreável
- Marcar como `requires_human_confirmation` tudo que não vier de evidência objetiva
- Não substituir @business (greenfield) — este age só em brownfield, fazendo engenharia reversa
- Não escrever PRD ou business-brief — produz business-context.md (formato diferente)
- Respeitar privacidade — não vazar dados pessoais que apareçam em fixtures/seeds

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
