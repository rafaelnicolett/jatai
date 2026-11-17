/**
 * colmeia-detail.ts — o que o painel de uma ilha mostra (F5.3, ADR-0020): quem
 * trabalha ali e com qual responsabilidade, o passo atual, as entregas, o que
 * espera o operador e o que falta para o gate que fecha a ilha.
 *
 * Aditivo ao `deriveColmeia` (F5.2), que não muda: esta função lê o `ColmeiaVM`
 * já derivado, o estado gravado e os mesmos eventos, e só junta o que o painel e
 * o modo lista precisam. Puro e seguro para o webview. O componente não decide
 * nada: o checklist e o texto do passo atual saem daqui.
 *
 * Regras que ela respeita:
 * - R2: o estado gravado manda. O checklist é lido de `foundation-state`,
 *   `initiatives` e `delivery-state`, nunca inventado;
 * - R8: só metadados. O "passo atual" de um agente é a `message` do evento de
 *   início ou de progresso (já limitada a 140 caracteres), nunca conteúdo;
 * - evento de outra iniciativa não entra, como no `deriveColmeia`.
 */
import { RUN_EVENT_MESSAGE_MAX, type RunEvent } from "../contracts/run-events-contract.pure";
import { activeInitiative, type Initiative, type WaveItemStatusEntry } from "../contracts/initiatives-contract.pure";
import { phasesForRepo } from "../contracts/foundation-state-contract.pure";
import type { RepoEntry } from "../contracts/repos-contract.pure";
import { agentRoleIndex, normalizeAgentId, type AgentCatalogEntry } from "../contracts/agent-directory.pure";
import { FOUNDATION_CONTRACTS } from "../methodology/foundation-contracts";
import { DELIVERY_PHASES } from "../methodology/phase-catalog.pure";
import { D2_REQUIRED_GATES, d1RequiredPhases } from "./gate-readiness";
import { executionGateItems } from "./work-status-view";
import type { ColmeiaGuard, ColmeiaPot, ColmeiaSnapshot, ColmeiaVM, IslandAgentStatus, IslandState } from "./colmeia";

/** Quantos favos vazios (entregas por vir) a ilha desenha, no máximo: o resto vira só o número do checklist. */
export const MAX_PLANNED_POTS = 6;

/** Estado de uma linha do checklist, no vocabulário do mapa (glifo próprio na tela). */
export type ChecklistStatus = "done" | "in-progress" | "review" | "open" | "blocked" | "failed" | "cancelled";

export interface ChecklistItem {
  key: string;
  label: string;
  status: ChecklistStatus;
  /** Motivo de `blocked`, `failed` ou `cancelled` (ADR-0022), ou o resumo gravado no item. */
  reason?: string;
}

/** O que falta para o gate que fecha a ilha. `gate` é a chave da ponte (D1, D2, D3, G1, G2); ausente nas ondas de um hotfix. */
export interface IslandChecklist {
  gate?: string;
  items: ChecklistItem[];
}

export interface IslandDetailAgent {
  agentId: string;
  status: IslandAgentStatus;
  /** A responsabilidade, do frontmatter do agente instalado. Ausente quando o agente não está instalado. */
  role?: string;
  /** A tarefa em que a abelha trabalha ou parou. */
  taskId?: string;
  /** O passo atual do agente: a mensagem do último início ou progresso. */
  step?: string;
  /** Motivo do bloqueio ou da falha (`falhou: <motivo>`). */
  reason?: string;
}

export interface IslandDetail {
  islandId: string;
  label: string;
  state: IslandState;
  /** Na ilha atual: o épico ou a onda em curso (`Epic 0 · Fundação`). */
  focus?: string;
  /** Na ilha adormecida: o gate depois do qual ela acorda. */
  wakesAfterGate?: string;
  agents: IslandDetailAgent[];
  guards: ColmeiaGuard[];
  pots: ColmeiaPot[];
  /** Entregas por vir, para os favos vazios (no máximo `MAX_PLANNED_POTS`). */
  plannedPots: number;
  checklist: IslandChecklist | null;
}

/** O que o painel lê do snapshot: o do mapa, mais o inventário (só para saber se o repo tem frontend). */
export interface ColmeiaDetailSnapshot extends ColmeiaSnapshot {
  reposInventory?: { repos: Array<Pick<RepoEntry, "id" | "has_frontend">> } | null;
}

const clip = (text: string): string => [...text].slice(0, RUN_EVENT_MESSAGE_MAX).join("");

function fromWorkStatus(status: string): ChecklistStatus {
  switch (status) {
    case "done":
    case "skipped":
      return "done";
    case "in-progress":
      return "in-progress";
    case "blocked":
    case "failed":
    case "cancelled":
      return status;
    default:
      return "open";
  }
}

function fromFoundationPhase(status: string | undefined): ChecklistStatus {
  if (status === "done") return "done";
  if (status === "in-progress") return "in-progress";
  // O agente terminou e a validação humana espera: é "espera você".
  if (status === "agent-done") return "review";
  return "open";
}

function waveItems(initiative: Initiative, waveId: string): ChecklistItem[] {
  const wave = initiative.wave_status?.[waveId] ?? initiative.epic_status?.[waveId];
  const items = Object.entries(wave?.items ?? {});
  if (items.length === 0) {
    return wave ? [{ key: waveId, label: waveId, status: fromWorkStatus(wave.status) }] : [];
  }
  return items.map(([key, entry]: [string, WaveItemStatusEntry]) => ({
    key: `${waveId}/${key}`,
    label: `${waveId}/${key}`,
    status: fromWorkStatus(entry.status),
    ...(entry.reason ? { reason: clip(entry.reason) } : entry.summary ? { reason: clip(entry.summary) } : {}),
  }));
}

