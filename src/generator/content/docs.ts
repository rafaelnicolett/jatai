/**
 * docs.ts
 *
 * Documentação semeada no projeto greenfield: AGENTS.md, docs/domain/*, docs/README.md, o README dos gates, a feature de exemplo e o contrato OpenAPI.
 *
 * Funções puras `(estado do Wizard) => texto` (F3.4, passo 3): sem fs, sem
 * relógio. Saíram do StructureGenerator sem mudar um byte do que geram.
 */

import type { WizardState } from "../../types";
import { BRAND } from "../../data/brand.pure";
import { entryPointBothHarnesses } from "./entry-point";

/** `hostDir`: pasta do harness onde os agentes foram instalados (`HarnessAdapter.hostDir`). */
export function buildAgentsReadme(state: WizardState, hostDir: string): string {
  return `# Agents — ${state.projectName}

> Estrutura agêntica gerada pela ${BRAND.displayName}.
> Conteúdo dos agentes em [\`${hostDir}/agents/\`](${hostDir}/agents/).

## Ponto de entrada

${entryPointBothHarnesses()}

## Fluxo

\`\`\`
@${BRAND.name} (agente orquestrador, único ponto de entrada)
   │
   ├── UPSTREAM   (descobrir & definir)
   │     business → product → domain-modeler → bdd → architecture → sprint-planner
   │
   ├── DOWNSTREAM (construir & validar)
   │     sprint-runner → (backend-${state.backendStack} ∥ frontend-${state.frontendStack || "none"}) → reviewer
   │
   └── OPERATION  (rodar & sustentar)
         devops → release → observability → incident → sustain

Guardians: @stream-align · @arch-cross
Side-cars: @qa-tester · @quality · @security · @docs · @integration-tests
\`\`\`

Ver [docs/delivery-flow.md](docs/delivery-flow.md) para detalhes.
`;
}

export function buildBoundedContexts(state: WizardState): string {
  return `# Bounded Contexts — ${state.projectName}

> Artefato produzido por: \`@domain-modeler\` — Rodada 1  
> Skill: \`domain-driven-design\`  
> ⚠️ UL bruta — refinamento após Rodada 2 (BDD)

---

## Mapa de BCs

\`\`\`
┌─────────────────────────────────────────────────────────────────────┐
│                     ${state.projectName}                            │
│                                                                     │
│  ┌──────────────────┐                                              │
│  │   CoreDomain     │                                              │
│  │   (CORE)         │                                              │
│  └──────────────────┘                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
\`\`\`

---

## BC-01 — CoreDomain

**Tipo**: Core  
**Propósito**: ${state.startupIdea || "Domínio principal da aplicação"}

**Conceitos centrais**: *A definir durante modelagem detalhada*

**Responsável por**:
- Regras de negócio centrais
- Invariantes do domínio
- Eventos de domínio

**Eventos publicados**: *A definir*

**Eventos consumidos**: *A definir*

---

*Este arquivo será refinado pelo \`@domain-modeler\` após rodadas de Event Storming e BDD.*
`;
}

export function buildContextMap(state: WizardState): string {
  return `# Context Map — ${state.projectName}

> Artefato produzido por: \`@domain-modeler\` — Rodada 1  
> Skill: \`domain-driven-design\`

## Relacionamentos

*A ser mapeado durante Event Storming e refinamento de BCs.*

### Patterns de integração

- **Shared Kernel**: N/A (inicialmente)
- **Customer/Supplier**: N/A
- **Conformist**: N/A
- **Anticorruption Layer**: N/A

---

*Este arquivo será atualizado conforme novos BCs forem identificados.*
`;
}

export function buildEventStorming(state: WizardState): string {
  return `# Event Storming — ${state.projectName}

> Artefato produzido por: \`@domain-modeler\` — Rodada 1  
> Skill: \`domain-driven-design\`

## Eventos de Domínio (Big Picture)

*A ser mapeado durante sessões colaborativas com \`@bdd\` e stakeholders.*

### Timeline inicial

1. **Evento inicial**: *A definir*
2. **Comando**: *A definir*
3. **Evento resultante**: *A definir*

---

*Este arquivo será expandido durante as rodadas de modelagem.*
`;
}

export function buildDocsReadme(state: WizardState): string {
  return `# Documentação — ${state.projectName}

Estrutura de documentação gerada pela ${BRAND.displayName}.

## Estrutura

- **\`adr/\`** — Architecture Decision Records (padrões arquiteturais)
- **\`architecture/\`** — Diagramas C4 (Context, Container, Component)
- **\`domain/\`** — Modelagem de domínio (DDD): Bounded Contexts, Context Map, Event Storming
- **\`delivery-flow.md\`** — Fluxo de entrega Upstream → Downstream → Operation
- **\`hierarchy.md\`** — Hierarquia de agentes (L0 Maestro → L1 Streams → L2 Fases)
- **\`routing-rules.md\`** — Regras de roteamento do \`@maestro\`

## Agentes responsáveis

| Artefato | Agente produtor |
|---|---|
| ADRs | \`@architecture\` |
| C4 | \`@architecture\` |
| Domain model | \`@domain-modeler\` |
| Features BDD | \`@bdd\` |

Ver [\`AGENTS.md\`](../AGENTS.md) para detalhes.
`;
}

