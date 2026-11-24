/**
 * map-inventory.pure.ts — o inventário de uma ilha: todos os processos que
 * acontecem ali (não só o gate) e o elenco que os conduz, com persona.
 *
 * O `deriveColmeia` responde "onde a iniciativa está"; este módulo responde
 * "o que está sendo feito, por quem, e o que já saiu". É aditivo: a cena e o
 * painel continuam funcionando sem ele, e nada aqui inventa estado — todo
 * status sai do `foundation-state`, do `delivery-state`, de `initiatives.yaml`
 * ou dos eventos, com o mesmo vocabulário do Cockpit.
 *
 * Para a descoberta do brownfield, a fonte é o `FoundationPlan` (o mesmo que o
 * dashboard usa): fases por repositório, fases cross-repo, D1 de cada repo e o
 * D1 global. Assim o mapa cobre a descoberta antes de existir uma iniciativa.
 */
import type { AgentCatalogEntry } from "../contracts/agent-directory.pure";
import { agentRoleIndex, normalizeAgentId } from "../contracts/agent-directory.pure";
import type { RunEvent } from "../contracts/run-events-contract.pure";
import { deriveActivity } from "../contracts/run-events-contract.pure";
import type { FoundationState } from "../contracts/foundation-state-contract.pure";
import { phasesForRepo } from "../contracts/foundation-state-contract.pure";
import type { ReposInventory } from "../contracts/repos-contract.pure";
import type { Initiative, WaveItemStatusEntry } from "../contracts/initiatives-contract.pure";
import { activeInitiative, parseWaveContent, parseWaveLabel } from "../contracts/initiatives-contract.pure";
import { isClosedStatus } from "../contracts/work-status.pure";
import {
  FOUNDATION_CONTRACTS,
  SKILL_LINKING_CONTRACT,
  resolveArtifactPath,
  type FoundationPhaseContract,
} from "../methodology/foundation-contracts";
import { DELIVERY_PHASES, canonicalDeliveryPhaseId } from "../methodology/phase-catalog.pure";
import type { FoundationPlan, PlanItem } from "./foundation-plan";
import { buildFoundationPlan } from "./foundation-plan";
import type { ColmeiaIsland, ColmeiaSnapshot, ColmeiaVM, IslandAgentStatus } from "./colmeia";
import { personaOf, type CastAccent } from "./map-cast.pure";

// ── Tipos ───────────────────────────────────────────────────────────────────

export type MapProcessStatus = "done" | "working" | "review" | "open" | "blocked" | "failed";

/** Um processo do fluxo: uma fase do Foundation, um item de épico, uma fase de Delivery. */
export interface MapProcess {
  /** Único na ilha: `repo/fase`, `epic-0/task-0.1` ou `delivery/business`. */
  id: string;
  islandId: string;
  groupId: string;
  groupLabel: string;
  label: string;
  icon: string;
  agent?: string;
  status: MapProcessStatus;
  scope?: "repo" | "workspace";
  repoId?: string;
  why?: string;
  artifact?: string;
  /** Gate que este processo ajuda a fechar (D1, D2, D3, G1, G2). */
  gate?: string;
  blockedBy?: string;
  /** Checklist humano da fase, quando o contrato tem um. */
  progress?: { done: number; total: number };
  /** Ordem estável dentro do grupo. */
  order: number;
}

/** Um personagem do elenco: o agente com persona, status e o que ele carrega. */
export interface MapCharacter {
  agentId: string;
  islandId: string;
  name: string;
  archetype: string;
  trait: string;
  accent: CastAccent;
  role?: string;
  status: IslandAgentStatus;
  processId?: string;
  taskId?: string;
  step?: string;
  reason?: string;
  /** Processos desta ilha em que o personagem é o responsável. */
  handles: string[];
  /** Entregas da ilha atribuídas a ele. */
  deliverables: string[];
}