function discoveryChecklist(snapshot: ColmeiaDetailSnapshot, initiative: Initiative): ChecklistItem[] {
  const state = snapshot.foundationState;
  const repoIds = Object.keys(state?.repos ?? {}).filter((id) => !initiative.scope?.length || initiative.scope.includes(id));
  const labels = new Map(FOUNDATION_CONTRACTS.map((c) => [c.phaseId, c.label]));
  const items: ChecklistItem[] = [];
  for (const repoId of repoIds) {
    const repo = snapshot.reposInventory?.repos.find((r) => r.id === repoId);
    const phases = phasesForRepo(state, repoId);
    for (const key of d1RequiredPhases(repo)) {
      const label = labels.get(key) ?? key;
      items.push({ key: `${repoId}/${key}`, label: repoIds.length > 1 ? `${repoId} · ${label}` : label, status: fromFoundationPhase(phases[key]?.status) });
    }
  }
  return items;
}

function planningChecklist(initiative: Initiative): ChecklistItem[] {
  const labels: Record<(typeof D2_REQUIRED_GATES)[number], string> = { roadmap_gate: "Roadmap aprovado", risk_matrix_gate: "Matriz de risco aprovada" };
  return D2_REQUIRED_GATES.map((key) => ({ key, label: labels[key], status: initiative[key]?.status === "approved" ? "done" : "open" }));
}

function executionChecklist(initiative: Initiative): ChecklistItem[] {
  return executionGateItems(initiative).map((item) => ({
    key: item.key,
    label: item.key,
    status: fromWorkStatus(item.status),
    ...(item.reason ? { reason: clip(item.reason) } : {}),
  }));
}

function greenfieldChecklist(snapshot: ColmeiaSnapshot, stream: string): ChecklistItem[] {
  return DELIVERY_PHASES.filter((p) => p.stream === stream).map((p) => ({
    key: p.id,
    label: p.label,
    status: fromWorkStatus(snapshot.deliveryState?.phases[p.id]?.status ?? "pending"),
  }));
}

function checklistFor(snapshot: ColmeiaDetailSnapshot, vm: ColmeiaVM, islandId: string, state: IslandState): IslandChecklist | null {
  const initiative = activeInitiative(snapshot.initiatives);
  // A ilha adormecida ainda não tem o que listar; só as ondas de um hotfix mostram as que virão.
  if (!initiative || (state === "sleeping" && vm.flow !== "waves")) return null;
  const gate = vm.bridges.find((b) => b.from === islandId)?.gate;
  let items: ChecklistItem[] = [];
  if (vm.flow === "waves") items = waveItems(initiative, islandId);
  else if (vm.flow === "greenfield") items = greenfieldChecklist(snapshot, islandId);
  else if (islandId === "discovery") items = discoveryChecklist(snapshot, initiative);
  else if (islandId === "planning") items = planningChecklist(initiative);
  else if (islandId === "execution") items = executionChecklist(initiative);
  return items.length === 0 ? null : { ...(gate ? { gate } : {}), items };
}

/** O último passo de cada agente: a `message` do último início ou progresso, da iniciativa ativa. */
function lastStepByAgent(events: RunEvent[], initiativeId: string | null): Map<string, string> {
  const steps = new Map<string, string>();
  for (const e of events) {
    if (e.initiative_id !== undefined && e.initiative_id !== initiativeId) continue;
    if (!e.agent_id || !e.message) continue;
    if (e.event_type !== "agent-started" && e.event_type !== "agent-progress") continue;
    steps.set(normalizeAgentId(e.agent_id), clip(e.message));
  }
  return steps;
}

/**
 * Os detalhes de cada ilha do mapa, na ordem do fluxo. `events` são os mesmos
 * que foram para o `deriveColmeia`; `catalog`, as responsabilidades do host.
 */
export function deriveIslandDetails(
  snapshot: ColmeiaDetailSnapshot,
  vm: ColmeiaVM,
  events: RunEvent[],
  catalog: readonly AgentCatalogEntry[] = []
): IslandDetail[] {
  const roles = agentRoleIndex(catalog);
  const steps = lastStepByAgent(events, vm.initiativeId);
  return vm.islands.map((island): IslandDetail => {
    const checklist = checklistFor(snapshot, vm, island.id, island.state);
    const open = checklist ? checklist.items.filter((i) => i.status !== "done" && i.status !== "cancelled").length : 0;
    return {
      islandId: island.id,
      label: island.label,
      state: island.state,
      ...(island.focus ? { focus: island.focus } : {}),
      ...(island.wakesAfterGate ? { wakesAfterGate: island.wakesAfterGate } : {}),
      agents: island.agents.map(({ agentId, status }): IslandDetailAgent => {
        const bee = vm.bees.find((b) => b.islandId === island.id && b.agentId === agentId);
        const role = roles.get(agentId);
        const step = status === "working" || status === "blocked" ? steps.get(agentId) : undefined;
        return {
          agentId,
          status,
          ...(role ? { role } : {}),
          ...(bee?.taskId ? { taskId: bee.taskId } : {}),
          ...(step ? { step } : {}),
          ...(bee?.reason ? { reason: bee.reason } : {}),
        };
      }),
      guards: vm.guards.filter((g) => g.islandId === island.id),
      pots: vm.pots.filter((p) => p.islandId === island.id),
      plannedPots: island.state === "current" ? Math.min(open, MAX_PLANNED_POTS) : 0,
      checklist,
    };
  });
}
