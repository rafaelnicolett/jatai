/**
 * colmeia.ts — `deriveColmeia`, o que o mapa da colmeia mostra (F5.2,
 * contrato agent-activity §5; ADR-0020). Puro e seguro para o webview: o
 * renderer isométrico (F5.3) só desenha o `ColmeiaVM`, e toda regra fica
 * aqui, coberta por `tests/features/mapa-da-colmeia.feature`.
 *
 * | `ColmeiaVM` | Vem de |
 * |---|---|
 * | `islands` | o fluxo do tipo de iniciativa (ADR-0001): 4 streams na modernização, as ondas no hotfix, Upstream/Downstream/Operação no greenfield |
 * | `bridges` | os gates: D1 (foundation-state), D2 e D3 (initiatives); G1 e G2 no greenfield (delivery-state) |
 * | `bees` | os eventos pareados (a mesma regra do `deriveActivity`, com tarefa e agente na chave) + tarefas em andamento, bloqueadas ou com falha no estado (ADR-0022) |
 * | `guards` | aprovação pendente (`agent-done` de tarefa que exige aprovação, ou tarefa concluída sem aprovação humana) + `decision-requested` sem `decision-made` |
 * | `pots` | `artifact-written` (fora os arquivos de estado) + entregas registradas no estado |
 * | `feed` | eventos recentes da iniciativa ativa, sem os ilegíveis e sem a duplicata do observador |
 *
 * Regras que o mapa nunca quebra (example-mapping.md):
 * - R2: o estado gravado manda. Tarefa fechada no estado derruba a abelha do
 *   evento; tarefa em andamento no estado vira abelha mesmo sem evento (o
 *   Copilot não tem hook);
 * - R8: só metadados. Nada de `metadata` sai daqui além do `reason`, e todo
 *   texto é cortado em 140 caracteres;
 * - evento de tipo desconhecido ou de outra iniciativa não entra.
 */
import {
  RUN_EVENT_MESSAGE_MAX,
  describeEvent,
  isKnownEventType,
  type RunEvent,
} from "../contracts/run-events-contract.pure";
import {
  HOTFIX_WAVE_TEMPLATE,
  activeInitiative,
  parseWaveContent,
  parseWaveLabel,
  type Initiative,
  type InitiativesState,
  type WaveItemStatusEntry,
  type WaveStatusEntry,
} from "../contracts/initiatives-contract.pure";
import type { FoundationState } from "../contracts/foundation-state-contract.pure";
import type { DeliveryState } from "../contracts/delivery-state-contract.pure";
import { isClosedStatus } from "../contracts/work-status.pure";
import { DELIVERY_PHASES, canonicalDeliveryPhaseId, deliveryPhase } from "../methodology/phase-catalog.pure";
import { FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT } from "../methodology/foundation-contracts";
import { BRAND } from "../brand/brand.pure";

// ── Tipos ───────────────────────────────────────────────────────────────────

export type InitiativeFlowKind = "streams" | "greenfield" | "waves";

/** Uma etapa do fluxo da iniciativa: vira uma ilha. `agents` é o elenco do stream. */
export interface FlowIsland {
  id: string;
  label: string;
  agents: string[];
}

export interface FlowBridge {
  gate: string;
  from: string;
  to: string;
}

/** O fluxo da iniciativa (ADR-0001): as ilhas, na ordem, e os gates entre elas. */
export interface InitiativeFlow {
  kind: InitiativeFlowKind;
  islands: FlowIsland[];
  bridges: FlowBridge[];
}

export type IslandState = "done" | "current" | "sleeping";
export type IslandAgentStatus = "working" | "blocked" | "queued" | "sleeping" | "done";

export interface ColmeiaIsland {
  id: string;
  label: string;
  state: IslandState;
  /** Na ilha atual: a onda ou o épico em curso (ex.: "Epic 0 · Fundação"). */
  focus?: string;
  /** Na ilha adormecida: o gate depois do qual ela acorda. */
  wakesAfterGate?: string;
  agents: Array<{ agentId: string; status: IslandAgentStatus }>;
}

export interface ColmeiaBridge {
  gate: string;
  from: string;
  to: string;
  state: "approved" | "unbuilt";
}