export interface MapProcessGroup {
  id: string;
  label: string;
  gate?: string;
  processes: MapProcess[];
  done: number;
  total: number;
}

export interface IslandInventory {
  processes: MapProcess[];
  characters: MapCharacter[];
  groups: MapProcessGroup[];
  summary: { done: number; total: number };
}

/** O que o inventário precisa do snapshot: o do mapa, mais o plano da descoberta. */
export interface InventorySnapshot extends ColmeiaSnapshot {
  foundationPlan?: FoundationPlan | null;
}

/** O agente já com o status que o `IslandDetail` calculou. */
export interface InventoryAgent {
  agentId: string;
  status: IslandAgentStatus;
  role?: string;
  taskId?: string;
  step?: string;
  reason?: string;
}

export interface InventoryInput {
  snapshot: InventorySnapshot;
  vm: ColmeiaVM;
  island: ColmeiaIsland;
  agents: readonly InventoryAgent[];
  events: readonly RunEvent[];
  catalog?: readonly AgentCatalogEntry[];
}

// ── Vocabulário ─────────────────────────────────────────────────────────────

const fromPlanStatus: Record<PlanItem["status"], MapProcessStatus> = {
  pending: "open",
  running: "working",
  review: "review",
  done: "done",
  blocked: "blocked",
};

function fromWorkStatus(status: string, entry?: WaveItemStatusEntry): MapProcessStatus {
  if (status === "done" && entry?.requires_approval && !entry.human_approved_at) return "review";
  switch (status) {
    case "done":
    case "skipped":
      return "done";
    case "in-progress":
      return "working";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    case "cancelled":
      return "blocked";
    default:
      return "open";
  }
}

function fromDeliveryStatus(status: string | undefined): MapProcessStatus {
  if (!status) return "open";
  if (isClosedStatus(status)) return "done";
  return fromWorkStatus(status);
}

/** Rótulo do grupo de uma onda/épico, igual ao `executionFocus` do mapa. */
function groupTitle(raw: string, position: number, prefix: "epic" | "wave"): { id: string; label: string } {
  const { index, label } = parseWaveLabel(raw);
  const title = parseWaveContent(label.split(" — ")[0]!.trim()).title;
  const n = index ?? position + 1;
  return { id: `${prefix}-${n}`, label: `${prefix === "epic" ? "Epic" : "Onda"} ${n} · ${title}` };
}

/** `@agent` na forma canônica, ou `undefined` quando o processo não tem dono. */
const agentOf = (raw: string | undefined): string | undefined => (raw ? normalizeAgentId(raw) : undefined);

function lastEventFor(events: readonly RunEvent[], taskId: string): RunEvent | undefined {
  let last: RunEvent | undefined;
  for (const e of events) if (e.task_id === taskId) last = e;
  return last;
}

// ── Descoberta (Foundation) ─────────────────────────────────────────────────

/** Fases do assessment que o `@assessor` coordena mas não estão nos contratos do Foundation. */
const EXTRA_DISCOVERY: ReadonlyArray<{
  id: string;
  label: string;
  agent: string;
  icon: string;
  scope: "repo" | "workspace";
  out: string;
  why: string;
}> = [
  {
    id: "security",
    label: "Segurança",
    agent: "@security-auditor",
    icon: "🛡",
    scope: "repo",
    out: "assessment/security/security-report.md",
    why: "Procura segredo, dependência vulnerável e superfície exposta antes de qualquer mudança.",
  },
  {
    id: "test-coverage",
    label: "Cobertura de testes",
    agent: "@test-coverage-mapper",
    icon: "🧪",
    scope: "repo",
    out: "assessment/test-coverage/coverage-gaps.md",
    why: "Diz onde a rede de segurança tem buraco — o refactor só entra depois do backfill.",
  },
  {
    id: "maturity",
    label: "Maturidade",
    agent: "@maturity-assessor",
    icon: "📈",
    scope: "workspace",
    out: "assessment/maturity/maturity-scorecard.md",
    why: "Mede prática observada, não promessa, para a modernização ter linha de base.",
  },
];

