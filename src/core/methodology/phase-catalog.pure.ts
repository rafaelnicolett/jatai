/**
 * phase-catalog.pure.ts
 *
 * Catálogo ÚNICO das fases de Delivery (F3.1 da Missão Open Source; passo
 * PC1/CH2 de `arquitetura-e-refatoracao.md`). Antes, seis tabelas
 * independentes descreviam as mesmas fases e divergiam entre si (L4):
 *
 * - `PHASE_ORDER` + cabeçalho de `PHASE_CONTRACTS` (`phase-contracts.ts`);
 * - `PHASE_META` + `PHASE_ALIASES` (`chat/ConciergeParticipant.ts`);
 * - `PHASE_NEXT`/`PHASE_LABEL`/`PHASE_AGENT_NAME` (`views/actions/greenfieldPhaseActions.ts`);
 * - `AGENT_PATH_BY_PHASE` (`chat/PhaseAgentLoader.ts`);
 * - `PHASE_KEY_ALIASES` (`delivery-state-contract.pure.ts`);
 * - `PHASE_KEY_ALIASES` (`views/actions/yamlUpsert.ts`).
 *
 * Agora cada fato (id, aliases, stream, gate, ordem, agente, rótulo, ícone,
 * arquivo do agente, artefatos esperados) mora numa linha só de
 * `DELIVERY_PHASES`, e as antigas tabelas são consultas sobre ele.
 *
 * 100% puro — zero `fs`/`path`/`vscode` — seguro para o bundle do CLI, do
 * MCP e do webview, como todo `*.pure.ts` de `src/data/`.
 */

/** Onde a fase mora no lifecycle de Delivery (Upstream → Gate G1 → Downstream → Gate G2 → Operation). */
export type PhaseStream = "upstream" | "downstream" | "operation";

/** Gate humano que fecha um stream logo depois de uma fase. */
export type DeliveryGateId = "G1" | "G2";

export interface DeliveryPhaseDefinition {
  /** Id canônico: chave de `PHASE_CONTRACTS` e de `phases:` no `delivery-state.yaml`. */
  readonly id: string;
  /**
   * Outras chaves com que a fase já foi gravada no `delivery-state.yaml` — em
   * geral o `id:` do frontmatter do agente (`sprint-planner`), diferente do id
   * canônico (`sprint-plan`). Writers e readers resolvem todas para `id`.
   */
  readonly aliases: readonly string[];
  readonly stream: PhaseStream;
  /** Rótulo humano (o mesmo que o Cockpit Next mostra via `PlanItem.label`). */
  readonly label: string;
  /** Agente responsável, ex. `"@business"`. */
  readonly agent: string;
  /** Emoji da fase. */
  readonly icon: string;
  /** Arquivo do agente, relativo a `<host-dir>/agents/` (`.github/agents/` no Copilot, `.claude/agents/` no Claude Code). */
  readonly agentFile: string;
  /** Artefatos que a fase deve deixar (o chat ancora os que existem). Pasta termina em `/`. */
  readonly artifactsExpected: readonly string[];
  /** Gate humano que fecha o stream logo depois desta fase. */
  readonly gateAfter?: DeliveryGateId;
}

/** As 16 fases de Delivery, na ordem canônica. A ordem do array É a ordem do pipeline. */
export const DELIVERY_PHASES: readonly DeliveryPhaseDefinition[] = [
  // ── Upstream ──
  { id: "business",      aliases: [],                 stream: "upstream",   label: "Business Brief", agent: "@business",       icon: "💡", agentFile: "upstream/business.agent.md",           artifactsExpected: ["business-brief.md"] },
  { id: "product",       aliases: [],                 stream: "upstream",   label: "PRD",            agent: "@product",        icon: "📋", agentFile: "upstream/product.agent.md",            artifactsExpected: ["prd.md", "feature-list.md"] },
  { id: "ux-design",     aliases: ["ux-designer"],    stream: "upstream",   label: "UX Design",      agent: "@ux-designer",    icon: "🎨", agentFile: "upstream/ux-designer.agent.md",        artifactsExpected: ["docs/design/"] },
  { id: "domain",        aliases: ["domain-modeler"], stream: "upstream",   label: "Domínio",        agent: "@domain-modeler", icon: "🗺", agentFile: "upstream/domain-modeler.agent.md",     artifactsExpected: ["docs/domain/"] },
  { id: "bdd",           aliases: [],                 stream: "upstream",   label: "BDD",            agent: "@bdd",            icon: "🔮", agentFile: "upstream/bdd.agent.md",                artifactsExpected: ["features/"] },
  { id: "architecture",  aliases: [],                 stream: "upstream",   label: "Arquitetura",    agent: "@architecture",   icon: "🏗", agentFile: "upstream/architecture.agent.md",       artifactsExpected: ["api/openapi.yaml", "docs/adr/"] },
  { id: "sprint-plan",   aliases: ["sprint-planner"], stream: "upstream",   label: "Sprint Plan",    agent: "@sprint-planner", icon: "📅", agentFile: "upstream/sprint-planner.agent.md",     artifactsExpected: ["sprint-backlog.yaml"], gateAfter: "G1" },
  // ── Downstream ──
  { id: "sprint-run",    aliases: ["sprint-runner"],  stream: "downstream", label: "Sprint Runner",  agent: "@sprint-runner",  icon: "▶", agentFile: "downstream/sprint-runner.agent.md",    artifactsExpected: [] },
  // backend/frontend: o arquivo é o da stack padrão; a stack real pode sobrescrever.
  { id: "backend",       aliases: [],                 stream: "downstream", label: "Backend",        agent: "@backend",        icon: "⚙", agentFile: "downstream/backend-python-api.agent.md", artifactsExpected: ["code/services/"] },
  { id: "frontend",      aliases: [],                 stream: "downstream", label: "Frontend",       agent: "@frontend",       icon: "⬡", agentFile: "downstream/frontend-react.agent.md",   artifactsExpected: ["code/apps/"] },
  // `review`: chave que o pipeline legado do chat/handoff gravava (L4, corrigido na F3.1).
  { id: "reviewer",      aliases: ["review"],         stream: "downstream", label: "Review",         agent: "@reviewer",       icon: "🔍", agentFile: "downstream/reviewer.agent.md",         artifactsExpected: [], gateAfter: "G2" },
  // ── Operation ──
  { id: "devops",        aliases: [],                 stream: "operation",  label: "DevOps",         agent: "@devops",         icon: "🐳", agentFile: "operation/devops.agent.md",            artifactsExpected: ["pipelines/", "infrastructure/"] },
  { id: "release",       aliases: [],                 stream: "operation",  label: "Release",        agent: "@release",        icon: "🏷", agentFile: "operation/release.agent.md",           artifactsExpected: [] },
  { id: "observability", aliases: [],                 stream: "operation",  label: "Observability",  agent: "@observability",  icon: "📊", agentFile: "operation/observability.agent.md",     artifactsExpected: [] },
  { id: "incident",      aliases: [],                 stream: "operation",  label: "Incidente",      agent: "@incident",       icon: "🚨", agentFile: "operation/incident.agent.md",          artifactsExpected: [] },
  { id: "sustain",       aliases: [],                 stream: "operation",  label: "Sustentação",    agent: "@sustain",        icon: "🔧", agentFile: "operation/sustain.agent.md",           artifactsExpected: [] },
];