export interface ColmeiaBee {
  /** `null` quando só o estado diz que alguém trabalha (tarefa gravada sem agente). */
  agentId: string | null;
  islandId: string;
  state: "working" | "blocked";
  taskId?: string;
  phaseId?: string;
  /** Motivo do bloqueio ou da falha (ADR-0022): `falhou: <motivo>` na falha. */
  reason?: string;
  since?: string;
  source: "event" | "state";
}

export interface ColmeiaGuard {
  islandId: string;
  kind: "approval" | "decision";
  reason: string;
  taskId?: string;
  since?: string;
}

export interface ColmeiaPot {
  islandId: string;
  /** Caminho relativo à raiz do workspace: a evidência. Nunca conteúdo. */
  artifactPath: string;
  agentId?: string;
  taskId?: string;
  source: "event" | "state";
}

export interface ColmeiaFeedItem {
  timestamp: string;
  eventType: string;
  text: string;
  islandId?: string;
  agentId?: string;
  /** A tarefa do evento, quando ele a traz: o mapa escreve "@migration-agent começou · epic-0/task-0.2" (F5.3, aditivo). */
  taskId?: string;
  artifactPath?: string;
  by?: string;
}

export interface ColmeiaVM {
  initiativeId: string | null;
  flow: InitiativeFlowKind | null;
  /** Sem iniciativa ativa: o que falta e como resolver. */
  empty?: { reason: string; hint: string };
  islands: ColmeiaIsland[];
  bridges: ColmeiaBridge[];
  bees: ColmeiaBee[];
  guards: ColmeiaGuard[];
  pots: ColmeiaPot[];
  feed: ColmeiaFeedItem[];
}

/** O que o mapa lê do snapshot do Cockpit (o `CockpitSnapshot` satisfaz esta forma). */
export interface ColmeiaSnapshot {
  initiatives: InitiativesState | null;
  foundationState: FoundationState | null;
  deliveryState: DeliveryState | null;
}

export interface DeriveColmeiaOptions {
  /** Itens da atividade recente. Default 8, o mesmo de `deriveActivity`. */
  recentLimit?: number;
}

// ── Fluxos (ADR-0001) ───────────────────────────────────────────────────────

const unique = (xs: string[]): string[] => [...new Set(xs)];

const DISCOVERY_AGENTS = unique(["@assessor", ...FOUNDATION_CONTRACTS.map((c) => c.agent), SKILL_LINKING_CONTRACT.agent]);
const PLANNING_AGENTS = ["@modernization-planner", "@risk-prioritizer", "@adr-recorder"];
const EXECUTION_AGENTS = ["@test-backfill-agent", "@refactor-agent", "@migration-agent", "@feature-adder", "@reviewer"];
const OPERATION_AGENTS = ["@devops", "@observability", "@incident", "@sustain"];

/** Os 4 streams do Brownfield, ligados por D1, D2 e D3. */
const STREAMS_FLOW: InitiativeFlow = {
  kind: "streams",
  islands: [
    { id: "discovery", label: "Descoberta", agents: DISCOVERY_AGENTS },
    { id: "planning", label: "Planejamento", agents: PLANNING_AGENTS },
    { id: "execution", label: "Execução", agents: EXECUTION_AGENTS },
    { id: "operation", label: "Operação", agents: OPERATION_AGENTS },
  ],
  bridges: [
    { gate: "D1", from: "discovery", to: "planning" },
    { gate: "D2", from: "planning", to: "execution" },
    { gate: "D3", from: "execution", to: "operation" },
  ],
};

const agentsOfStream = (stream: string): string[] => unique(DELIVERY_PHASES.filter((p) => p.stream === stream).map((p) => p.agent));

/** As 16 fases do greenfield, por stream do catálogo, ligadas por G1 e G2. */
const GREENFIELD_FLOW: InitiativeFlow = {
  kind: "greenfield",
  islands: [
    { id: "upstream", label: "Upstream", agents: agentsOfStream("upstream") },
    { id: "downstream", label: "Downstream", agents: agentsOfStream("downstream") },
    { id: "operation", label: "Operação", agents: agentsOfStream("operation") },
  ],
  bridges: [
    { gate: "G1", from: "upstream", to: "downstream" },
    { gate: "G2", from: "downstream", to: "operation" },
  ],
};

