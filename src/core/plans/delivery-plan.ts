/**
 * delivery-plan.ts
 *
 * Espelha `foundation-plan.ts`, mas para o lifecycle de Delivery (Upstream →
 * Gate G1 → Downstream → Gate G2 → Operation) — serve tanto iniciativas
 * greenfield-nativas quanto features novas criadas depois do Gate D1 do
 * Brownfield. Reaproveita `PlanItem`/`PlanItemStatus` do Foundation em vez de
 * um tipo paralelo: os componentes de UI (`StatusBadge`, `GatesLedger`,
 * `RepoTimelineDrawer`, `phaseIconFor`) já são genéricos sobre `PlanItem[]`.
 *
 * `done`/`total` cobrem as 16 fases + os 2 gates, sempre — stream-agnóstico
 * de propósito. A UI filtra por stream via `deliveryItemsForStreams` quando
 * precisa (ex.: as 3 barras de `StreamProgressBars`).
 */

import { PHASE_CONTRACTS, PHASE_ORDER, type PhaseStream } from "../methodology/phase-contracts";
import { deliveryGateAfter } from "../methodology/phase-catalog.pure";
import type { DeliveryState } from "../contracts/delivery-state-contract.pure";
import type { SprintBacklog } from "../contracts/sprint-backlog-contract.pure";
import type { PlanItem, PlanItemStatus } from "./foundation-plan";
import type { LiveActivity } from "../contracts/run-events-contract.pure";

export interface DeliveryPlan {
  items: PlanItem[];
  sprintBacklog: SprintBacklog | null;
  done: number;
  total: number;
  focus: PlanItem | null;
}

const UPSTREAM_IDS = PHASE_ORDER.filter((id) => PHASE_CONTRACTS[id]!.stream === "upstream");
const DOWNSTREAM_IDS = PHASE_ORDER.filter((id) => PHASE_CONTRACTS[id]!.stream === "downstream");

/**
 * ADR-0002 (`docs/adr/0002-operacoes-como-painel-continuo.md`): as 5 fases
 * `stream: "operation"` (devops/release/observability/incident/sustain) não
 * contam mais no `total`/`done` de uma iniciativa — Operação não tem
 * início/fim como uma iniciativa tem, e agora tem painel próprio ("Operações",
 * ver `OperationsView.tsx`). Uma `feature` concluída no Gate G2 mostra
 * 100%, sem depender de fases que não fazem parte do ciclo de vida dela.
 */
const NON_OPERATION_IDS = [...UPSTREAM_IDS, ...DOWNSTREAM_IDS];

/**
 * Nenhum evento de Delivery carrega `repo_id` de propósito aqui — mesmo
 * bucket "workspace" que o cross-repo do Foundation já usa. Duas iniciativas
 * de Delivery rodando ao mesmo tempo não são distinguíveis no log hoje
 * (`RunEvent` não tem `initiative_id`) — limitação pré-existente, não
 * introduzida por este módulo.
 */
function statusFromDeliveryState(phaseId: string, state: DeliveryState | null, activity: LiveActivity): PlanItemStatus {
  const matches = (e: { phase_id?: string; repo_id?: string } | null): boolean =>
    !!e && e.phase_id === phaseId && !e.repo_id;

  const phase = state?.phases[phaseId];
  // ADR-0022: cancelled é fechado (grupo dos concluídos); blocked e failed são condição do card, com motivo.
  if (phase?.status === "done" || phase?.status === "skipped" || phase?.status === "cancelled") return "done";
  if (phase?.status === "blocked" || phase?.status === "failed") return "blocked";
  if (activity.runningByKey.some(matches)) return "running";
  if (activity.awaiting.some(matches)) return "review";
  if (phase?.status === "in-progress") return "running";
  return "pending";
}

function gateItem(key: "gate-g1" | "gate-g2", label: string, requiredIds: string[], statuses: Map<string, PlanItemStatus>, stream: PhaseStream): PlanItem {
  const pending = requiredIds.filter((id) => statuses.get(id) !== "done");
  return {
    key,
    kind: "gate",
    label,
    agent: "@stream-align + @arch-cross",
    icon: "🚩",
    scope: "workspace",
    stream,
    status: pending.length === 0 ? "done" : "blocked",
    why: key === "gate-g1"
      ? "Fecha quando todas as fases de Upstream estão concluídas — libera o Downstream."
      : "Fecha quando todas as fases de Downstream estão concluídas — libera a Operação.",
    ...(pending.length > 0 ? { blockedBy: pending.map((id) => PHASE_CONTRACTS[id]!.label).join(", ") } : {}),
  };
}

export function buildDeliveryPlan(deliveryState: DeliveryState | null, sprintBacklog: SprintBacklog | null, activity: LiveActivity): DeliveryPlan {
  const statuses = new Map<string, PlanItemStatus>();
  for (const phaseId of NON_OPERATION_IDS) statuses.set(phaseId, statusFromDeliveryState(phaseId, deliveryState, activity));

  const items: PlanItem[] = [];
  for (const phaseId of NON_OPERATION_IDS) {
    const contract = PHASE_CONTRACTS[phaseId]!;
    items.push({
      key: contract.phaseId,
      kind: "phase",
      label: contract.label,
      agent: contract.agent,
      icon: contract.icon,
      scope: "workspace",
      stream: contract.stream,
      status: statuses.get(phaseId)!,
      produces: contract.outputs[0]?.relPath,
      why: contract.why,
      ...(statuses.get(phaseId) === "blocked" && deliveryState?.phases[phaseId]?.reason
        ? { blockedBy: deliveryState.phases[phaseId].reason }
        : {}),
    });

    const gate = deliveryGateAfter(phaseId);
    if (gate === "G1") items.push(gateItem("gate-g1", "Gate G1 — Upstream → Downstream", UPSTREAM_IDS, statuses, "upstream"));
    if (gate === "G2") items.push(gateItem("gate-g2", "Gate G2 — Downstream → Operação", DOWNSTREAM_IDS, statuses, "downstream"));
  }

  const done = items.filter((i) => i.status === "done").length;
  const focus =
    items.find((i) => i.status === "review") ??
    items.find((i) => i.status === "running") ??
    items.find((i) => i.status === "pending") ??
    null;

  return { items, sprintBacklog, done, total: items.length, focus };
}

/** Filtra o plano pra só os streams pedidos. */
export function deliveryItemsForStreams(plan: DeliveryPlan, streams: PhaseStream[]): PlanItem[] {
  return plan.items.filter((i) => i.stream && streams.includes(i.stream));
}
