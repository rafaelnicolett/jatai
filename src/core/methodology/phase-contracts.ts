/**
 * phase-contracts.ts
 *
 * Contrato canônico de cada fase do delivery:
 *   - requiredInputs       : artefatos que DEVEM existir antes de a fase iniciar
 *   - outputs              : o que a fase produz (fonte da verdade para a próxima)
 *   - guardRails           : o que a fase NÃO pode fazer
 *   - exitCriteria         : critérios que devem ser atingidos para marcar done
 *   - guardRailChecklist   : itens checkáveis pelo humano antes de avançar
 *
 * Cada fase tem seu próprio gate de qualidade (guardRailChecklist). O humano
 * valida cada item antes de marcar a fase como done. Itens mandatory=true bloqueiam.
 */

import { deliveryPhase, deliveryPhaseIds, type PhaseStream } from "./phase-catalog.pure";
import { BRAND } from "../brand/brand.pure";

export interface PhaseInput {
  id: string;           // artifact id (matches ARTIFACTS_MANIFEST)
  label: string;        // human-readable
  relPath: string;      // path to check existence
}

export interface PhaseOutput {
  id: string;
  label: string;
  relPath: string;
}

export type GuardRailCategory = "artifact" | "quality" | "pattern" | "security" | "coverage" | "contract";

/**
 * Ação contextual do item de checklist.
 * Renderizada como botão de atalho à direita do checkbox — separada da validação.
 * - openFile     → abre o arquivo no editor VS Code
 * - revealFolder → revela a pasta no Explorer do VS Code
 * - openBrowser  → abre arquivo HTML local no browser do sistema
 */
export type GuardRailActionType = "openFile" | "revealFolder" | "openBrowser";

export interface GuardRailAction {
  type: GuardRailActionType;
  /** Caminho relativo à raiz do workspace (sem leading slash). */
  target: string;
  tooltip?: string;
}

export interface GuardRailItem {
  id: string;                       // unique within phase
  label: string;                    // concise checkbox label
  hint?: string;                    // tooltip / detail
  mandatory: boolean;               // blocks done if unchecked
  category: GuardRailCategory;
  /** Ação contextual — botão de atalho gerado pela IA para o humano validar. */
  action?: GuardRailAction;
}

/** Onde a fase mora no lifecycle de Delivery (Upstream → Gate G1 → Downstream → Gate G2 → Operation) — definido no catálogo único. */
export type { PhaseStream };

export interface PhaseContract {
  phaseId: string;
  /** Rótulo humano — usado direto pelo Cockpit Next (StatusBadge/StepTrack/etc. já esperam `PlanItem.label`). */
  label: string;
  /** Agente responsável, ex. "@business" — mesmo valor já usado no Cockpit clássico (CockpitController.PHASES). */
  agent: string;
  /** Emoji legado — mantido por paridade com o Cockpit clássico; o Cockpit Next resolve ícone via `phaseIconFor()`. */
  icon: string;
  stream: PhaseStream;
  /** Por que esta fase existe e o que ela destrava — o learning, lido no contexto (mesma ideia de `FoundationPhaseContract.why`). */
  why: string;
  requiredInputs: PhaseInput[];
  outputs: PhaseOutput[];
  guardRails: string[];             // hard NOs (prose)
  exitCriteria: string[];           // definition of done (prose)
  guardRailChecklist: GuardRailItem[];  // checkable per-phase gate items
}

/** Ordem canônica das 16 fases de Delivery (buildDeliveryPlan e testes) — consulta ao catálogo único `phase-catalog.pure.ts`. */
export const PHASE_ORDER: string[] = deliveryPhaseIds();

/** Cabeçalho de um contrato (id, rótulo, agente, ícone, stream): vem do catálogo único de fases. */
function phaseHeader(id: string): Pick<PhaseContract, "phaseId" | "label" | "agent" | "icon" | "stream"> {
  const phase = deliveryPhase(id)!;
  return { phaseId: phase.id, label: phase.label, agent: phase.agent, icon: phase.icon, stream: phase.stream };
}

// ── Contracts by phase ID ─────────────────────────────────────────────────

