/**
 * flows.ts — o fluxo da iniciativa vista (ADR-0001) e o estado de cada gate
 * entre as etapas dele (ponte da trilha, item da linha do tempo de gates).
 *
 * O fluxo vem do `initiativeFlow` do núcleo (o mesmo que o Mapa usa, para as
 * duas telas contarem a mesma história). O estado de uma ponte soma ao
 * "aprovada ou não" do núcleo o que o operador precisa saber (DS v2 §4.2):
 * - `waiting`: o trabalho anterior fechou e a decisão espera você;
 * - `blocked`: uma tarefa bloqueada ou que falhou impede o gate (com o motivo);
 * - `future`: ainda falta trabalho.
 * A regra de fechamento é a MESMA do `StateCommands` (`gate-readiness`,
 * ADR-0024); a tela só a mostra antes do clique.
 */
import {
  PHASE_CONTRACTS,
  PHASE_ORDER,
  d1Readiness,
  d2Readiness,
  executionGateItems,
  gateClosure,
  initiativeFlow,
  isClosedStatus,
  type DeliveryState,
  type GateItem,
  type Initiative,
  type InitiativeFlow,
  type RepoEntry,
} from "@data";
import type { GateStatus } from "../../../design-system/patterns";
import { usesWaveView } from "../../../features/delivery/computeModernizationBoard";
import type { ViewContext } from "./viewTarget";

/**
 * O fluxo da iniciativa: o hotfix anda pelas ondas; modernização e qualquer
 * iniciativa com gate de Planning pelos 4 streams; as demais pelas fases de
 * entrega (Upstream, Downstream e Operação, ligadas por G1 e G2).
 */
export function flowFor(initiative: Initiative | undefined): InitiativeFlow {
  if (!initiative) return initiativeFlow(undefined);
  if (initiative.type === "hotfix") return initiativeFlow(initiative);
  return initiativeFlow({ ...initiative, mode: usesWaveView(initiative) ? "brownfield" : "greenfield" });
}

/** O fluxo dos 4 streams, para a Descoberta do workspace (sem iniciativa). */
export const DISCOVERY_FLOW: InitiativeFlow = initiativeFlow(undefined);

export interface BridgeModel {
  gate: string;
  status: GateStatus;
  /** Por que está assim, em texto: o que falta ou o que bloqueia. */
  reason?: string;
}

const unique = (xs: string[]): string[] => [...new Set(xs)];

/** Os repositórios cujo D1 a iniciativa depende: o escopo dela, ou todos os que o workspace conhece. */
export function d1RepoIds(ctx: Pick<ViewContext, "initiative" | "snapshot">): string[] {
  const scope = ctx.initiative?.scope;
  if (scope && scope.length > 0) return scope;
  return unique([...(ctx.snapshot.reposInventory?.repos ?? []).map((r) => r.id), ...Object.keys(ctx.snapshot.foundationState?.repos ?? {})]);
}

export function repoEntry(ctx: Pick<ViewContext, "snapshot">, repoId: string): RepoEntry | undefined {
  return ctx.snapshot.reposInventory?.repos.find((r) => r.id === repoId);
}

export interface D1Row {
  repoId: string;
  approved: boolean;
  closed: boolean;
  open: Array<{ key: string; status: string }>;
  approvedBy?: string;
  approvedAt?: string;
}

export function d1Rows(ctx: Pick<ViewContext, "initiative" | "snapshot">): D1Row[] {
  const foundation = ctx.snapshot.foundationState;
  return d1RepoIds(ctx).map((repoId) => {
    const gate = foundation?.repos[repoId]?.gate_d1;
    const readiness = d1Readiness(foundation, repoId, repoEntry(ctx, repoId));
    const approvedAt = gate?.human_approved_at ?? gate?.approved_at;
    return {
      repoId,
      approved: gate?.status === "approved",
      closed: readiness.closed,
      open: readiness.open,
      ...(gate?.by ? { approvedBy: gate.by } : {}),
      ...(approvedAt ? { approvedAt } : {}),
    };
  });
}

function phaseIdsOfStream(stream: "upstream" | "downstream"): string[] {
  return PHASE_ORDER.filter((id) => PHASE_CONTRACTS[id]?.stream === stream);
}

function deliveryItems(state: DeliveryState | null, stream: "upstream" | "downstream"): GateItem[] {
  return phaseIdsOfStream(stream).map((id) => {
    const phase = state?.phases[id];
    return { key: id, status: phase?.status ?? "pending", ...(phase?.reason ? { reason: phase.reason } : {}) };
  });
}

function why(item: GateItem): string {
  return `${item.key} ${item.status === "failed" ? "falhou" : "bloqueada"}${item.reason ? `: ${item.reason}` : ""}`;
}

/** O estado do gate `gate` ("D1", "D2", "D3", "G1", "G2") para a iniciativa vista. */
export function bridgeModel(gate: string, ctx: ViewContext): BridgeModel {
  const { initiative } = ctx;
  switch (gate) {
    case "D1": {
      const rows = d1Rows(ctx);
      if (rows.length === 0) return { gate, status: "future", reason: "nenhum repositório mapeado" };
      if (rows.every((r) => r.approved)) return { gate, status: "approved" };
      const ready = rows.filter((r) => !r.approved && r.closed);
      if (ready.length > 0) return { gate, status: "waiting", reason: `${ready.map((r) => r.repoId).join(", ")}: fases fechadas, a decisão espera você` };
      const pending = rows.find((r) => !r.approved)!;
      return { gate, status: "future", reason: `${pending.repoId}: falta ${pending.open.map((o) => o.key).join(", ")}` };
    }
    case "D2": {
      if (!initiative) return { gate, status: "future" };
      if (initiative.gate_d2?.status === "approved") return { gate, status: "approved" };
      const readiness = d2Readiness(initiative);
      return readiness.closed ? { gate, status: "waiting", reason: "roadmap e matriz de risco aprovados" } : { gate, status: "future", reason: `falta ${readiness.open.map((o) => o.key).join(", ")}` };
    }
    case "D3": {
      if (!initiative) return { gate, status: "future" };
      if (initiative.gate_d3?.status === "approved") return { gate, status: "approved" };
      const items = executionGateItems(initiative);
      if (items.length === 0) return { gate, status: "future", reason: "sem tarefas de execução" };
      const closure = gateClosure(items);
      const stuck = closure.open.find((i) => i.status === "blocked" || i.status === "failed");
      if (stuck) return { gate, status: "blocked", reason: why(stuck) };
      if (closure.closed) return { gate, status: "waiting", reason: "todas as tarefas fechadas" };
      return { gate, status: "future", reason: `${closure.open.length} ${closure.open.length === 1 ? "tarefa aberta" : "tarefas abertas"}` };
    }
    case "G1":
    case "G2": {
      const items = deliveryItems(ctx.projected.deliveryState, gate === "G1" ? "upstream" : "downstream");
      const closure = gateClosure(items);
      if (closure.closed) return { gate, status: "approved" };
      const stuck = closure.open.find((i) => i.status === "blocked" || i.status === "failed");
      return stuck ? { gate, status: "blocked", reason: why(stuck) } : { gate, status: "future" };
    }
    default:
      return { gate, status: "future" };
  }
}

/** Uma fase de entrega está fechada (feito, pulado ou cancelado)? */
export function phaseClosed(state: DeliveryState | null, phaseId: string): boolean {
  return isClosedStatus(state?.phases[phaseId]?.status ?? "pending");
}
