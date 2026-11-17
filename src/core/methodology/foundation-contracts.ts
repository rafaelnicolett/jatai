/**
 * foundation-contracts.ts
 *
 * Contratos das fases do stream Foundation (brownfield).
 * Paralelo ao phase-contracts.ts do greenfield.
 *
 * Cada fase tem:
 *   - out          : artefato produzido (relativo a .github/artifacts/)
 *   - mandatory    : se obrigatória para desbloquear o gate F1
 *   - checklist    : itens que o humano valida antes de marcar a fase como done
 *
 * Gate F1 destrava quando todos os itens mandatory=true das fases
 * mandatory=true estiverem com human_checklist checked.
 */

import { BRAND } from "../brand/brand.pure";

export interface FoundationChecklistItem {
  id: string;
  label: string;
  hint?: string;
  mandatory: boolean;
}

/**
 * Escopo de execução da fase num workspace multi-repo.
 *
 * - `repo`      → roda **uma vez por repositório**. O estado vive em
 *                 `foundation-state.repos.<id>.phases`.
 * - `workspace` → roda **uma vez, cross-repo**. `@domain-extractor` é o caso
 *                 canônico: ele precisa ver todos os repos de uma vez para
 *                 descobrir que um contexto atravessa dois. O estado vive em
 *                 `foundation-state.phases`.
 */
export type FoundationPhaseScope = "repo" | "workspace";

/** Raiz dos artefatos de assessment, relativa a `.github/artifacts/`. */
export const ASSESSMENT_DIR = "assessment";

/** Diretório de artefatos de um repositório: `assessment/repos/<id>/`. */
export function repoAssessmentDir(repoId: string): string {
  return `${ASSESSMENT_DIR}/repos/${repoId}`;
}

/**
 * Resolve onde o artefato de uma fase vive.
 *
 *   scope: repo      + repoId → assessment/repos/<id>/tech-stack/tech-radar.md
 *   scope: workspace          → assessment/domain/context-map.md   (não muda)
 *
 * Sem `repoId`, devolve o path legado (v1, single-repo) — é o que mantém
 * workspaces antigos legíveis enquanto o inventário não existe.
 */
export function resolveArtifactPath(contract: Pick<FoundationPhaseContract, "out" | "scope">, repoId?: string): string {
  if (contract.scope === "workspace" || !repoId) return contract.out;
  return contract.out.replace(
    new RegExp(`^${ASSESSMENT_DIR}/`),
    `${repoAssessmentDir(repoId)}/`
  );
}

export interface FoundationPhaseContract {
  phaseId: string;
  label: string;
  agent: string;
  icon: string;
  /** Path do artefato relativo a `.github/artifacts/` */
  out: string;
  /** Onde a fase roda: por repositório ou uma vez para o workspace inteiro. */
  scope: FoundationPhaseScope;
  /**
   * Condição para a fase se aplicar.
   *
   * `"frontend"`  → só roda em repo com UI (repo-scoped). Um `billing-api` sem
   *                 tela não tem design a arqueologar; forçar a fase lá seria
   *                 ruído no plano.
   * `"multi-repo"` → só existe sentido com N > 1 repositórios (workspace-scoped).
   *                 `@dependency-mapper` não tem o que mapear com um repo só.
   * Ausente = sempre se aplica.
   */
  appliesWhen?: "frontend" | "multi-repo";
  /**
   * Por que esta fase existe e o que ela destrava.
   *
   * Ensinar no contexto vence tutorial: o operador lê isto no momento em que
   * está naquela fase, não numa aba separada que ninguém abre.
   */
  why: string;
  /** Se true, itens mandatory desta fase bloqueiam o gate F1 */
  mandatoryForF1: boolean;
  checklist: FoundationChecklistItem[];
}

// ── Foundation assessment phases (Technical + Business tracks) ────────────