/** `wave-1: Diagnóstico — causa raiz...` → `{ id: "wave-1", title: "Diagnóstico" }`. */
function waveStep(raw: string, position: number, prefix: "wave" | "epic"): { id: string; title: string; index: number } {
  const { index, label } = parseWaveLabel(raw);
  const title = parseWaveContent(label.split(" — ")[0]!.trim()).title;
  const n = index ?? position + 1;
  return { id: `${prefix}-${n}`, title, index: n };
}

/** O fluxo do tipo de iniciativa: o hotfix anda pelas ondas; o greenfield pelas 16 fases; o resto pelos 4 streams. */
export function initiativeFlow(initiative: Initiative | undefined): InitiativeFlow {
  if (initiative?.type === "hotfix") {
    const prefix = initiative.epics?.length ? "epic" : "wave";
    const raws = initiative.epics?.length ? initiative.epics : initiative.waves?.length ? initiative.waves : [...HOTFIX_WAVE_TEMPLATE];
    return { kind: "waves", islands: raws.map((raw, i) => waveStep(raw, i, prefix)).map((w) => ({ id: w.id, label: w.title, agents: [] })), bridges: [] };
  }
  if (initiative?.mode === "greenfield") return GREENFIELD_FLOW;
  return STREAMS_FLOW;
}

// ── Estado gravado ──────────────────────────────────────────────────────────

interface StateTask {
  key: string;
  waveKey: string;
  entry: WaveItemStatusEntry | WaveStatusEntry;
}

/** As tarefas da iniciativa: itens de onda/épico, ou a onda inteira quando ela não tem itens. */
function stateTasks(initiative: Initiative): StateTask[] {
  const tasks: StateTask[] = [];
  for (const group of [initiative.wave_status, initiative.epic_status]) {
    for (const [waveKey, wave] of Object.entries(group ?? {})) {
      const items = Object.entries(wave.items ?? {});
      if (items.length === 0) tasks.push({ key: waveKey, waveKey, entry: wave });
      for (const [item, entry] of items) tasks.push({ key: `${waveKey}/${item}`, waveKey, entry });
    }
  }
  return tasks;
}

function waveClosed(wave: WaveStatusEntry | undefined): boolean {
  if (!wave) return false;
  const items = Object.values(wave.items ?? {});
  return items.length > 0 ? items.every((i) => isClosedStatus(i.status)) : isClosedStatus(wave.status);
}

function d1Approved(foundation: FoundationState | null, initiative: Initiative): boolean {
  const repos = Object.entries(foundation?.repos ?? {}).filter(([id]) => !initiative.scope?.length || initiative.scope.includes(id));
  return repos.length > 0 && repos.every(([, repo]) => repo.gate_d1.status === "approved");
}

function phasesClosed(delivery: DeliveryState | null, stream: string): boolean {
  if (!delivery) return false;
  return DELIVERY_PHASES.filter((p) => p.stream === stream).every((p) => isClosedStatus(delivery.phases[p.id]?.status ?? "pending"));
}

function bridgeApproved(gate: string, snapshot: ColmeiaSnapshot, initiative: Initiative): boolean {
  switch (gate) {
    case "D1": return d1Approved(snapshot.foundationState, initiative);
    case "D2": return initiative.gate_d2?.status === "approved";
    case "D3": return initiative.gate_d3?.status === "approved";
    case "G1": return phasesClosed(snapshot.deliveryState, "upstream");
    case "G2": return phasesClosed(snapshot.deliveryState, "downstream");
    default: return false;
  }
}

/** O épico ou a onda em curso: o primeiro que ainda não fechou (`Epic 0 · Fundação`). */
function executionFocus(initiative: Initiative): string | undefined {
  const [raws, prefix, group, word] = initiative.epics?.length
    ? [initiative.epics, "epic", initiative.epic_status, "Epic"] as const
    : [initiative.waves ?? [], "wave", initiative.wave_status, "Onda"] as const;
  const open = raws.map((raw, i) => waveStep(raw, i, prefix)).find((w) => !waveClosed(group?.[w.id]));
  return open ? `${word} ${open.index} · ${open.title}` : undefined;
}