function contractOf(phaseId: string): FoundationPhaseContract | undefined {
  return FOUNDATION_CONTRACTS.find((c) => c.phaseId === phaseId) ?? (SKILL_LINKING_CONTRACT.phaseId === phaseId ? SKILL_LINKING_CONTRACT : undefined);
}

function foundationPlanOf(snapshot: InventorySnapshot, events: readonly RunEvent[]): FoundationPlan | null {
  if (snapshot.foundationPlan) return snapshot.foundationPlan;
  if (!snapshot.foundationState && !snapshot.reposInventory) return null;
  return buildFoundationPlan(snapshot.reposInventory as ReposInventory | null, snapshot.foundationState, deriveActivity([...events]));
}

function progressOf(contract: FoundationPhaseContract | undefined, state: FoundationState | null, repoId?: string): MapProcess["progress"] {
  if (!contract || contract.checklist.length === 0) return undefined;
  const phase = repoId ? phasesForRepo(state, repoId)[contract.phaseId] : state?.phases[contract.phaseId];
  const done = contract.checklist.filter((c) => phase?.human_checklist[c.id] === true).length;
  return { done, total: contract.checklist.length };
}

function discoveryProcesses(snapshot: InventorySnapshot, island: ColmeiaIsland, events: readonly RunEvent[]): MapProcess[] {
  const plan = foundationPlanOf(snapshot, events);
  const state = snapshot.foundationState;
  const processes: MapProcess[] = [];
  let order = 0;

  for (const item of plan?.items ?? []) {
    if (item.kind !== "phase") continue;
    const phaseId = item.key.includes("/") ? item.key.split("/").pop()! : item.key;
    const contract = contractOf(phaseId);
    processes.push({
      id: item.key,
      islandId: island.id,
      groupId: item.repoId ?? "workspace",
      groupLabel: item.repoId ?? "Workspace",
      label: item.label,
      icon: item.icon,
      agent: agentOf(item.agent),
      status: fromPlanStatus[item.status],
      scope: item.scope,
      ...(item.repoId ? { repoId: item.repoId } : {}),
      why: item.why,
      ...(item.produces ? { artifact: item.produces } : {}),
      ...(item.blockedBy ? { blockedBy: item.blockedBy } : {}),
      gate: item.repoId ? "D1" : "D1 global",
      ...(progressOf(contract, state, item.repoId) ? { progress: progressOf(contract, state, item.repoId) } : {}),
      order: order++,
    });
  }

  // Fases que o assessor também roda e que não estão no contrato do D1.
  const repoIds = Object.keys(state?.repos ?? {});
  for (const extra of EXTRA_DISCOVERY) {
    if (extra.scope === "repo") {
      for (const repoId of repoIds) {
        if (!state?.repos[repoId]?.phases[extra.id]) continue;
        const phase = state.repos[repoId].phases[extra.id]!;
        processes.push({
          id: `${repoId}/${extra.id}`,
          islandId: island.id,
          groupId: repoId,
          groupLabel: repoId,
          label: extra.label,
          icon: extra.icon,
          agent: extra.agent,
          status: fromPlanStatus[phase.status === "agent-done" ? "review" : phase.status === "in-progress" ? "running" : phase.status === "done" ? "done" : "pending"],
          scope: "repo",
          repoId,
          why: extra.why,
          artifact: resolveArtifactPath({ out: extra.out, scope: "repo" }, repoId),
          gate: "D1",
          order: order++,
        });
      }
    } else if (state?.phases[extra.id]) {
      const phase = state.phases[extra.id]!;
      processes.push({
        id: extra.id,
        islandId: island.id,
        groupId: "workspace",
        groupLabel: "Workspace",
        label: extra.label,
        icon: extra.icon,
        agent: extra.agent,
        status: fromPlanStatus[phase.status === "agent-done" ? "review" : phase.status === "in-progress" ? "running" : phase.status === "done" ? "done" : "pending"],
        scope: "workspace",
        why: extra.why,
        artifact: extra.out,
        gate: "D1 global",
        order: order++,
      });
    }
  }

  return processes;
}