export const FOUNDATION_CONTRACTS: FoundationPhaseContract[] = [
  {
    phaseId: "tech-stack",
    label: "Tech Stack",
    agent: "@tech-mapper",
    icon: "🧰",
    out: "assessment/tech-stack/tech-radar.md",
    scope: "repo",
    why: "Descobre a stack real e qual @backend-{stack} vai atuar neste repositório. Sem isso, o executor escreveria no padrão errado.",
    mandatoryForF1: true,
    checklist: [
      { id: "stack-identified",  label: "Stack identificado (backend + frontend)",        mandatory: true  },
      { id: "deps-listed",       label: "Dependências principais listadas com versões",    mandatory: true  },
      { id: "runtime-versions",  label: "Versões de runtime mapeadas (Python, Node...)",  mandatory: false },
    ],
  },
  {
    phaseId: "arch",
    label: "Arquitetura",
    agent: "@arch-discoverer",
    icon: "📐",
    out: "assessment/architecture/arch-discovery.md",
    scope: "repo",
    why: "Infere o padrão arquitetural que o repositório É hoje (com confiança %). Vira o arch_current — o padrão que todo agente vai conformar.",
    mandatoryForF1: true,
    checklist: [
      { id: "arch-pattern",          label: "Padrão arquitetural identificado (com confiança %)",  mandatory: true  },
      { id: "layers-mapped",         label: "Camadas e módulos mapeados (coupling matrix)",         mandatory: true  },
      { id: "drawio-generated",      label: "Diagrama Draw.io gerado (arch-discovery.drawio)",      mandatory: true  },
      { id: "c4-container-inferred", label: "C4 Container inferido — serviços e bancos detectados", mandatory: true  },
      { id: "c4-component-inferred", label: "C4 Component do módulo principal",                     mandatory: false },
      { id: "arch-debt",             label: "Debt arquitetural documentado (anti-padrões)",          mandatory: false },
    ],
  },
  {
    // Passo 2b do @assessor. Rodava sem contrato — o dashboard nunca sabia que
    // essa fase existia (nem "pendente" aparecia). Fica logo antes de "domain":
    // o grafo alimenta o @domain-extractor (aresta db/contract é forte indício
    // de contexto compartilhado).
    phaseId: "dependency-graph",
    label: "Grafo de Dependências",
    agent: "@dependency-mapper",
    icon: "🕸",
    out: "assessment/repo-graph.md",
    scope: "workspace",
    appliesWhen: "multi-repo",
    why: "Mapeia quem depende de quem entre repositórios — libs internas, HTTP, eventos, banco compartilhado. Decide se dá para modernizar um repo sem arrastar os outros.",
    mandatoryForF1: false,
    checklist: [
      { id: "edges-verified",      label: "Arestas do grafo verificadas com a equipe",     mandatory: true  },
      { id: "cycles-confirmed",    label: "Ciclos entre repositórios confirmados",         mandatory: false },
      { id: "db-coupling-flagged", label: "Acoplamento por banco compartilhado sinalizado", mandatory: false },
    ],
  },
  {
    phaseId: "domain",
    label: "Domínio",
    agent: "@domain-extractor",
    icon: "🏗",
    out: "assessment/domain/context-map.md",
    scope: "workspace",
    why: "Único cross-repo: descobre os bounded contexts vendo TODOS os repos de uma vez. Um contexto pode atravessar dois repositórios — repo a repo isso seria invisível.",
    mandatoryForF1: false,
    checklist: [
      { id: "bcs-extracted",   label: "Bounded Contexts extraídos do código",  mandatory: true  },
      { id: "ubiquitous-lang", label: "Linguagem ubíqua documentada",          mandatory: false },
    ],
  },
  {
    // Passo 3b do @assessor: transforma o assessment em capacidade instalada
    // (a LLM Wiki). Sem contrato, o Discovery podia terminar sem a Wiki nascer
    // e o dashboard nunca acusaria a ausência.
    phaseId: "wiki-synthesis",
    label: "Síntese da LLM Wiki",
    agent: "@assessor",
    icon: "📚",
    // Exceção à convenção: o artefato NÃO vive em .github/artifacts/ — vive em
    // <host-dir>/agents/domain/ (um .agent.md por bounded context accepted).
    out: "<host-dir>/agents/domain/*.agent.md",
    scope: "workspace",
    why: "Gera 1 agente de domínio por bounded context aprovado, com a skill de coding-guidelines de cada repo onde atua. Sem isso, o Discovery termina em documentos e o conhecimento nunca vira agente versionado.",
    mandatoryForF1: false,
    checklist: [
      { id: "agents-generated",  label: "Agentes de domínio gerados (1 por contexto accepted)", mandatory: true  },
      { id: "registry-updated",  label: "registry.yaml atualizado",                              mandatory: false },
    ],
  },
  {
    phaseId: "coding-archaeology",
    label: "Padrões de Código",
    agent: "@coding-archaeologist",
    icon: "🔬",
    out: "assessment/coding-guidelines/project-coding-guide.md",
    scope: "repo",
    why: "Extrai como ESTE time escreve código (não como deveria). Gera a skill coding-guidelines do repo, que o executor carrega ao atuar nele.",
    mandatoryForF1: true,
    checklist: [
      { id: "naming",           label: "Naming conventions extraídos",          mandatory: true  },
      { id: "module-structure", label: "Estrutura de módulos documentada",      mandatory: true  },
      { id: "error-handling",   label: "Error handling pattern correto",        mandatory: true  },
      { id: "test-patterns",    label: "Padrões de teste documentados",         mandatory: true  },
      { id: "logging",          label: "Logging/observabilidade extraídos",     mandatory: false },
      { id: "anti-patterns",    label: "Anti-patterns do projeto identificados", mandatory: false },
    ],
  },
  {
    phaseId: "design",
    label: "Design System",
    agent: "@design-archaeologist",
    icon: "🎨",
    out: "assessment/design/design-system.md",
    scope: "repo",
    appliesWhen: "frontend",
    why: "Extrai o padrão visual real (tokens, componentes) e o débito de design — 5 azuis, 3 botões. Gera a skill design-system do repo, que o executor carrega para não inventar UI que destoa do produto.",
    mandatoryForF1: false,
    checklist: [
      { id: "tokens-extracted",       label: "Design tokens extraídos (cor, tipografia, espaçamento)", mandatory: true  },
      { id: "components-cataloged",   label: "Catálogo de componentes com variantes duplicadas",       mandatory: true  },
      { id: "design-debt-quantified", label: "Débito de design quantificado (N azuis, N botões)",       mandatory: false },
    ],
  },
  {
    phaseId: "quality",
    label: "Qualidade",
    agent: "@quality-auditor",
    icon: "📊",
    out: "assessment/quality/quality-report.md",
    scope: "repo",
    why: "Mede cobertura e hotspots (complexidade × churn). Hotspot é onde o bug mora — e só o histórico revela.",
    mandatoryForF1: false,
    checklist: [
      { id: "coverage-measured",    label: "Coverage % medida",                       mandatory: true  },
      { id: "hotspots-identified",  label: "Hotspots de complexidade identificados",  mandatory: false },
    ],
  },
  {
    phaseId: "debt",
    label: "Débito Técnico",
    agent: "@debt-analyst",
    icon: "💸",
    out: "assessment/debt/tech-debt.md",
    scope: "repo",
    why: "Consolida a dívida por juros (custo recorrente), não contra um padrão ideal. É o insumo que justifica qualquer modernização.",
    mandatoryForF1: true,
    checklist: [
      { id: "quick-wins-listed",     label: "Quick wins identificados (≥ 5 itens)",    mandatory: true  },
      { id: "prioritized-by-impact", label: "Priorizado por impacto × esforço",        mandatory: true  },
      { id: "critical-flagged",      label: "Itens críticos para produção sinalizados", mandatory: false },
    ],
  },
  {
    phaseId: "business-context",
    label: "Business Context",
    agent: "@business-archeologist",
    icon: "📖",
    out: "assessment/business/business-context.md",
    scope: "workspace",
    why: "Levanta o negócio por trás do legado: jobs-to-be-done, personas, value stream. O código não conta isso.",
    mandatoryForF1: true,
    checklist: [
      { id: "jtbd-mapped",         label: "Jobs-to-be-done mapeados",                mandatory: true  },
      { id: "personas-validated",  label: "Personas validadas com a equipe",         mandatory: true  },
      { id: "value-stream-clear",  label: "Value stream principal documentado",      mandatory: false },
    ],
  },
  {
    phaseId: "interview",
    label: "Stakeholder Q&A",
    agent: "@business-archeologist",
    icon: "🎤",
    out: "assessment/business/stakeholder-interview.md",
    scope: "workspace",
    why: "Registra o que só os stakeholders sabem — a regra que virou if sem comentário.",
    mandatoryForF1: false,
    checklist: [
      { id: "answers-recorded",   label: "Respostas dos stakeholders registradas",  mandatory: true  },
      { id: "pains-prioritized",  label: "Dores priorizadas por frequência",        mandatory: false },
    ],
  },
  {
    phaseId: "baseline",
    label: "Baseline Metrics",
    agent: "@assessor",
    icon: "📌",
    out: "assessment/business/baseline-metrics.json",
    scope: "workspace",
    why: "Congela as métricas de partida. Sem baseline, nenhuma melhoria futura é demonstrável.",
    mandatoryForF1: true,
    checklist: [
      { id: "baseline-json-generated", label: "baseline-metrics.json gerado",          mandatory: true  },
      { id: "score-calculated",        label: "Score DORA / maturidade calculado",     mandatory: true  },
      { id: "report-consolidated",     label: "report.md consolidado pelo @assessor",  mandatory: false },
    ],
  },
];

