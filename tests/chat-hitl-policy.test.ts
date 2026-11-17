import { describe, it, expect } from "vitest";
import { deliveryEntryOf, effectiveInitiativeAfterTurn, findPendingHitlPhase, missingMandatoryItems } from "../src/chat/hitl/HitlPolicy";
import { PHASE_CONTRACTS } from "../src/core/methodology/phase-contracts";
import type { InitiativeEntry, WorkspaceState } from "../src/chat/WorkspaceStateReader";

/**
 * F3.7 — regras HITL do chat, puras (extraídas do ConciergeParticipant). O
 * golden da conversa (CH1) cobre a renderização; aqui, as decisões em tabela.
 */

const init = (id: string, current_phase: string, created_at?: string): InitiativeEntry => ({ id, name: id, status: "in-progress", stream: "upstream", current_phase, created_at });

function state(over: Partial<WorkspaceState>): WorkspaceState {
  return { initiatives: [], activeId: null, activeInitiative: null, deliveryState: null, artifactsExist: [], mode: null, maturityFrameworks: [], brownfieldAssessmentReady: false, ...over };
}

const businessMandatory = PHASE_CONTRACTS.business!.guardRailChecklist.filter((i) => i.mandatory).map((i) => i.id);

describe("findPendingHitlPhase", () => {
  it.each([
    ["sem delivery-state", null, null],
    ["fase em andamento", { business: { status: "in-progress" } }, null],
    ["fase done já aprovada", { business: { status: "done", human_checklist: { "human-ok": true } } }, null],
    ["fase done sem contrato", { "fase-inexistente": { status: "done" } }, null],
    ["fase done sem human-ok", { business: { status: "done", human_checklist: { x: true } } }, "business"],
    ["alias sprint-planner vira a canônica sprint-plan", { "sprint-planner": { status: "done" } }, "sprint-plan"],
    ["duas pendentes: a primeira do catálogo ganha", { product: { status: "done" }, business: { status: "done" } }, "business"],
  ])("%s", (_caso, phases, expected) => {
    const s = state({ deliveryState: phases ? { phases: phases as never } : null });
    expect(findPendingHitlPhase(s)?.phaseId ?? null).toBe(expected);
  });

  it("devolve o checklist cru da fase pendente", () => {
    const s = state({ deliveryState: { phases: { business: { status: "done", human_checklist: { a: true } } } } });
    expect(findPendingHitlPhase(s)).toEqual({ phaseId: "business", checklist: { a: true } });
  });
});

describe("missingMandatoryItems", () => {
  it("null quando a fase não tem contrato", () => {
    expect(missingMandatoryItems("fase-inexistente", {})).toBeNull();
  });

  it("lista os obrigatórios não marcados e esvazia quando todos estão marcados", () => {
    expect(missingMandatoryItems("business", {})!.map((i) => i.id)).toEqual(businessMandatory);
    expect(missingMandatoryItems("business", Object.fromEntries(businessMandatory.map((id) => [id, true])))).toEqual([]);
  });
});

describe("effectiveInitiativeAfterTurn", () => {
  it("a ativa com fase de contrato, sem fallback", () => {
    const a = init("a", "business");
    expect(effectiveInitiativeAfterTurn(state({ initiatives: [a], activeInitiative: a }))).toEqual({ initiative: a, phaseId: "business", fallback: false });
  });

  it("alias na fase da ativa resolve para a canônica", () => {
    const a = init("a", "sprint-planner");
    expect(effectiveInitiativeAfterTurn(state({ initiatives: [a], activeInitiative: a }))?.phaseId).toBe("sprint-plan");
  });

  it("sem ativa válida: cai na mais recente (created_at) com fase de contrato", () => {
    const velha = init("velha", "business", "2025-01-01");
    const nova = init("nova", "product", "2025-06-01");
    const semContrato = init("sem", "fase-inexistente", "2026-01-01");
    expect(effectiveInitiativeAfterTurn(state({ initiatives: [velha, nova, semContrato], activeInitiative: semContrato }))).toEqual({ initiative: nova, phaseId: "product", fallback: true });
  });

  it("null quando nenhuma iniciativa tem fase com contrato", () => {
    expect(effectiveInitiativeAfterTurn(state({ initiatives: [init("x", "fase-inexistente")] }))).toBeNull();
  });
});

describe("deliveryEntryOf", () => {
  it("chave pedida primeiro, depois qualquer chave da mesma fase no catálogo", () => {
    expect(deliveryEntryOf({ "sprint-planner": 1 }, "sprint-plan")).toBe(1);
    expect(deliveryEntryOf({ "sprint-plan": 2, "sprint-planner": 1 }, "sprint-plan")).toBe(2);
    expect(deliveryEntryOf(undefined, "business")).toBeUndefined();
  });
});
