/**
 * HitlPolicy.ts — regras HITL do chat, puras (F3.7, Extract Function do
 * `ConciergeParticipant.ts`, cluster K4).
 *
 * Decidem, dado o estado lido do workspace, qual fase espera aprovação
 * humana, o que falta para aprovar uma fase e qual iniciativa o chat trata
 * como a corrente depois do turno. Quem renderiza ou grava é a casca.
 * Sem `vscode` nem I/O.
 */

import { PHASE_CONTRACTS, type GuardRailItem } from "../../core/methodology/phase-contracts";
import { canonicalDeliveryPhaseId, deliveryPhaseIds, deliveryPhaseKeysOf } from "../../core/methodology/phase-catalog.pure";
import type { InitiativeEntry, WorkspaceState } from "../WorkspaceStateReader";

/**
 * Entrada do delivery-state lido pelo chat (chaves cruas, como o agente
 * escreveu) para a fase `phaseId`: primeiro a chave pedida, depois qualquer
 * chave da mesma fase no catálogo único (canônica ou alias).
 */
export function deliveryEntryOf<T>(phases: Record<string, T> | undefined, phaseId: string): T | undefined {
  if (!phases) return undefined;
  if (phases[phaseId]) return phases[phaseId];
  for (const key of deliveryPhaseKeysOf(phaseId)) if (phases[key]) return phases[key];
  return undefined;
}

/**
 * Scan deliveryState for any phase that is "done" but not yet human-approved.
 * Normalises agent-written IDs (e.g. "sprint-planner" → "sprint-plan").
 * Returns the FIRST one found (oldest in the chat catalogue order) so gates are sequential.
 */
export function findPendingHitlPhase(
  state: WorkspaceState | null
): { phaseId: string; checklist: Record<string, boolean> } | null {
  if (!state?.deliveryState) return null;
  const phaseOrder = deliveryPhaseIds(); // ordem canônica do catálogo único
  const phases = state.deliveryState.phases;

  // Build a map: canonical-id → entry (multiple raw keys may map to same canonical)
  const canonicalMap = new Map<string, { checklist: Record<string, boolean> }>();
  for (const [rawId, entry] of Object.entries(phases)) {
    if (entry.status !== "done") continue;
    if (entry.human_checklist?.["human-ok"] === true) continue;
    const canonical = canonicalDeliveryPhaseId(rawId);
    if (!PHASE_CONTRACTS[canonical]) continue; // no contract → nothing to validate
    if (!canonicalMap.has(canonical)) {
      canonicalMap.set(canonical, { checklist: entry.human_checklist ?? {} });
    }
  }

  if (canonicalMap.size === 0) return null;

  // Return the earliest phase in the chat catalogue order
  for (const id of phaseOrder) {
    if (canonicalMap.has(id)) {
      return { phaseId: id, checklist: canonicalMap.get(id)!.checklist };
    }
  }

  // Fallback: any pending (shouldn't happen but be safe)
  const [phaseId, data] = canonicalMap.entries().next().value as [string, { checklist: Record<string, boolean> }];
  return { phaseId, checklist: data.checklist };
}

/**
 * Itens obrigatórios do checklist humano ainda não marcados para `phaseId`.
 * `null` quando a fase não tem contrato (não há o que validar).
 */
export function missingMandatoryItems(phaseId: string, checklist: Record<string, boolean>): GuardRailItem[] | null {
  const contract = PHASE_CONTRACTS[phaseId];
  if (!contract) return null;
  return contract.guardRailChecklist.filter((i) => i.mandatory).filter((i) => checklist[i.id] !== true);
}

export interface EffectiveInitiative {
  initiative: InitiativeEntry;
  /** Fase canônica da iniciativa, com contrato registrado. */
  phaseId: string;
  /** `true` quando a ativa não servia e o chat caiu na iniciativa mais recente com fase ativa. */
  fallback: boolean;
}

/**
 * Iniciativa "efetiva" para o checklist depois do turno. Fallback: se a
 * ativa é null OU sua fase não tem contract (ex.: o agente criou uma
 * iniciativa nova e esqueceu de atualizar `active:`), pega a iniciativa mais
 * recente (por `created_at`, ou a ordem do arquivo) cuja fase tenha contract.
 * Garante que o checklist SEMPRE renderize quando há uma fase válida em curso.
 * `null` quando nenhuma iniciativa tem fase com contrato.
 */
export function effectiveInitiativeAfterTurn(state: WorkspaceState): EffectiveInitiative | null {
  const active = state.activeInitiative;
  const activePhase = active ? canonicalDeliveryPhaseId(active.current_phase) : "";
  if (active && PHASE_CONTRACTS[activePhase]) return { initiative: active, phaseId: activePhase, fallback: false };

  const candidates = state.initiatives.filter((i) => !!PHASE_CONTRACTS[canonicalDeliveryPhaseId(i.current_phase)]);
  // pick the most recent by created_at (or last in file order if missing)
  candidates.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const fallback = candidates[0];
  if (!fallback) return null;
  return { initiative: fallback, phaseId: canonicalDeliveryPhaseId(fallback.current_phase), fallback: true };
}
