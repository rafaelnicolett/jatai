import { describe, it, expect } from "vitest";
import { buildDeliveryPlan, deliveryItemsForStreams } from "../src/data/delivery-plan";
import { parseDeliveryState } from "../src/data/delivery-state-contract";
import { parseRunEvents, deriveActivity } from "../src/data/run-events-contract";
import { PHASE_ORDER, PHASE_CONTRACTS } from "../src/data/phase-contracts";

const EMPTY_ACTIVITY = deriveActivity([]);

// ADR-0002: as 5 fases stream: "operation" não entram mais em buildDeliveryPlan — têm painel próprio ("Operações").
const NON_OPERATION_PHASE_COUNT = PHASE_ORDER.filter((id) => PHASE_CONTRACTS[id]!.stream !== "operation").length;

const UPSTREAM_STATE = `
phases:
  business: { status: done }
  product: { status: done }
  ux-design: { status: done }
  domain: { status: done }
  bdd: { status: done }
  architecture: { status: done }
  sprint-plan: { status: done }
`;

const ALL_DONE_STATE = `
phases:
  business: { status: done }
  product: { status: done }
  ux-design: { status: done }
  domain: { status: done }
  bdd: { status: done }
  architecture: { status: done }
  sprint-plan: { status: done }
  sprint-run: { status: done }
  backend: { status: done }
  frontend: { status: done }
  reviewer: { status: done }
`;

describe("buildDeliveryPlan — estrutura", () => {
  it("sem nenhum dado, monta as 11 fases de Upstream+Downstream + 2 gates, tudo pending/blocked — Operação (ADR-0002) fica de fora", () => {
    const plan = buildDeliveryPlan(null, null, EMPTY_ACTIVITY);
    expect(plan.total).toBe(NON_OPERATION_PHASE_COUNT + 2);
    expect(plan.done).toBe(0);
    expect(plan.items.filter((i) => i.kind === "phase")).toHaveLength(NON_OPERATION_PHASE_COUNT);
    expect(plan.items.filter((i) => i.kind === "gate")).toHaveLength(2);
    expect(plan.items.some((i) => i.stream === "operation")).toBe(false);
  });

  it("cada fase carrega label/agent/icon/stream do PHASE_CONTRACTS", () => {
    const plan = buildDeliveryPlan(null, null, EMPTY_ACTIVITY);
    const business = plan.items.find((i) => i.key === "business");
    expect(business?.label).toBe("Business Brief");
    expect(business?.agent).toBe("@business");
    expect(business?.stream).toBe("upstream");
  });

  it("gate-g1 vem logo após sprint-plan, gate-g2 logo após reviewer", () => {
    const plan = buildDeliveryPlan(null, null, EMPTY_ACTIVITY);
    const keys = plan.items.map((i) => i.key);
    expect(keys.indexOf("gate-g1")).toBe(keys.indexOf("sprint-plan") + 1);
    expect(keys.indexOf("gate-g2")).toBe(keys.indexOf("reviewer") + 1);
  });
});

describe("buildDeliveryPlan — status e gates derivados", () => {
  it("fase 'skipped' conta como concluída (não bloqueia, não fica pendente pra sempre)", () => {
    const state = parseDeliveryState("phases:\n  ux-design:\n    status: skipped");
    const plan = buildDeliveryPlan(state, null, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "ux-design")?.status).toBe("done");
  });

  it("gate-g1 fica 'blocked' enquanto falta qualquer fase de upstream", () => {
    const state = parseDeliveryState("phases:\n  business:\n    status: done");
    const plan = buildDeliveryPlan(state, null, EMPTY_ACTIVITY);
    const gate = plan.items.find((i) => i.key === "gate-g1");
    expect(gate?.status).toBe("blocked");
    expect(gate?.blockedBy).toContain("PRD");
  });

  it("gate-g1 fica 'done' quando todo upstream está concluído — gate-g2 continua blocked", () => {
    const plan = buildDeliveryPlan(parseDeliveryState(UPSTREAM_STATE), null, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "gate-g1")?.status).toBe("done");
    expect(plan.items.find((i) => i.key === "gate-g2")?.status).toBe("blocked");
  });

  it("os dois gates ficam 'done' quando upstream+downstream inteiros estão concluídos", () => {
    const plan = buildDeliveryPlan(parseDeliveryState(ALL_DONE_STATE), null, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "gate-g1")?.status).toBe("done");
    expect(plan.items.find((i) => i.key === "gate-g2")?.status).toBe("done");
    // devops/release/observability/incident/sustain (Operação) continuam de fora do "done" desta rodada
    expect(plan.done).toBe(11 + 2);
  });

  it("evento running sem repo_id conta como 'running' pra fase correspondente — mesmo bucket 'workspace' do cross-repo do Foundation", () => {
    const events = parseRunEvents(
      JSON.stringify({ run_id: "r1", event_type: "agent-started", timestamp: "2026-07-20T10:00:00Z", phase_id: "architecture" })
    );
    const activity = deriveActivity(events);
    const plan = buildDeliveryPlan(null, null, activity);
    expect(plan.items.find((i) => i.key === "architecture")?.status).toBe("running");
  });

  it("backend e frontend rodando ao mesmo tempo aparecem os DOIS como running (o garfo real)", () => {
    const events = parseRunEvents(
      [
        { run_id: "r1", event_type: "agent-started", timestamp: "2026-07-20T09:12:00Z", phase_id: "backend" },
        { run_id: "r2", event_type: "agent-started", timestamp: "2026-07-20T09:12:05Z", phase_id: "frontend" },
      ].map((e) => JSON.stringify(e)).join("\n")
    );
    const plan = buildDeliveryPlan(null, null, deriveActivity(events));
    expect(plan.items.find((i) => i.key === "backend")?.status).toBe("running");
    expect(plan.items.find((i) => i.key === "frontend")?.status).toBe("running");
  });
});

describe("buildDeliveryPlan — foco", () => {
  it("sem nenhum dado, o foco é a primeira fase pendente (business)", () => {
    const plan = buildDeliveryPlan(null, null, EMPTY_ACTIVITY);
    expect(plan.focus?.key).toBe("business");
  });

  it("aguardando revisão (agent-done) vence rodando, que vence pendente", () => {
    const events = parseRunEvents(
      [
        { run_id: "r1", event_type: "agent-started", timestamp: "2026-07-20T09:00:00Z", phase_id: "product" },
        { run_id: "r2", event_type: "agent-done", timestamp: "2026-07-20T10:00:00Z", phase_id: "business" },
      ].map((e) => JSON.stringify(e)).join("\n")
    );
    const activity = deriveActivity(events);
    const plan = buildDeliveryPlan(null, null, activity);
    expect(plan.focus?.key).toBe("business");
    expect(plan.focus?.status).toBe("review");
  });
});

describe("deliveryItemsForStreams", () => {
  it("filtra só os itens (fases+gates) dos streams pedidos", () => {
    const plan = buildDeliveryPlan(null, null, EMPTY_ACTIVITY);
    const items = deliveryItemsForStreams(plan, ["upstream", "downstream"]);
    expect(items.every((i) => i.stream === "upstream" || i.stream === "downstream")).toBe(true);
    expect(items.some((i) => i.stream === "operation")).toBe(false);
    // 7 upstream + 4 downstream fases + gate-g1 (upstream) + gate-g2 (downstream)
    expect(items).toHaveLength(7 + 4 + 2);
  });

  it("streams vazio devolve lista vazia", () => {
    const plan = buildDeliveryPlan(null, null, EMPTY_ACTIVITY);
    expect(deliveryItemsForStreams(plan, [])).toEqual([]);
  });
});