const BY_ID = new Map<string, DeliveryPhaseDefinition>(DELIVERY_PHASES.map((p) => [p.id, p]));

const ALIAS_TO_CANONICAL = new Map<string, string>(DELIVERY_PHASES.flatMap((p) => p.aliases.map((a): [string, string] => [a, p.id])));

// ── Consultas canônicas ──────────────────────────────────────────────────────

/** Os ids canônicos, na ordem do pipeline. */
export function deliveryPhaseIds(): string[] {
  return DELIVERY_PHASES.map((p) => p.id);
}

/** A fase de id canônico `id` (sem resolver alias), ou `undefined`. */
export function deliveryPhase(id: string): DeliveryPhaseDefinition | undefined {
  return BY_ID.get(id);
}

/** Resolve um alias para o id canônico; qualquer outro id volta como veio. */
export function canonicalDeliveryPhaseId(id: string): string {
  return ALIAS_TO_CANONICAL.get(id) ?? id;
}

/** Toda chave com que a fase de `id` (canônico ou alias) pode estar gravada — a canônica primeiro. */
export function deliveryPhaseKeysOf(id: string): string[] {
  const canonical = canonicalDeliveryPhaseId(id);
  return [canonical, ...(BY_ID.get(canonical)?.aliases ?? [])];
}

/** Mapa `alias → id canônico`, na forma que `parsePhaseMapWith` espera. */
export function deliveryPhaseKeyAliases(): Record<string, string> {
  return Object.fromEntries(ALIAS_TO_CANONICAL);
}

/** `id canônico → [id canônico, ...aliases]`, só para as fases que têm alias. */
export function deliveryPhaseKeyVariants(): Record<string, string[]> {
  return Object.fromEntries(DELIVERY_PHASES.filter((p) => p.aliases.length > 0).map((p) => [p.id, [p.id, ...p.aliases]]));
}

/** Próxima fase do pipeline depois de `id` (canônico ou alias); `null` depois da última ou para id desconhecido. */
export function nextDeliveryPhaseId(id: string): string | null {
  const index = DELIVERY_PHASES.findIndex((p) => p.id === canonicalDeliveryPhaseId(id));
  if (index === -1) return null;
  return DELIVERY_PHASES[index + 1]?.id ?? null;
}

/** Path do arquivo do agente da fase `id` (canônico ou alias) no layout Copilot (`.github/agents/...`), ou `undefined`. */
export function deliveryAgentPath(id: string): string | undefined {
  const phase = BY_ID.get(canonicalDeliveryPhaseId(id));
  return phase ? `.github/agents/${phase.agentFile}` : undefined;
}

/** Gate humano que fecha o stream logo depois da fase `id`, se houver. */
export function deliveryGateAfter(id: string): DeliveryGateId | undefined {
  return BY_ID.get(id)?.gateAfter;
}

// ── Visão do chat ────────────────────────────────────────────────────────────
//
// As projeções legadas que o refactor da F3.1 preservou (L4: `review` no lugar
// de `reviewer`, pipeline parando em `incident`, rótulos/ícones/agentes
// próprios do chat e do handoff) foram eliminadas: chat, handoff, arquivo do
// agente e Cockpit leem os mesmos campos de `DELIVERY_PHASES`.

/** O que o chat (`@helyx`) sabe de uma fase — a antiga `PHASE_META` do `ConciergeParticipant`. */
export interface ChatPhaseMeta {
  label: string;
  icon: string;
  stream: string;
  agent: string;
  artifactsExpected: string[];
  next: string | null;
}

/** Fase `id` (canônico ou alias) vista pelo chat, ou `undefined`. */
export function chatPhaseMeta(id: string): ChatPhaseMeta | undefined {
  const phase = BY_ID.get(canonicalDeliveryPhaseId(id));
  if (!phase) return undefined;
  return {
    label: phase.label,
    icon: phase.icon,
    stream: phase.stream,
    agent: phase.agent,
    artifactsExpected: [...phase.artifactsExpected],
    next: nextDeliveryPhaseId(phase.id),
  };
}
