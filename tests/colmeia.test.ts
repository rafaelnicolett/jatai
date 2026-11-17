import { describe, it, expect } from "vitest";
import { deriveColmeia, initiativeFlow, type ColmeiaSnapshot } from "../src/core/plans/colmeia";
import type { RunEvent } from "../src/core/contracts/run-events-contract.pure";
import type { Initiative } from "../src/core/contracts/initiatives-contract.pure";
import type { DeliveryState } from "../src/core/contracts/delivery-state-contract.pure";

/** `deriveColmeia` (F5.2): casos de borda além dos cenários da feature. */

const ev = (o: Partial<RunEvent> & { event_type: string; timestamp: string }): RunEvent => ({ run_id: "r", ...o });

const greenfield: Initiative = { id: "loja", name: "Loja", status: "in-progress", mode: "greenfield" };
const delivery = (phases: Record<string, string>): DeliveryState => ({
  phases: Object.fromEntries(Object.entries(phases).map(([id, status]) => [id, { status: status as never, human_checklist: {} }])),
});

describe("initiativeFlow — o fluxo do tipo de iniciativa (ADR-0001)", () => {
  it("modernização e feature brownfield: os 4 streams com D1, D2 e D3", () => {
    const flow = initiativeFlow({ id: "m", name: "m", status: "planned", type: "modernization" });
    expect(flow.islands.map((i) => i.id)).toEqual(["discovery", "planning", "execution", "operation"]);
    expect(flow.bridges.map((b) => b.gate)).toEqual(["D1", "D2", "D3"]);
  });

  it("greenfield: Upstream, Downstream e Operação, com G1 e G2", () => {
    const flow = initiativeFlow(greenfield);
    expect(flow.islands.map((i) => i.label)).toEqual(["Upstream", "Downstream", "Operação"]);
    expect(flow.bridges.map((b) => b.gate)).toEqual(["G1", "G2"]);
    expect(flow.islands[0]!.agents).toContain("@business");
  });

  it("hotfix sem ondas usa o template de 3 ondas", () => {
    const flow = initiativeFlow({ id: "h", name: "h", status: "planned", type: "hotfix" });
    expect(flow.islands.map((i) => [i.id, i.label])).toEqual([["wave-1", "Diagnóstico"], ["wave-2", "Fix + Testes"], ["wave-3", "Validação"]]);
  });
});

describe("deriveColmeia — estado manda (R2)", () => {
  const snap = (initiative: Initiative, deliveryState: DeliveryState | null = null): ColmeiaSnapshot => ({
    initiatives: { active: initiative.id, initiatives: [initiative] },
    foundationState: null,
    deliveryState,
  });

  it("greenfield: G1 aprova com as fases de Upstream fechadas, e a ilha atual anda", () => {
    const upstreamDone = { business: "done", product: "done", "ux-design": "skipped", domain: "done", bdd: "done", architecture: "done", "sprint-plan": "cancelled" };
    const vm = deriveColmeia(snap(greenfield, delivery(upstreamDone)), []);
    expect(vm.bridges.map((b) => [b.gate, b.state])).toEqual([["G1", "approved"], ["G2", "unbuilt"]]);
    expect(vm.islands.map((i) => i.state)).toEqual(["done", "current", "sleeping"]);
  });

  it("evento de agente numa fase do greenfield cai na ilha do stream da fase (catálogo, com alias)", () => {
    const vm = deriveColmeia(snap(greenfield), [ev({ event_type: "agent-started", timestamp: "t1", phase_id: "sprint-planner", agent_id: "sprint-planner" })]);
    expect(vm.bees[0]).toMatchObject({ islandId: "upstream", agentId: "@sprint-planner" });
  });

  it("tarefa fechada no estado derruba a abelha do evento sem fim", () => {
    const initiative: Initiative = { id: "m", name: "m", status: "in-progress", type: "modernization", wave_status: { "wave-1": { status: "done", items: { a: { status: "done" } } } } };
    const vm = deriveColmeia(snap(initiative), [ev({ event_type: "agent-started", timestamp: "t1", task_id: "wave-1/a", agent_id: "@x" })]);
    expect(vm.bees).toEqual([]);
  });

  it("agent-done de fase sem tarefa: guarda até a fase estar done no estado", () => {
    const initiative: Initiative = { id: "m", name: "m", status: "in-progress", type: "modernization" };
    const events = [ev({ event_type: "agent-started", timestamp: "t1", phase_id: "tech-stack", repo_id: "api", agent_id: "@tech-mapper" }), ev({ event_type: "agent-done", timestamp: "t2", phase_id: "tech-stack", repo_id: "api", agent_id: "@tech-mapper" })];
    const waiting = deriveColmeia(snap(initiative), events);
    expect(waiting.guards).toEqual([expect.objectContaining({ islandId: "discovery", kind: "approval" })]);
    const approved = deriveColmeia({ ...snap(initiative), foundationState: { phases: {}, repos: { api: { phases: { "tech-stack": { status: "done", human_checklist: {} } }, gate_d1: { status: "pending" } } } } }, events);
    expect(approved.guards).toEqual([]);
  });

  it("tarefa concluída que exige aprovação acende a guarda pelo estado, mesmo sem evento; aprovada, apaga", () => {
    const item = (human?: string): Initiative => ({ id: "m", name: "m", status: "in-progress", type: "modernization", wave_status: { "wave-1": { status: "in-progress", items: { a: { status: "done", requires_approval: true, ...(human ? { human_approved_at: human } : {}) } } } } });
    expect(deriveColmeia(snap(item()), []).guards).toEqual([expect.objectContaining({ taskId: "wave-1/a", islandId: "execution" })]);
    expect(deriveColmeia(snap(item("2026-11-15T12:00:00Z")), []).guards).toEqual([]);
  });

  it("evento de outra iniciativa fica de fora; evento sem iniciativa entra", () => {
    const initiative: Initiative = { id: "m", name: "m", status: "in-progress", type: "modernization" };
    const vm = deriveColmeia(snap(initiative), [
      ev({ event_type: "agent-started", timestamp: "t1", agent_id: "@a", phase_id: "p1", initiative_id: "outra" }),
      ev({ event_type: "agent-started", timestamp: "t2", agent_id: "@b", phase_id: "p2" }),
    ]);
    expect(vm.bees.map((b) => b.agentId)).toEqual(["@b"]);
  });

  it("evento de escrita de arquivo de estado vai para a atividade recente, não vira pote", () => {
    const initiative: Initiative = { id: "m", name: "m", status: "in-progress", type: "modernization" };
    const vm = deriveColmeia(snap(initiative), [ev({ event_type: "artifact-written", timestamp: "t1", initiative_id: "m", artifact_path: ".github/artifacts/initiatives.yaml", message: "tarefa 'w/a' → done" })]);
    expect(vm.pots).toEqual([]);
    expect(vm.feed.map((f) => f.text)).toEqual(["tarefa 'w/a' → done"]);
  });

  it("o texto da atividade recente é cortado em 140 caracteres", () => {
    const initiative: Initiative = { id: "m", name: "m", status: "in-progress", type: "modernization" };
    const vm = deriveColmeia(snap(initiative), [ev({ event_type: "agent-progress", timestamp: "t1", agent_id: "@a", message: "x".repeat(500) })]);
    expect([...vm.feed[0]!.text].length).toBe(140);
  });
});
