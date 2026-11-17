/**
 * work-status-view.ts — a visão de trabalho da iniciativa ativa (F6.5,
 * ADR-0022), pura e segura para o webview.
 *
 * Dá ao Cockpit, num campo próprio do snapshot (`workStatus`), o status e o
 * motivo de cada coisa que a ADR-0022 cobre, e o fechamento dos gates:
 *
 * - `entries`: a iniciativa ativa, cada fase do delivery-state e cada item
 *   de onda/épico, com `status`, `reason` e, para texto fora do vocabulário,
 *   `status: "unknown"` + `statusText`;
 * - `gates`: G1 (fases de Upstream), G2 (Downstream) e D3 (itens de
 *   execução da iniciativa): fecha quando tudo está fechado e lista cada
 *   `cancelled` com o motivo (§3);
 * - `warnings`: um aviso por status desconhecido (§5).
 *
 * A apresentação (DS v2: ⊘ e motivo no card, `failed` na mesma família de
 * cor, `cancelled` riscado entre os fechados) é da onda seguinte.
 */
import { deliveryPhase, deliveryPhaseIds } from "../methodology/phase-catalog.pure";
import type { DeliveryState } from "../contracts/delivery-state-contract.pure";
import { activeInitiative, type Initiative, type InitiativesState } from "../contracts/initiatives-contract.pure";
import { gateClosure, readWorkStatus, UNKNOWN_STATUS, WORK_STATUSES, type GateItem } from "../contracts/work-status.pure";

export interface WorkStatusEntry {
  scope: "initiative" | "phase" | "wave-item" | "epic-item";
  /** `<id>` da iniciativa, `<fase>` ou `<onda>/<item>`. */
  key: string;
  status: string;
  reason?: string;
  /** Texto original quando `status` é `unknown`. */
  statusText?: string;
}

export interface WorkStatusGate {
  gate: "G1" | "G2" | "D3";
  closed: boolean;
  open: GateItem[];
  cancelled: GateItem[];
}

export interface WorkStatusView {
  initiativeId: string | null;
  entries: WorkStatusEntry[];
  gates: WorkStatusGate[];
  warnings: string[];
}

/** Os itens de execução (onda/épico) de uma iniciativa, no formato de gate. Onda sem itens conta pelo próprio status. */
export function executionGateItems(initiative: Initiative): GateItem[] {
  const items: GateItem[] = [];
  for (const group of [initiative.wave_status, initiative.epic_status]) {
    for (const [wave, entry] of Object.entries(group ?? {})) {
      const waveItems = Object.entries(entry.items ?? {});
      if (waveItems.length === 0) {
        items.push({ key: wave, status: entry.status });
        continue;
      }
      for (const [item, value] of waveItems) {
        items.push({ key: `${wave}/${item}`, status: value.status, ...(value.reason ? { reason: value.reason } : {}) });
      }
    }
  }
  return items;
}

function entry(scope: WorkStatusEntry["scope"], key: string, rawStatus: string, reason: string | undefined, statusText?: string): WorkStatusEntry {
  // Itens de onda guardam o texto como veio: a mesma leitura sem rebaixamento vale aqui.
  const read = statusText !== undefined ? { status: UNKNOWN_STATUS, text: statusText } : readWorkStatus(rawStatus, WORK_STATUSES, "pending");
  return {
    scope,
    key,
    status: read.status,
    ...(reason ? { reason } : {}),
    ...(read.text !== undefined ? { statusText: read.text } : {}),
  };
}

export function deriveWorkStatus(initiatives: InitiativesState | null, deliveryState: DeliveryState | null): WorkStatusView {
  const entries: WorkStatusEntry[] = [];
  const active = activeInitiative(initiatives);

  if (active) {
    entries.push({
      scope: "initiative",
      key: active.id,
      status: active.status,
      ...(active.reason ? { reason: active.reason } : {}),
      ...(active.status_text !== undefined ? { statusText: active.status_text } : {}),
    });
  }

  for (const [phaseId, phase] of Object.entries(deliveryState?.phases ?? {})) {
    entries.push(entry("phase", phaseId, phase.status, phase.reason, phase.status === UNKNOWN_STATUS ? phase.status_text : undefined));
  }

  if (active) {
    for (const [scope, group] of [["wave-item", active.wave_status], ["epic-item", active.epic_status]] as const) {
      for (const [wave, waveEntry] of Object.entries(group ?? {})) {
        for (const [item, value] of Object.entries(waveEntry.items ?? {})) entries.push(entry(scope, `${wave}/${item}`, value.status, value.reason));
      }
    }
  }

  const phaseItem = (id: string): GateItem => {
    const phase = deliveryState?.phases[id];
    return { key: id, status: phase?.status ?? "pending", ...(phase?.reason ? { reason: phase.reason } : {}) };
  };
  const byStream = (stream: "upstream" | "downstream"): GateItem[] => deliveryPhaseIds().filter((id) => deliveryPhase(id)?.stream === stream).map(phaseItem);

  const gates: WorkStatusGate[] = [];
  if (deliveryState) {
    gates.push({ gate: "G1", ...gateClosure(byStream("upstream")) });
    gates.push({ gate: "G2", ...gateClosure(byStream("downstream")) });
  }
  if (active && (active.wave_status || active.epic_status)) gates.push({ gate: "D3", ...gateClosure(executionGateItems(active)) });

  const warnings = entries
    .filter((e) => e.status === UNKNOWN_STATUS)
    .map((e) => `status desconhecido: '${e.statusText ?? ""}' em ${e.scope === "initiative" ? "iniciativa" : e.scope === "phase" ? "fase" : "item"} '${e.key}' (preservado no arquivo; ADR-0022)`);

  return { initiativeId: active?.id ?? null, entries, gates, warnings };
}