// ── Planejamento ────────────────────────────────────────────────────────────

function planningProcesses(island: ColmeiaIsland, initiative: Initiative | null): MapProcess[] {
  if (!initiative) return [];
  const artifacts = initiative.planning_artifacts ?? [];
  const find = (suffix: string): string | undefined => artifacts.find((p) => p.endsWith(suffix));
  const gates: Array<{
    id: string;
    label: string;
    agent: string;
    icon: string;
    gate: "roadmap_gate" | "risk_matrix_gate";
    why: string;
    suffix: string;
  }> = [
    {
      id: "roadmap",
      label: "Roadmap de modernização",
      agent: "@modernization-planner",
      icon: "🗺",
      gate: "roadmap_gate",
      why: "Épicos em ordem de dependência: cada passo reversível, sem big bang.",
      suffix: "roadmap.md",
    },
    {
      id: "risk-matrix",
      label: "Matriz de risco",
      agent: "@risk-prioritizer",
      icon: "⚖",
      gate: "risk_matrix_gate",
      why: "Risco × impacto: o que pode esperar e o que trava a primeira entrega.",
      suffix: "risk-matrix.md",
    },
  ];
  const out = gates.map((g, i): MapProcess => {
    const approved = initiative[g.gate]?.status === "approved";
    const artifact = find(g.suffix);
    return {
      id: g.id,
      islandId: island.id,
      groupId: "planning",
      groupLabel: "Planejamento",
      label: g.label,
      icon: g.icon,
      agent: g.agent,
      status: approved ? "done" : artifact ? "review" : "open",
      why: g.why,
      ...(artifact ? { artifact } : {}),
      gate: "D2",
      order: i,
    };
  });
  out.push({
    id: "adr",
    islandId: island.id,
    groupId: "planning",
    groupLabel: "Planejamento",
    label: "Decisões de arquitetura",
    icon: "🏛",
    agent: "@adr-recorder",
    status: artifacts.some((p) => p.startsWith("docs/adr/")) ? "done" : "open",
    why: "Toda decisão que muda o rumo vira um ADR versionado.",
    artifact: "docs/adr/",
    order: out.length,
  });
  return out;
}

// ── Execução e ondas ────────────────────────────────────────────────────────

function executionProcesses(vm: ColmeiaVM, island: ColmeiaIsland, initiative: Initiative | null, events: readonly RunEvent[]): MapProcess[] {
  if (!initiative) return [];
  const epics = initiative.epics?.length ? initiative.epics : undefined;
  const raws = epics ?? initiative.waves ?? [];
  const group = epics ? initiative.epic_status : initiative.wave_status;
  const prefix: "epic" | "wave" = epics ? "epic" : "wave";
  const processes: MapProcess[] = [];
  let order = 0;

  for (const [position, raw] of raws.entries()) {
    const wave = groupTitle(raw, position, prefix);
    const entry = group?.[wave.id];
    const items = Object.entries(entry?.items ?? {});
    if (items.length === 0) {
      if (!entry) continue;
      const bee = vm.bees.find((b) => b.taskId === wave.id && b.agentId);
      const last = lastEventFor(events, wave.id);
      processes.push({
        id: wave.id,
        islandId: island.id,
        groupId: wave.id,
        groupLabel: wave.label,
        label: wave.label,
        icon: "🏔",
        agent: bee?.agentId ?? agentOf(last?.agent_id),
        status: fromWorkStatus(entry.status),
        ...(entry.artifacts?.[0] ? { artifact: entry.artifacts[0] } : {}),
        why: entry.note,
        order: order++,
      });
      continue;
    }
    for (const [key, item] of items) {
      const bee = vm.bees.find((b) => b.taskId === `${wave.id}/${key}` && b.agentId);
      const last = lastEventFor(events, `${wave.id}/${key}`);
      const reason = item.reason;
      processes.push({
        id: `${wave.id}/${key}`,
        islandId: island.id,
        groupId: wave.id,
        groupLabel: wave.label,
        label: key,
        icon: "🧩",
        agent: bee?.agentId ?? agentOf(last?.agent_id),
        status: fromWorkStatus(item.status, item),
        ...(item.artifacts?.[0] ? { artifact: item.artifacts[0] } : {}),
        why: item.summary ?? reason,
        ...(reason && item.status !== "done" ? { blockedBy: reason } : {}),
        order: order++,
      });
    }
  }
  return processes;
}