export function buildGatesReadme(state: WizardState): string {
  return `# Gates de Qualidade — ${state.projectName}

Os gates são **obrigatórios** e validados pelos Guardians antes de cada transição de stream.

## G1: Upstream → Downstream

**Trigger**: \`@sprint-planner\` declara \`exit_contract\` cumprido

**Validadores**:
- \`@stream-align\` — valida alinhamento de negócio (BDD ↔ PRD, métricas rastreáveis)
- \`@arch-cross\` — valida coerência técnica cross-stack (arquitetura ${state.backendArchitecture} aplicada)

**Artefatos obrigatórios**:
- \`.github/artifacts/business-brief.md\`
- \`.github/artifacts/prd.md\`
- \`docs/domain/bounded-contexts.md\`
- \`features/**/*.feature\` (pelo menos 1 cenário)
- \`api/openapi.yaml\` (contrato completo)
- \`.github/artifacts/sprint-backlog.yaml\`

**Output**: \`.github/artifacts/gates/g1-<timestamp>.md\` (aprovado/rejeitado + motivos)

---

## G2: Downstream → Operation

**Trigger**: \`@sprint-runner\` confirma merge de todos os PRs da sprint

**Validadores**:
- \`@stream-align\` — valida rastreabilidade (código ↔ BDD ↔ PRD)
- \`@arch-cross\` — valida conformidade arquitetural (backend ${state.backendArchitecture}, frontend ${state.frontendArchitecture || "N/A"})

**Artefatos obrigatórios**:
- Código implementado conforme arquitetura escolhida
- Testes passando (unit + integration mínimo 80% coverage)
- PRs aprovados pelo \`@reviewer\`
- Build verde no CI/CD

**Output**: \`.github/artifacts/gates/g2-<timestamp>.md\`

---

**Os gates NÃO são opcionais.** Se falhar, o \`@maestro\` reabre a fase anterior.
`;
}

export function buildExampleFeature(state: WizardState): string {
  return `# language: pt
Funcionalidade: ${state.projectName} — Cenário exemplo

  Como usuário do sistema
  Quero poder interagir com a funcionalidade principal
  Para obter valor do ${state.projectName}

  Cenário: Operação básica
    Dado que o sistema está inicializado
    Quando eu executo a operação principal
    Então o resultado deve ser bem-sucedido

  # Este arquivo será expandido pelo @bdd após modelagem de domínio
`;
}

export function buildOpenAPIContract(state: WizardState): string {
  return `openapi: "3.1.0"
info:
  title: ${state.projectName} API
  version: "0.1.0"
  description: |
    API gerada pela ${BRAND.displayName}.
    Stack: ${state.backendStack}
    Padrão: Clean/Hexagonal Architecture

servers:
  - url: http://localhost:8000
    description: Desenvolvimento local

paths:
  /health:
    get:
      summary: Health check
      operationId: getHealth
      responses:
        '200':
          description: Sistema operacional
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [ok]
                  version:
                    type: string

components:
  schemas: {}
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

# Este contrato será expandido pelo @architecture durante design da API
`;
}

/**
 * `docs/input/README.md` do workspace brownfield: o material do cliente que o
 * código não conta, insumo do @business-archeologist e do @domain-extractor.
 */
export const DOCS_INPUT_README = [
  "# Documentos do projeto — insumo do Discovery",
  "",
  "Coloque aqui o material que **o código não conta**. O `@business-archeologist`",
  "e o `@domain-extractor` leem esta pasta durante o Discovery.",
  "",
  "Formatos: `.md` · `.pdf` · `.docx` · `.xlsx` · `.pptx` · `.txt` · imagens",
  "",
  "## O que vale muito a pena colocar",
  "",
  "| Material | O que destrava |",
  "|---|---|",
  "| Contrato, SLA, regulamentação | regras de negócio que viraram `if` sem comentário |",
  "| Runbook, procedimento operacional | o que acontece quando quebra — e por quê |",
  "| Planilha de processo, fluxo | o domínio como o negócio o enxerga |",
  "| Deck de produto, roadmap | para onde isso ia antes de virar legado |",
  "| Ata de decisão, RFC antiga | por que a arquitetura é o que é |",
  "",
  "## O que NÃO colocar",
  "",
  "- **Segredo, credencial, chave** — nada aqui é tratado como secreto.",
  "- **Dado pessoal real** — use amostra anonimizada.",
  "",
  "> Esta pasta é versionada junto com o workspace. O código do cliente fica",
  "> em `repos/` e nunca é modificado.",
  "",
].join("\n");