// ── Skill Linking phase (pós-assessment, pré-gate F1) ────────────────────

// Stack Config: confirma as skills de arquitetura por stack e grava o config da marca
// Note: coding-guidelines is now handled by @coding-archaeologist (project-specific).
// This phase configures only arch patterns and stack identity.
export const SKILL_LINKING_CONTRACT: FoundationPhaseContract = {
  phaseId: "skill-linking",
  label: "Stack Config",
  agent: "@assessor",
  icon: "🔗",
  why: "Confirma com você as skills derivadas da arquitetura descoberta. É o gate que impede o kit de impor um padrão que o repositório não tem.",
  out: "assessment/stack-skills.md",
  // Consolida as stacks confirmadas. Multi-repo: a stack deixa de ser uma só do
  // projeto e passa a ser um campo por repo em `repos.yaml` — esta fase confirma
  // o conjunto, mas a verdade por repo vem do @tech-mapper.
  scope: "workspace",
  mandatoryForF1: true,
  checklist: [
    { id: "backend-skills-confirmed",  label: "Padrões arquiteturais de backend confirmados",   mandatory: true  },
    { id: "frontend-skills-confirmed", label: "Padrões arquiteturais de frontend confirmados",  mandatory: false },
    { id: "config-written",            label: `${BRAND.files.config} atualizado com stacks`,        mandatory: true  },
    { id: "coding-guidelines-generated", label: "project-coding-guidelines SKILL.md gerado pelo @coding-archaeologist", mandatory: true },
  ],
};