// ── Eventos: de qual ilha ───────────────────────────────────────────────────

const PLANNING_PHASES = new Set(["planning", "modernization-planner", "risk-prioritizer", "adr-recorder", "roadmap", "risk-matrix"]);
const EXECUTION_PHASES = new Set(["execution", "test-backfill", "refactor", "migration", "feature", "feature-add", "review", "reviewer"]);
const OPERATION_PHASES = new Set(["operation", "devops", "observability", "incident", "sustain", "release"]);
const DISCOVERY_PHASES = new Set(["discovery", "foundation", "assessor", ...FOUNDATION_CONTRACTS.map((c) => c.phaseId), SKILL_LINKING_CONTRACT.phaseId]);

/** `migration-agent` e `@migration-agent` são o mesmo agente. */
function agentOf(e: { agent_id?: string }): string | undefined {
  if (!e.agent_id) return undefined;
  return e.agent_id.startsWith("@") ? e.agent_id : `@${e.agent_id}`;
}

function streamOfPhase(phaseId: string): string | undefined {
  const gate = phaseId.match(/^gate-d([123])$/i);
  if (gate) return ["discovery", "planning", "execution"][Number(gate[1]) - 1];
  if (DISCOVERY_PHASES.has(phaseId)) return "discovery";
  if (PLANNING_PHASES.has(phaseId)) return "planning";
  if (EXECUTION_PHASES.has(phaseId)) return "execution";
  if (OPERATION_PHASES.has(phaseId)) return "operation";
  return undefined;
}