// ── Operação e Delivery ─────────────────────────────────────────────────────

const OPERATION_WHY: Record<string, string> = {
  devops: "Pipeline, infraestrutura e ambientes: o que precisa existir para publicar.",
  release: "A versão que sai é um contrato: tag, changelog e o mesmo pacote que passou no CI.",
  observability: "Sem sinal, não há como saber se o que subiu está de pé.",
  incident: "Primeiro estabiliza, depois investiga: o mapa não deixa o incidente virar rotina.",
  sustain: "Manutenção contínua: dependência, CVE e o que o tempo cobra.",
};

function deliveryProcesses(snapshot: InventorySnapshot, island: ColmeiaIsland): MapProcess[] {
  const delivery = snapshot.deliveryState;
  return DELIVERY_PHASES.filter((p) => p.stream === island.id).map((p, i): MapProcess => {
    const status = delivery?.phases[canonicalDeliveryPhaseId(p.id)]?.status;
    return {
      id: p.id,
      islandId: island.id,
      groupId: island.id,
      groupLabel: island.label,
      label: p.label,
      icon: p.icon,
      agent: p.agent,
      status: status ? fromDeliveryStatus(status) : "open",
      why: OPERATION_WHY[p.id] ?? `Fase de ${island.label}: ${p.artifactsExpected[0] ?? "sem artefato fixo"}.`,
      ...(p.artifactsExpected[0] ? { artifact: p.artifactsExpected[0] } : {}),
      ...(p.gateAfter ? { gate: p.gateAfter } : {}),
      order: i,
    };
  });
}

function operationProcesses(snapshot: InventorySnapshot, island: ColmeiaIsland): MapProcess[] {
  const delivery = snapshot.deliveryState;
  return DELIVERY_PHASES.filter((p) => p.stream === "operation").map((p, i): MapProcess => {
    const status = delivery?.phases[canonicalDeliveryPhaseId(p.id)]?.status;
    return {
      id: p.id,
      islandId: island.id,
      groupId: "operation",
      groupLabel: "Operação",
      label: p.label,
      icon: p.icon,
      agent: p.agent,
      status: status ? fromDeliveryStatus(status) : "open",
      why: OPERATION_WHY[p.id] ?? "Sustentação do que já está no ar.",
      ...(p.artifactsExpected[0] ? { artifact: p.artifactsExpected[0] } : {}),
      order: i,
    };
  });
}

// ── Montagem do inventário ──────────────────────────────────────────────────

/** Agrupa os processos para a vista: repo/workspace, épico/onda ou stream. */
export function groupProcesses(processes: readonly MapProcess[]): MapProcessGroup[] {
  const groups = new Map<string, MapProcessGroup>();
  for (const p of processes) {
    let g = groups.get(p.groupId);
    if (!g) {
      g = { id: p.groupId, label: p.groupLabel, ...(p.gate ? { gate: p.gate } : {}), processes: [], done: 0, total: 0 };
      groups.set(p.groupId, g);
    }
    g.processes.push(p);
    g.total += 1;
    if (p.status === "done") g.done += 1;
  }
  return [...groups.values()].map((g) => ({ ...g, processes: g.processes.sort((a, b) => a.order - b.order) }));
}