// ── Skill catalog per detected stack ─────────────────────────────────────

export interface StackSkillSet {
  label: string;
  skills: string[];
}

// coding-guidelines removed — replaced by project-specific skill generated by @coding-archaeologist
export const BACKEND_SKILL_MAP: Record<string, StackSkillSet> = {
  "python":       { label: "Python",           skills: ["arch-hexagonal", "arch-ddd-tactical"] },
  "fastapi":      { label: "FastAPI",           skills: ["arch-hexagonal", "arch-ddd-tactical"] },
  "java":         { label: "Java Spring",       skills: ["arch-hexagonal", "arch-ddd-tactical", "arch-layered"] },
  "spring":       { label: "Spring Boot",       skills: ["arch-hexagonal", "arch-ddd-tactical"] },
  "dotnet":       { label: ".NET Core",         skills: ["arch-hexagonal", "arch-layered"] },
  "csharp":       { label: "C#",               skills: ["arch-hexagonal", "arch-layered"] },
  "node":         { label: "Node.js",           skills: ["arch-layered", "arch-feature-based"] },
  "express":      { label: "Express",           skills: ["arch-layered"] },
  "nestjs":       { label: "NestJS",            skills: ["arch-hexagonal", "arch-ddd-tactical"] },
  "go":           { label: "Go",                skills: ["arch-layered"] },
};

export const FRONTEND_SKILL_MAP: Record<string, StackSkillSet> = {
  "react":        { label: "React",             skills: ["arch-clean-frontend", "arch-feature-based"] },
  "next":         { label: "Next.js",           skills: ["arch-clean-frontend", "arch-feature-based"] },
  "vue":          { label: "Vue",               skills: ["arch-clean-frontend", "arch-mvvm"] },
  "angular":      { label: "Angular",           skills: ["arch-clean-frontend", "arch-mvvm"] },
  "flutter":      { label: "Flutter",           skills: ["arch-clean-frontend", "arch-mvvm"] },
  "swift":        { label: "iOS Swift",         skills: ["arch-clean-frontend", "arch-mvvm"] },
  "kotlin":       { label: "Android Kotlin",    skills: ["arch-clean-frontend", "arch-mvvm"] },
  "svelte":       { label: "Svelte",            skills: ["arch-clean-frontend", "arch-feature-based"] },
};

/**
 * Detecta stacks a partir do conteúdo do tech-radar.md.
 * Retorna arrays de { key, label, skills } ordenados por confiança.
 */
export function detectStacksFromTechRadar(content: string): {
  backend: Array<{ key: string; label: string; skills: string[] }>;
  frontend: Array<{ key: string; label: string; skills: string[] }>;
} {
  const lower = content.toLowerCase();

  const matchLayer = (map: Record<string, StackSkillSet>) =>
    Object.entries(map)
      .filter(([key]) => lower.includes(key))
      .map(([key, val]) => ({ key, label: val.label, skills: val.skills }));

  return {
    backend:  matchLayer(BACKEND_SKILL_MAP),
    frontend: matchLayer(FRONTEND_SKILL_MAP),
  };
}