function streamOfPath(artifactPath: string): string | undefined {
  if (/^\.github\/artifacts\/assessment\//.test(artifactPath)) return "discovery";
  if (/^\.github\/artifacts\/planning\//.test(artifactPath) || /^docs\/adr\//.test(artifactPath)) return "planning";
  if (/^\.github\/artifacts\/execution\//.test(artifactPath)) return "execution";
  if (/^\.github\/artifacts\/(incidents|operations)\//.test(artifactPath)) return "operation";
  return undefined;
}

class IslandResolver {
  private readonly _ids: Set<string>;

  constructor(private readonly _flow: InitiativeFlow, private readonly _current: string | undefined) {
    this._ids = new Set(_flow.islands.map((i) => i.id));
  }

  ofTask(taskId: string): string | undefined {
    if (this._flow.kind === "waves") {
      const wave = taskId.split("/")[0]!;
      return this._ids.has(wave) ? wave : this._current;
    }
    return this._flow.kind === "streams" ? "execution" : "downstream";
  }

  ofEvent(e: RunEvent): string | undefined {
    if (e.task_id) return this.ofTask(e.task_id);
    const candidates: Array<string | undefined> = [];
    if (e.phase_id) {
      if (this._flow.kind === "greenfield") candidates.push(deliveryPhase(canonicalDeliveryPhaseId(e.phase_id))?.stream);
      else candidates.push(streamOfPhase(e.phase_id));
    }
    const agent = agentOf(e);
    if (agent) candidates.push(this._flow.islands.find((i) => i.agents.includes(agent))?.id);
    if (e.artifact_path) candidates.push(streamOfPath(e.artifact_path));
    return candidates.find((c) => c !== undefined && this._ids.has(c)) ?? this._current;
  }
}

// ── Pareamento dos eventos ──────────────────────────────────────────────────

/**
 * A chave que junta o início e o fim de um trabalho. O `deriveActivity` do
 * Cockpit junta por repo e fase; aqui a tarefa vem antes, e o agente entra
 * quando não há fase nem tarefa: os hooks do kit (SubagentStart/SubagentStop)
 * não trazem nenhuma das duas, e dois subagentes em paralelo não podem virar
 * uma abelha só.
 */
function pairKey(e: RunEvent): string {
  if (e.task_id) return `task:${e.task_id}`;
  if (e.phase_id) return `${e.repo_id ?? "-"}::${e.phase_id}`;
  const agent = agentOf(e);
  return agent ? `agent:${agent}` : `${e.repo_id ?? "-"}::-`;
}

interface Paired {
  running: RunEvent[];
  awaiting: RunEvent[];
  blocked: RunEvent[];
}

/** As mesmas transições do `deriveActivity`, com a chave de `pairKey`. */
function pairEvents(events: RunEvent[]): Paired {
  const started = new Map<string, RunEvent>();
  const awaiting = new Map<string, RunEvent>();
  const blocked = new Map<string, RunEvent>();
  for (const e of events) {
    const k = pairKey(e);
    switch (e.event_type) {
      case "agent-started":
        started.set(k, e);
        awaiting.delete(k);
        blocked.delete(k);
        break;
      case "agent-done":
        started.delete(k);
        awaiting.set(k, e);
        break;
      case "gate-approved":
        started.delete(k);
        awaiting.delete(k);
        blocked.delete(k);
        break;
      case "blocked":
        started.delete(k);
        blocked.set(k, e);
        break;
    }
  }
  return { running: [...started.values()], awaiting: [...awaiting.values()], blocked: [...blocked.values()] };
}

// ── Derivação ───────────────────────────────────────────────────────────────

/** Arquivos de estado: o evento de escrita deles é atividade recente, não entrega. */
const STATE_FILE = /(^|\/)(initiatives|repos|context-repos|repo-graph|foundation-state|delivery-state|sprint-backlog)\.yaml$/;

/** Janela em que o mesmo artefato visto pelo hook e pelo observador conta uma vez. */
const WATCHER_DUPLICATE_MS = 5_000;

const clip = (text: string): string => [...text].slice(0, RUN_EVENT_MESSAGE_MAX).join("");

function reasonOf(e: RunEvent): string | undefined {
  const reason = typeof e.metadata?.reason === "string" ? e.metadata.reason : undefined;
  const text = e.message ?? reason;
  return text ? clip(text) : undefined;
}

/** Evento do observador que repete um `artifact-written` de outra fonte para o mesmo caminho, perto no tempo. */
function isWatcherDuplicate(e: RunEvent, all: RunEvent[]): boolean {
  if (e.harness !== "watcher" || e.event_type !== "artifact-written" || !e.artifact_path) return false;
  const t = Date.parse(e.timestamp);
  return all.some(
    (o) => o !== e && o.event_type === "artifact-written" && o.harness !== "watcher" && o.artifact_path === e.artifact_path && Math.abs(Date.parse(o.timestamp) - t) <= WATCHER_DUPLICATE_MS
  );
}

const EMPTY_HINT = `Abra uma iniciativa com o @${BRAND.name}`;

/**
 * O mapa da iniciativa ativa. `flow` é o fluxo do tipo da iniciativa
 * (`initiativeFlow`); ausente, é calculado aqui.
 */
export function deriveColmeia(snapshot: ColmeiaSnapshot, events: RunEvent[], flow?: InitiativeFlow, options?: DeriveColmeiaOptions): ColmeiaVM {
  const initiative = activeInitiative(snapshot.initiatives);
  if (!initiative) {
    return { initiativeId: null, flow: null, empty: { reason: "Não há iniciativa ativa", hint: EMPTY_HINT }, islands: [], bridges: [], bees: [], guards: [], pots: [], feed: [] };
  }
  const theFlow = flow ?? initiativeFlow(initiative);

  // Ilhas e pontes: só o estado gravado (R2).
  const bridges: ColmeiaBridge[] = theFlow.bridges.map((b) => ({ ...b, state: bridgeApproved(b.gate, snapshot, initiative) ? "approved" : "unbuilt" }));
  const tasks = stateTasks(initiative);
  let currentIndex: number;
  if (theFlow.kind === "waves") {
    const group = initiative.epics?.length ? initiative.epic_status : initiative.wave_status;
    currentIndex = theFlow.islands.findIndex((i) => !waveClosed(group?.[i.id]));
    if (currentIndex === -1) currentIndex = theFlow.islands.length - 1;
  } else {
    const firstOpen = bridges.findIndex((b) => b.state !== "approved");
    currentIndex = firstOpen === -1 ? theFlow.islands.length - 1 : firstOpen;
  }
  const current = theFlow.islands[currentIndex]?.id;
  const islandOf = new IslandResolver(theFlow, current);

  // Eventos da iniciativa ativa (e os sem iniciativa), só os tipos conhecidos.
  const relevant = events.filter((e) => isKnownEventType(e.event_type) && (e.initiative_id === undefined || e.initiative_id === initiative.id));
  const activity = pairEvents(relevant);
  const lastByTask = new Map<string, RunEvent>();
  for (const e of relevant) if (e.task_id) lastByTask.set(e.task_id, e);
  const taskByKey = new Map(tasks.map((t) => [t.key, t]));
  const taskClosed = (taskId: string | undefined): boolean => !!taskId && isClosedStatus(taskByKey.get(taskId)?.entry.status ?? "");

  const bees: ColmeiaBee[] = [];
  const beeFor = (e: RunEvent, state: "working" | "blocked"): ColmeiaBee => ({
    agentId: agentOf(e) ?? null,
    islandId: islandOf.ofEvent(e) ?? "",
    state,
    ...(e.task_id ? { taskId: e.task_id } : {}),
    ...(e.phase_id ? { phaseId: e.phase_id } : {}),
    ...(state === "blocked" && reasonOf(e) ? { reason: reasonOf(e) } : {}),
    since: e.timestamp,
    source: "event",
  });
  for (const e of activity.running) if (!taskClosed(e.task_id)) bees.push(beeFor(e, "working"));
  for (const e of activity.blocked) if (!taskClosed(e.task_id)) bees.push(beeFor(e, "blocked"));

  // Tarefas do estado: em andamento sem evento (Copilot), bloqueadas e com falha (ADR-0022).
  for (const task of tasks) {
    const status = task.entry.status;
    if (status !== "in-progress" && status !== "blocked" && status !== "failed") continue;
    const last = lastByTask.get(task.key);
    if (status === "in-progress" && last?.event_type === "agent-done") continue;
    const existing = bees.find((b) => b.taskId === task.key);
    const reason = (task.entry as WaveItemStatusEntry).reason;
    if (existing) {
      if (status !== "in-progress") Object.assign(existing, { state: "blocked", reason: status === "failed" ? `falhou: ${reason ?? ""}`.trim() : reason ?? existing.reason });
      continue;
    }
    bees.push({
      agentId: last ? agentOf(last) ?? null : null,
      islandId: islandOf.ofTask(task.key) ?? "",
      state: status === "in-progress" ? "working" : "blocked",
      taskId: task.key,
      ...(status === "failed" ? { reason: clip(`falhou: ${reason ?? ""}`.trim()) } : reason && status === "blocked" ? { reason: clip(reason) } : {}),
      source: "state",
    });
  }

  // Guardas: aprovação pendente e decisão pedida (R4).
  const guards: ColmeiaGuard[] = [];
  const needsApproval = (taskId: string): boolean => {
    const entry = taskByKey.get(taskId)?.entry as WaveItemStatusEntry | undefined;
    return !!entry?.requires_approval && !entry.human_approved_at;
  };
  for (const e of activity.awaiting) {
    // Só espera aprovação o fim de uma tarefa que a exige ou de uma fase (o protocolo do Foundation).
    // O fim de um subagente avisado pelo hook, sem tarefa nem fase, só pousa a abelha.
    if (e.task_id ? !needsApproval(e.task_id) : !e.phase_id || phaseApproved(e, snapshot)) continue;
    guards.push({ islandId: islandOf.ofEvent(e) ?? "", kind: "approval", reason: `${e.task_id ?? agentOf(e) ?? e.phase_id ?? "entrega"} espera você`, ...(e.task_id ? { taskId: e.task_id } : {}), since: e.timestamp });
  }
  for (const task of tasks) {
    if (task.entry.status === "done" && needsApproval(task.key) && !guards.some((g) => g.taskId === task.key)) {
      guards.push({ islandId: islandOf.ofTask(task.key) ?? "", kind: "approval", reason: `${task.key} espera você`, taskId: task.key });
    }
  }
  const decisions = new Map<string, RunEvent>();
  for (const e of relevant) {
    const key = e.task_id ?? (typeof e.metadata?.task === "string" ? e.metadata.task : undefined) ?? e.run_id;
    if (e.event_type === "decision-requested") decisions.set(key, e);
    if (e.event_type === "decision-made") decisions.delete(key);
  }
  for (const e of decisions.values()) {
    guards.push({ islandId: islandOf.ofEvent(e) ?? "", kind: "decision", reason: reasonOf(e) ?? "decisão pedida", ...(e.task_id ? { taskId: e.task_id } : {}), since: e.timestamp });
  }

  // Potes: entregas por evento e registradas no estado, uma por caminho (R5).
  const pots: ColmeiaPot[] = [];
  const addPot = (pot: ColmeiaPot): void => {
    const same = pots.find((p) => p.artifactPath === pot.artifactPath);
    if (!same) pots.push(pot);
    else if (!same.agentId && pot.agentId) same.agentId = pot.agentId;
  };
  for (const e of relevant) {
    if (e.event_type !== "artifact-written" || !e.artifact_path || STATE_FILE.test(e.artifact_path)) continue;
    const agent = e.harness === "watcher" ? undefined : agentOf(e);
    addPot({ islandId: islandOf.ofEvent(e) ?? "", artifactPath: e.artifact_path, ...(agent ? { agentId: agent } : {}), ...(e.task_id ? { taskId: e.task_id } : {}), source: "event" });
  }
  if (theFlow.kind === "streams") for (const p of initiative.planning_artifacts ?? []) addPot({ islandId: "planning", artifactPath: p, source: "state" });
  for (const task of tasks) {
    if (task.entry.status !== "done") continue;
    for (const p of task.entry.artifacts ?? []) addPot({ islandId: islandOf.ofTask(task.key) ?? "", artifactPath: p, taskId: task.key, source: "state" });
  }

  // Atividade recente, do mais recente para o mais antigo (R8: texto cortado, só metadados).
  const feed = relevant
    .filter((e) => !isWatcherDuplicate(e, relevant))
    .slice()
    .reverse()
    .slice(0, options?.recentLimit ?? 8)
    .map((e): ColmeiaFeedItem => {
      const island = islandOf.ofEvent(e);
      const agent = agentOf(e);
      return {
        timestamp: e.timestamp,
        eventType: e.event_type,
        text: clip(describeEvent(e)),
        ...(island ? { islandId: island } : {}),
        ...(agent ? { agentId: agent } : {}),
        ...(e.task_id ? { taskId: e.task_id } : {}),
        ...(e.artifact_path ? { artifactPath: e.artifact_path } : {}),
        ...(e.by ? { by: e.by } : {}),
      };
    });

  // Ilhas, com o elenco e quem trabalha agora.
  const islands: ColmeiaIsland[] = theFlow.islands.map((island, i) => {
    const state: IslandState = i < currentIndex ? "done" : i === currentIndex ? "current" : "sleeping";
    const here = bees.filter((b) => b.islandId === island.id && b.agentId);
    const idle: IslandAgentStatus = state === "done" ? "done" : state === "current" ? "queued" : "sleeping";
    const roster = unique([...island.agents, ...here.map((b) => b.agentId!)]);
    const focus = state === "current" && island.id === "execution" ? executionFocus(initiative) : undefined;
    return {
      id: island.id,
      label: island.label,
      state,
      ...(focus ? { focus } : {}),
      ...(state === "sleeping" && i > 0 ? { wakesAfterGate: theFlow.bridges.find((b) => b.to === island.id)?.gate ?? theFlow.islands[i - 1]!.label } : {}),
      agents: roster.map((agentId) => {
        const bee = here.find((b) => b.agentId === agentId);
        return { agentId, status: bee ? bee.state : idle };
      }),
    };
  });

  return { initiativeId: initiative.id, flow: theFlow.kind, islands, bridges, bees, guards, pots, feed };
}

/** Evento de fase sem tarefa: a aprovação já está no estado (fase `done` no Foundation ou no delivery-state). */
function phaseApproved(e: RunEvent, snapshot: ColmeiaSnapshot): boolean {
  if (!e.phase_id) return false;
  const foundation = e.repo_id ? snapshot.foundationState?.repos[e.repo_id]?.phases[e.phase_id] : snapshot.foundationState?.phases[e.phase_id];
  if (foundation?.status === "done") return true;
  const delivery = snapshot.deliveryState?.phases[canonicalDeliveryPhaseId(e.phase_id)];
  return !!delivery && isClosedStatus(delivery.status);
}