function processesOf(snapshot: InventorySnapshot, vm: ColmeiaVM, island: ColmeiaIsland, initiative: Initiative | null, events: readonly RunEvent[]): MapProcess[] {
  if (vm.flow === "foundation") return island.id === "discovery" ? discoveryProcesses(snapshot, island, events) : [];
  if (vm.flow === "waves") return executionProcesses(vm, island, initiative, events);
  if (vm.flow === "greenfield") return deliveryProcesses(snapshot, island);
  switch (island.id) {
    case "discovery":
      return discoveryProcesses(snapshot, island, events);
    case "planning":
      return planningProcesses(island, initiative);
    case "execution":
      return executionProcesses(vm, island, initiative, events);
    case "operation":
      return operationProcesses(snapshot, island);
    default:
      return [];
  }
}

function charactersOf(
  vm: ColmeiaVM,
  island: ColmeiaIsland,
  agents: readonly InventoryAgent[],
  processes: readonly MapProcess[],
  catalog: readonly AgentCatalogEntry[]
): MapCharacter[] {
  const roles = agentRoleIndex(catalog);
  const byAgent = new Map<string, InventoryAgent>();
  for (const a of agents) byAgent.set(a.agentId, a);
  const ids = new Set<string>([...agents.map((a) => a.agentId), ...processes.flatMap((p) => (p.agent ? [p.agent] : []))]);
  const fallbackStatus: IslandAgentStatus = island.state === "current" ? "queued" : island.state === "done" ? "done" : "sleeping";
  const order = new Map([...byAgent.keys()].map((id, i) => [id, i]));

  return [...ids]
    .map((agentId): MapCharacter => {
      const persona = personaOf(agentId);
      const detail = byAgent.get(agentId);
      const role = detail?.role ?? roles.get(agentId);
      const mine = processes.filter((p) => p.agent === agentId);
      const current =
        (detail?.taskId ? mine.find((p) => p.id === detail.taskId || p.id.endsWith(`/${detail.taskId}`)) : undefined) ??
        mine.find((p) => p.status === "working") ??
        mine.find((p) => p.status === "review") ??
        mine.find((p) => p.status === "blocked" || p.status === "failed");
      return {
        agentId,
        islandId: island.id,
        name: persona.name,
        archetype: persona.archetype,
        trait: persona.trait,
        accent: persona.accent,
        ...(role ? { role } : {}),
        status: detail?.status ?? fallbackStatus,
        ...(current ? { processId: current.id } : {}),
        ...(detail?.taskId ? { taskId: detail.taskId } : {}),
        ...(detail?.step ? { step: detail.step } : {}),
        ...(detail?.reason ? { reason: detail.reason } : {}),
        handles: [...new Set(mine.map((p) => p.label))],
        deliverables: vm.pots.filter((p) => p.islandId === island.id && p.agentId === agentId).map((p) => p.artifactPath),
      };
    })
    .sort((a, b) => {
      const tone = (c: MapCharacter): number => (c.status === "working" ? 0 : c.status === "blocked" ? 1 : c.status === "queued" ? 2 : c.status === "done" ? 3 : 4);
      return tone(a) - tone(b) || (order.get(a.agentId) ?? 99) - (order.get(b.agentId) ?? 99) || a.name.localeCompare(b.name);
    });
}

/** O inventário completo de uma ilha, pronto para o painel e para o modo lista. */
export function deriveIslandInventory({ snapshot, vm, island, agents, events, catalog = [] }: InventoryInput): IslandInventory {
  const initiative = activeInitiative(snapshot.initiatives) ?? null;
  const processes = processesOf(snapshot, vm, island, initiative, events);
  const characters = charactersOf(vm, island, agents, processes, catalog);
  const groups = groupProcesses(processes);
  const done = processes.filter((p) => p.status === "done").length;
  return { processes, characters, groups, summary: { done, total: processes.length } };
}