export const PHASE_CONTRACTS: Record<string, PhaseContract> = {

  business: {
    ...phaseHeader("business"),
    why: "Define a oportunidade, o problema e a hipótese de valor — tudo que vem depois parte daqui.",
    requiredInputs: [],
    outputs: [
      { id: "brief", label: "Business Brief", relPath: ".github/artifacts/business-brief.md" },
    ],
    guardRails: [
      "Não escrever PRD nem features",
      "Não decidir tecnologia ou arquitetura",
      "Não criar cenários BDD",
      "Não estimar prazo ou custo",
    ],
    exitCriteria: [
      "business-brief.md existe com seções: Problema, Público-alvo, Hipótese de valor, Métricas de sucesso, Stakeholders, Riscos",
      "Pelo menos uma métrica quantificável (KPI ou OKR)",
      "delivery-state.yaml atualizado: phases.business.status = done",
    ],
    guardRailChecklist: [
      { id: "brief-exists",       label: "business-brief.md criado em .github/artifacts/",                  mandatory: true,  category: "artifact",  hint: "O arquivo deve existir e ter conteúdo substantivo",
        action: { type: "openFile", target: ".github/artifacts/business-brief.md", tooltip: "Abrir business-brief.md" } },
      { id: "problem-section",    label: "Seção 'Problema' descreve a dor do cliente com evidência",         mandatory: true,  category: "quality",   hint: "Evitar problema vago. Ideal: dado qualitativo ou quantitativo" },
      { id: "audience-defined",   label: "Público-alvo com pelo menos uma persona identificada",             mandatory: true,  category: "quality" },
      { id: "value-hypothesis",   label: "Hipótese de valor clara e testável",                               mandatory: true,  category: "quality",   hint: "Formato: 'Acreditamos que [solução] para [quem] resultará em [métrica]'" },
      { id: "kpi-defined",        label: "Pelo menos 1 KPI ou OKR quantificável definido",                   mandatory: true,  category: "quality",   hint: "Ex: 'Reduzir churn em 15% em 90 dias'" },
      { id: "stakeholders",       label: "Stakeholders identificados com papéis",                            mandatory: false, category: "quality" },
      { id: "risks-listed",       label: "Principais riscos de negócio listados",                            mandatory: false, category: "quality" },
      { id: "no-tech-decisions",  label: "Sem decisões de tecnologia ou arquitetura no brief",               mandatory: true,  category: "pattern",   hint: "Nomes de frameworks, linguagens ou ferramentas não devem aparecer" },
    ],
  },

  product: {
    ...phaseHeader("product"),
    why: "Com o brief pronto, transforma a oportunidade em requisitos e features priorizadas com critério de aceite.",
    requiredInputs: [
      { id: "brief", label: "Business Brief", relPath: ".github/artifacts/business-brief.md" },
    ],
    outputs: [
      { id: "prd",          label: "PRD",          relPath: ".github/artifacts/prd.md" },
      { id: "feature-list", label: "Feature List", relPath: ".github/artifacts/feature-list.md" },
    ],
    guardRails: [
      "Não escrever cenários Gherkin (isso é do @bdd)",
      "Não decidir tecnologia (isso é do @architecture)",
      "Não modelar bounded contexts (isso é do @domain-modeler)",
    ],
    exitCriteria: [
      "prd.md referencia o business-brief e cobre: contexto, objetivos, público, escopo, restrições",
      "feature-list.md tem features priorizadas com hipótese mensurável e critério de aceite",
      "delivery-state.yaml atualizado: phases.product.status = done",
    ],
    guardRailChecklist: [
      { id: "prd-exists",          label: "prd.md criado com todas as seções obrigatórias",                  mandatory: true,  category: "artifact",
        action: { type: "openFile", target: ".github/artifacts/prd.md", tooltip: "Abrir prd.md" } },
      { id: "feature-list-exists", label: "feature-list.md criado com features priorizadas",                 mandatory: true,  category: "artifact",
        action: { type: "openFile", target: ".github/artifacts/feature-list.md", tooltip: "Abrir feature-list.md" } },
      { id: "prd-references-brief",label: "PRD referencia o business-brief.md",                              mandatory: true,  category: "contract", hint: "Rastreabilidade entre brief → PRD" },
      { id: "features-prioritized",label: "Features ordenadas por prioridade (ex: MoSCoW ou valor/esforço)", mandatory: true,  category: "quality" },
      { id: "acceptance-criteria", label: "Cada feature tem critério de aceite mensurável",                  mandatory: true,  category: "quality",   hint: "Critério vago (ex: 'funcionar bem') é inválido" },
      { id: "personas-mapped",     label: "Personas do brief mapeadas para features",                        mandatory: false, category: "quality" },
      { id: "no-gherkin",          label: "Sem cenários Gherkin no PRD",                                     mandatory: true,  category: "pattern",   hint: "BDD é responsabilidade do @bdd, não do @product" },
      { id: "no-tech-stack",       label: "Sem decisões de stack ou framework no PRD",                       mandatory: true,  category: "pattern" },
    ],
  },

  "ux-design": {
    ...phaseHeader("ux-design"),
    why: "Mapeia jornadas e fluxos do usuário antes do domínio ser modelado — o protótipo vira insumo pro Domínio e pro BDD.",
    requiredInputs: [
      { id: "prd", label: "PRD", relPath: ".github/artifacts/prd.md" },
    ],
    outputs: [
      { id: "design", label: "UX Design / User Flows", relPath: "docs/design/user-flows.md" },
    ],
    guardRails: [
      "Não implementar código de produção",
      "Não decidir stack de frontend",
      "Não criar BDD (isso é do @bdd)",
    ],
    exitCriteria: [
      "docs/design/user-flows.md existe com jornadas do usuário mapeadas",
      "Protótipo HTML navegável em docs/design/ (opcional mas recomendado)",
      "delivery-state.yaml atualizado: phases.ux-design.status = done",
    ],
    guardRailChecklist: [
      { id: "user-flows-exists",  label: "docs/design/user-flows.md criado",                                 mandatory: true,  category: "artifact",
        action: { type: "openFile", target: "docs/design/user-flows.md", tooltip: "Abrir user-flows.md" } },
      { id: "all-personas",       label: "Jornadas mapeadas para todas as personas do PRD",                  mandatory: true,  category: "quality" },
      { id: "happy-sad-paths",    label: "Fluxos incluem happy path e caminhos de erro",                     mandatory: true,  category: "quality" },
      { id: "prototype-exists",   label: "Protótipo HTML navegável criado em docs/design/",                  mandatory: false, category: "artifact", hint: "Recomendado para validação com stakeholders",
        action: { type: "openBrowser", target: "docs/design/prototype/index.html", tooltip: "Abrir protótipo no browser" } },
      { id: "no-code",            label: "Sem código de produção (apenas wireframes/protótipos)",             mandatory: true,  category: "pattern" },
    ],
  },

  domain: {
    ...phaseHeader("domain"),
    why: "Modela bounded contexts e linguagem ubíqua — a fronteira que toda arquitetura e todo código depois vai respeitar.",
    requiredInputs: [
      { id: "brief", label: "Business Brief", relPath: ".github/artifacts/business-brief.md" },
      { id: "prd",   label: "PRD",            relPath: ".github/artifacts/prd.md" },
    ],
    outputs: [
      { id: "domain-bc",  label: "Bounded Contexts",  relPath: "docs/domain/bounded-contexts.md" },
      { id: "domain-es",  label: "Event Storming",    relPath: "docs/domain/event-storming.md" },
      { id: "domain-ul",  label: "Linguagem Ubíqua",  relPath: "docs/domain/ubiquitous-language.md" },
    ],
    guardRails: [
      "Não escrever código de implementação",
      "Não definir OpenAPI nem schema de banco",
      "Não criar BDD",
    ],
    exitCriteria: [
      "docs/domain/bounded-contexts.md lista contextos classificados (core/supporting/generic)",
      "Event storming documentado com pelo menos 5 domain events",
      "Linguagem ubíqua com glossário mínimo",
      "delivery-state.yaml atualizado: phases.domain.status = done",
    ],
    guardRailChecklist: [
      { id: "bc-exists",        label: "bounded-contexts.md criado com BCs classificados",                   mandatory: true,  category: "artifact",
        action: { type: "openFile", target: "docs/domain/bounded-contexts.md", tooltip: "Abrir bounded-contexts.md" } },
      { id: "bc-classified",    label: "Cada BC classificado: Core / Supporting / Generic",                  mandatory: true,  category: "quality",   hint: "Core = diferencial competitivo. Generic = pode comprar pronto" },
      { id: "event-storming",   label: "event-storming.md com ≥5 Domain Events por BC core",                mandatory: true,  category: "artifact",
        action: { type: "openFile", target: "docs/domain/event-storming.md", tooltip: "Abrir event-storming.md" } },
      { id: "ubiquitous-lang",  label: "ubiquitous-language.md com glossário por BC",                       mandatory: true,  category: "artifact",  hint: "Cada termo com definição, contexto e anti-sinônimos",
        action: { type: "openFile", target: "docs/domain/ubiquitous-language.md", tooltip: "Abrir ubiquitous-language.md" } },
      { id: "context-map",      label: "Relacionamentos entre BCs documentados (U/D, ACL, OHS)",             mandatory: false, category: "quality",   hint: "Upstream/Downstream, Anti-Corruption Layer, Open Host Service" },
      { id: "aggregates",       label: "Agregados-raiz identificados por BC",                                mandatory: false, category: "quality" },
      { id: "no-tech-terms",    label: "Zero termos técnicos (DTO, tabela, endpoint) no domínio",            mandatory: true,  category: "pattern" },
      { id: "ul-consistent",    label: "Linguagem ubíqua consistente com PRD e business-brief",              mandatory: true,  category: "contract" },
    ],
  },

  bdd: {
    ...phaseHeader("bdd"),
    why: "Escreve cenários executáveis em Gherkin — o contrato de comportamento que guia arquitetura, implementação e teste.",
    requiredInputs: [
      { id: "prd",    label: "PRD",        relPath: ".github/artifacts/prd.md" },
      { id: "design", label: "UX Design",  relPath: "docs/design/user-flows.md" },
    ],
    outputs: [
      { id: "bdd", label: "BDD Features (.feature)", relPath: "features/" },
    ],
    guardRails: [
      "Não implementar step definitions (isso é do @qa-tester)",
      "Não decidir arquitetura",
      "Não incluir detalhes de implementação técnica nos cenários",
      "Cenários devem ser declarativos (Given/When/Then), não prescritivos",
    ],
    exitCriteria: [
      "Pelo menos um arquivo .feature por contexto do PRD",
      "Cenários cobrem happy path e pelo menos um caminho de erro por feature",
      "Linguagem ubíqua do domínio usada nos Given/When/Then",
      "delivery-state.yaml atualizado: phases.bdd.status = done",
    ],
    guardRailChecklist: [
      { id: "feature-per-bc",     label: "Pelo menos 1 .feature por bounded context do PRD",                mandatory: true,  category: "coverage",  hint: "Estrutura: features/<bc>/<feature>.feature",
        action: { type: "revealFolder", target: "features", tooltip: "Abrir pasta features/ no Explorer" } },
      { id: "tags-present",       label: "Tags @bc, @persona, @release, @risk em 100% dos cenários",        mandatory: true,  category: "pattern",   hint: "Sem tags = não entra no CI filtrado por release" },
      { id: "happy-path",         label: "Cenário @happy-path para cada feature",                           mandatory: true,  category: "coverage" },
      { id: "edge-cases",         label: "≥1 cenário @edge ou @error por feature",                          mandatory: true,  category: "coverage" },
      { id: "validation-cases",   label: "≥1 cenário @validation com Esquema do Cenário (variações)",       mandatory: false, category: "coverage" },
      { id: "ul-terms",           label: "Linguagem ubíqua do domínio usada (zero termos técnicos)",         mandatory: true,  category: "pattern",   hint: "Sem: endpoint, DTO, tabela, ID numérico, JSON, HTTP" },
      { id: "declarative-steps",  label: "Steps declarativos — sem interação UI, SQL ou HTTP",              mandatory: true,  category: "pattern",   hint: "❌ 'clica no botão #submit'  ✅ 'o cliente confirma o pedido'" },
      { id: "one-behavior",       label: "Cada cenário testa um único comportamento",                        mandatory: true,  category: "quality",   hint: "Título com 'e' = candidato a split" },
      { id: "no-step-defs",       label: "Sem step definitions (.feature apenas — sem código de teste)",    mandatory: true,  category: "pattern" },
      { id: "hotspots-resolved",  label: "bdd-hotspots.md sem itens open/high pendentes",                   mandatory: false, category: "quality",   hint: "Hotspots não resolvidos voltam para @domain-modeler" },
    ],
  },

  architecture: {
    ...phaseHeader("architecture"),
    why: "Define contrato OpenAPI, diagramas C4 e ADRs — o blueprint técnico que todo agente de stack vai seguir.",
    requiredInputs: [
      { id: "domain-bc", label: "Bounded Contexts", relPath: "docs/domain/bounded-contexts.md" },
      { id: "bdd",       label: "BDD Features",     relPath: "features/" },
    ],
    outputs: [
      { id: "openapi", label: "OpenAPI Contract",  relPath: "api/openapi.yaml" },
      { id: "adr",     label: "ADRs",              relPath: "docs/adr/" },
      { id: "c4",      label: "Diagramas C4",      relPath: "docs/architecture/" },
    ],
    guardRails: [
      "Não implementar código de aplicação",
      "Não escrever BDD",
      "Não ignorar bounded contexts já definidos",
      "Contrato OpenAPI deve ser contract-first (não gerado de código)",
    ],
    exitCriteria: [
      "api/openapi.yaml válido com pelo menos um endpoint por bounded context",
      "Pelo menos um ADR documentando a decisão de stack",
      "Diagrama C4 (context + container) em docs/architecture/",
      "delivery-state.yaml atualizado: phases.architecture.status = done",
    ],
    guardRailChecklist: [
      // C4 Diagrams
      { id: "c4-context",        label: "C4 L1 — Context: atores e sistemas externos",                       mandatory: true,  category: "artifact",
        action: { type: "revealFolder", target: "docs/architecture/c4", tooltip: "Abrir docs/architecture/c4/" } },
      { id: "c4-container",      label: "C4 L2 — Container: serviços, BDs, brokers e frontends",             mandatory: true,  category: "artifact" },
      { id: "c4-component",      label: "C4 L3 — Component: camadas hexagonais por Core Subdomain",          mandatory: true,  category: "artifact",  hint: "Um arquivo por Core BC mostrando domain / application / adapters" },
      { id: "c4-deployment",     label: "Deployment diagram: infra, regiões, LB, DNS, OTel",                 mandatory: true,  category: "artifact",  hint: "Onde cada container roda — ECS, K8s, Cloud Run, RDS, ElastiCache..." },
      // Sequence diagrams
      { id: "sequence-diagrams", label: "Seq: autenticação + happy path por BC + erro de domínio",           mandatory: true,  category: "artifact",  hint: "Um .drawio por fluxo — não misturar fluxos no mesmo diagrama" },
      { id: "seq-async",         label: "Seq: fluxos assíncronos (workers, consumers, webhooks) com retry",  mandatory: true,  category: "artifact",  hint: "Trigger → processamento → retry policy → DLQ / side effects" },
      { id: "seq-integration",   label: "Seq: integrações externas relevantes com circuit breaker",          mandatory: false, category: "artifact" },
      // Data model
      { id: "data-model",        label: "Modelo ER por BC: Mermaid ERD + índices + políticas RLS/RBAC",      mandatory: true,  category: "artifact",  hint: "docs/architecture/data/er-{bc}.md — um por BC com banco próprio" },
      // OpenAPI
      { id: "openapi-valid",     label: "api/openapi.yaml com lint Spectral OK (OpenAPI 3.1+)",              mandatory: true,  category: "contract",
        action: { type: "openFile", target: "api/openapi.yaml", tooltip: "Abrir api/openapi.yaml" } },
      { id: "openapi-per-bc",    label: "Pelo menos 1 endpoint por bounded context",                         mandatory: true,  category: "contract" },
      { id: "openapi-ul",        label: "operationId e schemas em linguagem ubíqua do domínio",              mandatory: true,  category: "contract",  hint: "Sem 'getData', 'doPost'. Use nomes do domínio: 'createOrder', 'applyDiscount'" },
      { id: "error-envelope",    label: "Envelope de erro único: {code, message, details, traceId}",         mandatory: true,  category: "contract" },
      { id: "auth-defined",      label: "Padrão de autenticação definido em todos os endpoints",             mandatory: true,  category: "security" },
      { id: "pagination",        label: "Paginação cursor-based em todas as listagens",                      mandatory: false, category: "contract",  hint: "?cursor=&limit= por padrão" },
      // ADRs
      { id: "adr-stack",         label: "ADR: stack de backend com justificativa",                           mandatory: true,  category: "artifact",
        action: { type: "revealFolder", target: "docs/adr", tooltip: "Abrir pasta docs/adr/" } },
      { id: "adr-arch-pattern",  label: "ADR: padrão arquitetural com mapeamento de camadas",                mandatory: true,  category: "artifact" },
      { id: "adr-persistence",   label: "ADR: persistência — BD por BC, cache, eventos",                    mandatory: true,  category: "artifact" },
      { id: "otel-plan",         label: "OTel: spans por use case + métricas RED + logs estruturados",       mandatory: true,  category: "quality" },
      { id: "hex-structure",     label: "Estrutura hexagonal documentada: domain/ application/ adapters/",   mandatory: true,  category: "pattern" },
    ],
  },

  "sprint-plan": {
    ...phaseHeader("sprint-plan"),
    why: "Quebra features em histórias com DoR, estimativa e dependências — o backlog que a sprint vai executar.",
    requiredInputs: [
      { id: "arch",   label: "Arquitetura (OpenAPI)", relPath: "api/openapi.yaml" },
      { id: "sprint", label: "Sprint Backlog (ausente = criar)", relPath: ".github/artifacts/sprint-backlog.yaml" },
    ],
    outputs: [
      { id: "sprint", label: "Sprint Backlog", relPath: ".github/artifacts/sprint-backlog.yaml" },
    ],
    guardRails: [
      "Não implementar código",
      "Não criar BDD",
      "Não alocar histórias sem critério de aceite",
      "Estimativas em story points, não horas",
    ],
    exitCriteria: [
      "sprint-backlog.yaml com nome, objetivo, histórias, estimativas e DoD",
      "Todas as histórias rastreáveis às features do PRD",
      "Velocity de referência documentado",
      "delivery-state.yaml atualizado: phases.sprint-plan.status = done",
    ],
    guardRailChecklist: [
      { id: "backlog-exists",    label: "sprint-backlog.yaml criado com sprint name e objetivo",              mandatory: true,  category: "artifact",
        action: { type: "openFile", target: ".github/artifacts/sprint-backlog.yaml", tooltip: "Abrir sprint-backlog.yaml" } },
      { id: "stories-dod",       label: "Todas as histórias têm critério de aceite (DoD)",                   mandatory: true,  category: "quality",   hint: "DoD vago (ex: 'funcionar') é inválido" },
      { id: "stories-estimated", label: "Histórias estimadas em story points (Fibonacci)",                   mandatory: true,  category: "quality" },
      { id: "stories-traceable", label: "Cada história rastreável a uma feature do feature-list.md",         mandatory: true,  category: "contract" },
      { id: "velocity-defined",  label: "Velocity de referência documentado no backlog",                     mandatory: false, category: "quality" },
      { id: "sprint-capacity",   label: "Capacidade do sprint (total SP) dentro de 70-80% da velocity",     mandatory: false, category: "quality",   hint: "Buffer para imprevistos" },
    ],
  },

  "sprint-run": {
    ...phaseHeader("sprint-run"),
    why: "Despacha as histórias do backlog para os agentes de stack certos — é aqui que o código começa a ser escrito.",
    requiredInputs: [
      { id: "sprint", label: "Sprint Backlog", relPath: ".github/artifacts/sprint-backlog.yaml" },
    ],
    outputs: [
      { id: "dispatch", label: "Despacho para stack agents", relPath: "" },
    ],
    guardRails: [
      "Não implementar código diretamente",
      `Rotear para @backend-* ou @frontend-* conforme ${BRAND.files.config}`,
      "Não pular o gate G1 (upstream→downstream) se não foi validado",
    ],
    exitCriteria: [
      "Histórias distribuídas para os agentes de stack",
      "delivery-state.yaml atualizado: phases.sprint-run.status = done",
    ],
    guardRailChecklist: [
      { id: "g1-passed",         label: "Gate G1 validado: upstream completo e aprovado",                    mandatory: true,  category: "contract",  hint: "@stream-align + @arch-cross devem ter aprovado" },
      { id: "stack-dispatched",  label: "Histórias despachadas para os agentes de stack corretos",           mandatory: true,  category: "quality" },
      { id: "context-injected",  label: "Contexto (OpenAPI + BDD + domain) injetado para cada agente",       mandatory: true,  category: "quality" },
    ],
  },

  backend: {
    ...phaseHeader("backend"),
    why: "Implementa os endpoints do contrato em arquitetura limpa — testado, sem acoplamento ao framework.",
    requiredInputs: [
      { id: "arch",   label: "OpenAPI Contract",  relPath: "api/openapi.yaml" },
      { id: "sprint", label: "Sprint Backlog",    relPath: ".github/artifacts/sprint-backlog.yaml" },
    ],
    outputs: [
      { id: "code", label: "Código Backend", relPath: "code/services/" },
    ],
    guardRails: [
      "Não criar endpoints fora do contrato OpenAPI",
      "Não pular testes unitários das regras de domínio",
      "Não acoplar ao framework (clean/hexagonal architecture)",
    ],
    exitCriteria: [
      "Endpoints do sprint implementados e testados",
      "Cobertura de testes ≥ 80% nas regras de domínio",
      "Sem erros de build/lint",
      "delivery-state.yaml atualizado: phases.backend.status = done",
    ],
    guardRailChecklist: [
      // Hexagonal Architecture
      { id: "hex-domain-pure",    label: "domain/ puro: zero imports de framework, zero IO",                 mandatory: true,  category: "pattern",   hint: "Se domain/ importa FastAPI/Spring/etc, arquitetura está quebrada" },
      { id: "hex-ports-defined",  label: "Ports (interfaces) definidas entre camadas",                       mandatory: true,  category: "pattern",   hint: "application/ depende só de ports. adapters/ implementam ports" },
      { id: "hex-adapters",       label: "Adapters implementados: HTTP, DB, e outros externos",               mandatory: true,  category: "pattern" },
      { id: "composition-root",   label: "Composition Root único (DI explícita sem service locator)",        mandatory: true,  category: "pattern" },
      // OpenAPI contract
      { id: "openapi-contract",   label: "Todos endpoints do sprint implementam o contrato OpenAPI exato",   mandatory: true,  category: "contract",  hint: "Sem endpoints extras não documentados no sprint",
        action: { type: "openFile", target: "api/openapi.yaml", tooltip: "Conferir api/openapi.yaml" } },
      { id: "error-envelope",     label: "Envelope de erro conforme definido na arquitetura",                mandatory: true,  category: "contract" },
      // Tests
      { id: "unit-domain",        label: "Testes unitários das regras de domínio (sem mocks de framework)",  mandatory: true,  category: "coverage",  hint: "Domain = testável sem DI, sem DB, sem HTTP" },
      { id: "unit-coverage",      label: "Cobertura ≥ 80% nos módulos de domínio e application",            mandatory: true,  category: "coverage" },
      { id: "integration-tests",  label: "Testes de integração com infra real (Testcontainers / Docker)",    mandatory: true,  category: "coverage",  hint: "DB, cache, filas — sem mocks de infra nos testes de integração" },
      { id: "contract-tests",     label: "Testes de contrato validam request/response vs OpenAPI",           mandatory: false, category: "contract" },
      // Observability
      { id: "otel-spans",         label: "OTel: span no entry-point HTTP e em chamadas externas (DB, APIs)", mandatory: true,  category: "quality",   hint: "1 span por entrada. Atributos: tenant.id, feature, command" },
      { id: "structured-logs",    label: "Logs estruturados (JSON) com trace_id propagado",                  mandatory: true,  category: "quality" },
      // Security
      { id: "no-secrets",         label: "Zero secrets hardcoded — usar variáveis de ambiente",              mandatory: true,  category: "security" },
      { id: "input-validation",   label: "Inputs validados na borda (adapter HTTP/event)",                   mandatory: true,  category: "security" },
      { id: "no-pii-logs",        label: "Sem PII em logs sem mascaramento",                                 mandatory: true,  category: "security" },
      { id: "no-sql-concat",      label: "Sem concatenação de SQL — usar ORM ou queries parametrizadas",     mandatory: true,  category: "security" },
      // Build
      { id: "lint-clean",         label: "Lint e type-check passando sem warnings",                          mandatory: true,  category: "quality" },
      { id: "no-circular-deps",   label: "Sem dependências circulares entre módulos",                        mandatory: true,  category: "pattern" },
    ],
  },

  frontend: {
    ...phaseHeader("frontend"),
    why: "Implementa as telas do sprint integradas à API — seguindo o design system, sem endpoint hardcoded.",
    requiredInputs: [
      { id: "design", label: "UX Design",       relPath: "docs/design/user-flows.md" },
      { id: "arch",   label: "OpenAPI Contract", relPath: "api/openapi.yaml" },
    ],
    outputs: [
      { id: "app", label: "Código Frontend", relPath: "code/apps/" },
    ],
    guardRails: [
      "Não criar endpoints no frontend (usar API contratada)",
      "Seguir design system definido",
      "Não pular testes de componentes",
    ],
    exitCriteria: [
      "Telas do sprint implementadas seguindo os wireframes",
      "Integração com API validada",
      "Sem erros de build/lint",
      "delivery-state.yaml atualizado: phases.frontend.status = done",
    ],
    guardRailChecklist: [
      { id: "sdk-not-raw",        label: "Consumindo SDK gerado — sem chamadas HTTP raw",                     mandatory: true,  category: "contract",  hint: "❌ fetch('/api/orders'). ✅ ordersApi.createOrder()" },
      { id: "wireframes-followed", label: "Telas implementam os wireframes do UX Design",                    mandatory: true,  category: "quality",
        action: { type: "openFile", target: "docs/design/user-flows.md", tooltip: "Conferir user-flows.md" } },
      { id: "feature-sliced",     label: "Estrutura feature-sliced: src/features/<feature>/{ui,model,api}",  mandatory: false, category: "pattern" },
      { id: "component-tests",    label: "Testes de componentes para UI crítica",                            mandatory: true,  category: "coverage" },
      { id: "e2e-main-flows",     label: "Testes E2E para fluxos principais (login, happy path)",            mandatory: false, category: "coverage" },
      { id: "a11y-checked",       label: "Acessibilidade básica verificada (semântica HTML, ARIA labels)",   mandatory: false, category: "quality" },
      { id: "no-api-hardcode",    label: "Sem URLs de API hardcoded — usar variáveis de ambiente",           mandatory: true,  category: "security" },
      { id: "typescript-strict",  label: "TypeScript strict: true — sem any, sem @ts-ignore",                mandatory: true,  category: "quality" },
      { id: "lint-clean",         label: "ESLint e type-check passando sem warnings",                        mandatory: true,  category: "quality" },
    ],
  },

  reviewer: {
    ...phaseHeader("reviewer"),
    why: "Revisa o código contra arquitetura, contrato e OWASP Top 10 antes do merge — o último gate antes de produção.",
    requiredInputs: [
      { id: "code", label: "Código (backend ou frontend)", relPath: "code/" },
    ],
    outputs: [
      { id: "review", label: "Review Report", relPath: "" },
    ],
    guardRails: [
      "Não fazer merge sem aprovação explícita",
      "Não ignorar violações de segurança OWASP Top 10",
      "Verificar aderência ao contrato OpenAPI",
    ],
    exitCriteria: [
      "Review report produzido com findings priorizados",
      "Violações críticas de segurança resolvidas",
      "Código aprovado para merge",
      "delivery-state.yaml atualizado: phases.reviewer.status = done",
    ],
    guardRailChecklist: [
      { id: "arch-compliance",    label: "Aderência à arquitetura hexagonal verificada",                     mandatory: true,  category: "pattern",   hint: "domain/ puro, ports definidas, adapters isolados" },
      { id: "openapi-compliance", label: "Código implementa 100% do contrato OpenAPI do sprint",             mandatory: true,  category: "contract" },
      { id: "owasp-a01",          label: "OWASP A01 — Broken Access Control: auth em todos endpoints",       mandatory: true,  category: "security" },
      { id: "owasp-a02",          label: "OWASP A02 — Cryptographic Failures: sem dados sensíveis em plain", mandatory: true,  category: "security" },
      { id: "owasp-a03",          label: "OWASP A03 — Injection: sem SQL/NoSQL/command injection",           mandatory: true,  category: "security" },
      { id: "owasp-a07",          label: "OWASP A07 — Identificação e autenticação validadas",               mandatory: true,  category: "security" },
      { id: "test-coverage-met",  label: "Cobertura de testes ≥ 80% (domínio) e ≥ 60% (integração)",       mandatory: true,  category: "coverage" },
      { id: "no-debt",            label: "Sem TODO/FIXME órfão — todos com ticket ou removidos",             mandatory: false, category: "quality" },
      { id: "conventional-commits", label: "Commits seguem Conventional Commits",                           mandatory: false, category: "quality" },
    ],
  },

  devops: {
    ...phaseHeader("devops"),
    why: "Configura CI/CD e infraestrutura como código — o caminho automatizado até staging e produção.",
    requiredInputs: [
      { id: "code", label: "Código aprovado para deploy", relPath: "code/" },
    ],
    outputs: [
      { id: "pipelines",  label: "CI/CD Pipelines", relPath: "pipelines/" },
      { id: "infra",      label: "IaC",              relPath: "infrastructure/" },
    ],
    guardRails: [
      "Não hardcodar segredos ou credenciais",
      "Usar IaC (não configuração manual)",
      "Seguir 12-factor app",
    ],
    exitCriteria: [
      "Pipeline CI com build, test e lint passando",
      "Pipeline CD com deploy automatizado para staging",
      "IaC versionado e revisado",
      "delivery-state.yaml atualizado: phases.devops.status = done",
    ],
    guardRailChecklist: [
      { id: "ci-build-test",     label: "Pipeline CI: build + lint + testes passando",                       mandatory: true,  category: "quality" },
      { id: "cd-staging",        label: "Pipeline CD: deploy automático para staging",                       mandatory: true,  category: "quality" },
      { id: "iac-versioned",     label: "IaC (Terraform/Pulumi/etc) versionado no repo",                    mandatory: true,  category: "artifact",
        action: { type: "revealFolder", target: "infrastructure", tooltip: "Abrir pasta infrastructure/ no Explorer" } },
      { id: "no-hardcoded-secrets", label: "Zero secrets hardcoded em pipelines ou IaC",                    mandatory: true,  category: "security" },
      { id: "12factor",          label: "12-factor: config via env, stateless, logs stdout",                 mandatory: true,  category: "pattern",   hint: "https://12factor.net" },
      { id: "healthcheck",       label: "Health check endpoint configurado no deploy",                       mandatory: false, category: "quality" },
    ],
  },

  release: {
    ...phaseHeader("release"),
    why: "Versiona semanticamente, gera release notes e fecha o ciclo da sprint.",
    requiredInputs: [
      { id: "code",      label: "Código merged",   relPath: "code/" },
      { id: "pipelines", label: "CI/CD passando",  relPath: "pipelines/" },
    ],
    outputs: [
      { id: "release-tag", label: "Tag semver + Release Notes", relPath: "" },
    ],
    guardRails: [
      "Não tagear versão sem pipeline verde",
      "Seguir semver (major.minor.patch)",
      "Release notes devem referenciar histórias do sprint",
    ],
    exitCriteria: [
      "Tag semver criada e publicada",
      "CHANGELOG.md atualizado",
      "Release notes com summary das features entregues",
      "delivery-state.yaml atualizado: phases.release.status = done",
    ],
    guardRailChecklist: [
      { id: "pipeline-green",    label: "Pipeline CI verde na branch de release",                            mandatory: true,  category: "quality" },
      { id: "semver-tag",        label: "Tag semver criada (major.minor.patch)",                             mandatory: true,  category: "artifact" },
      { id: "changelog-updated", label: "CHANGELOG.md atualizado com features e breaking changes",          mandatory: true,  category: "artifact" },
      { id: "release-notes",     label: "Release notes referenciam histórias do sprint",                    mandatory: true,  category: "artifact" },
    ],
  },

  observability: {
    ...phaseHeader("observability"),
    why: "Define SLOs, dashboards e alertas com runbook — sem isso, ninguém sabe que algo quebrou até o cliente reclamar.",
    requiredInputs: [
      { id: "code", label: "Código em produção", relPath: "code/" },
    ],
    outputs: [
      { id: "obs", label: "Dashboards e Alertas", relPath: "infrastructure/observability/" },
    ],
    guardRails: [
      "SLOs devem ser definidos antes dos alertas",
      "Não criar alertas sem runbook",
      "Observabilidade via OTel nativo (não vendor lock-in)",
    ],
    exitCriteria: [
      "SLOs documentados (availability, latency, error rate)",
      "Alertas configurados para cada SLO",
      "Dashboard com golden signals (traffic, errors, latency, saturation)",
      "delivery-state.yaml atualizado: phases.observability.status = done",
    ],
    guardRailChecklist: [
      { id: "slos-defined",      label: "SLOs definidos: availability, latency (p99), error rate",          mandatory: true,  category: "quality",   hint: "Ex: 99.9% availability, p99 < 200ms, error rate < 0.1%" },
      { id: "golden-signals",    label: "Dashboard com golden signals (Traffic, Errors, Latency, Saturation)", mandatory: true, category: "artifact" },
      { id: "alerts-with-runbooks", label: "Alertas têm runbook associado",                                 mandatory: true,  category: "quality" },
      { id: "otel-native",       label: "Observabilidade via OpenTelemetry nativo (não SDK vendor)",         mandatory: true,  category: "pattern" },
      { id: "traces-connected",  label: "Traces conectam frontend → backend → DB end-to-end",               mandatory: false, category: "quality" },
    ],
  },

  incident: {
    ...phaseHeader("incident"),
    why: "Diagnostica, documenta e corrige um incidente em produção com post-mortem blameless.",
    requiredInputs: [],
    outputs: [
      { id: "runbook",    label: "Runbook",      relPath: ".github/artifacts/incidents/" },
      { id: "postmortem", label: "Post-mortem", relPath: ".github/artifacts/incidents/" },
    ],
    guardRails: [
      "Não fazer mudanças em prod sem aprovação do on-call",
      "Registrar toda ação com timestamp",
      "Post-mortem deve ser blameless",
    ],
    exitCriteria: [
      "Incidente encerrado e root cause identificado",
      "Runbook atualizado",
      "Post-mortem publicado dentro de 5 dias úteis",
      "Action items criados para prevenir recorrência",
      "delivery-state.yaml atualizado: phases.incident.status = done",
    ],
    guardRailChecklist: [
      { id: "root-cause",        label: "Root cause identificado (5-whys ou equivalente)",                   mandatory: true,  category: "quality" },
      { id: "runbook-updated",   label: "Runbook atualizado com os passos tomados",                          mandatory: true,  category: "artifact" },
      { id: "postmortem",        label: "Post-mortem blameless publicado",                                   mandatory: true,  category: "artifact" },
      { id: "action-items",      label: "Action items criados para prevenir recorrência",                    mandatory: true,  category: "quality" },
    ],
  },

  sustain: {
    ...phaseHeader("sustain"),
    why: "Mantém dependências e CVEs em dia — a dívida que, se ignorada, vira o próximo incidente.",
    requiredInputs: [
      { id: "code", label: "Código em manutenção", relPath: "code/" },
    ],
    outputs: [
      { id: "patches", label: "PRs de patch/upgrade", relPath: "" },
    ],
    guardRails: [
      "Não fazer upgrade major sem ADR",
      "Não descartar CVEs sem justificativa documentada",
      "Testes devem passar antes de PRs de sustentação",
    ],
    exitCriteria: [
      "CVEs críticos e altos resolvidos",
      "Dependências atualizadas sem breaking changes",
      "Testes passando após upgrades",
      "delivery-state.yaml atualizado: phases.sustain.status = done",
    ],
    guardRailChecklist: [
      { id: "cves-resolved",     label: "CVEs críticos e altos resolvidos ou justificados",                  mandatory: true,  category: "security" },
      { id: "tests-passing",     label: "Testes passando após upgrades",                                     mandatory: true,  category: "coverage" },
      { id: "adr-for-major",     label: "ADR criado para upgrades de versão major",                          mandatory: false, category: "artifact" },
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Checks which required inputs for a phase are missing given the workspace root.
 * Returns [] if all present (phase is ready to start).
 */
export function getMissingInputs(
  phaseId: string,
  _root: string,
  existsFn: (relPath: string) => boolean
): PhaseInput[] {
  const contract = PHASE_CONTRACTS[phaseId];
  if (!contract) return [];
  return contract.requiredInputs.filter(input => {
    if (!input.relPath) return false;
    return !existsFn(input.relPath);
  });
}

/**
 * Returns true if a phase can start (all required inputs present).
 */
export function isPhaseReady(
  phaseId: string,
  existsFn: (relPath: string) => boolean
): boolean {
  const contract = PHASE_CONTRACTS[phaseId];
  if (!contract || contract.requiredInputs.length === 0) return true;
  return getMissingInputs(phaseId, "", existsFn).length === 0;
}
