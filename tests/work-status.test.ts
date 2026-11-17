import { describe, it, expect } from "vitest";
import { gateClosure, readWorkStatus, statusRequiresReason, WORK_STATUSES } from "../src/core/contracts/work-status.pure";
import { deriveWorkStatus } from "../src/core/plans/work-status-view";
import { buildDeliveryPlan } from "../src/core/plans/delivery-plan";
import { parseDeliveryState } from "../src/core/contracts/delivery-state-contract.pure";
import { parseInitiativesYaml } from "../src/core/contracts/initiatives-contract.pure";
import type { LiveActivity } from "../src/core/contracts/run-events-contract.pure";

/** F6.5 (ADR-0022): o vocabulário, a leitura sem rebaixamento e o fechamento de gate, sem VS Code. */

const NO_ACTIVITY = { running: [], awaiting: [], blocked: [], recent: [], runningByKey: [] } as unknown as LiveActivity;

describe("vocabulário de trabalho (ADR-0022)", () => {
  it("sete status; só blocked, failed e cancelled exigem motivo", () => {
    expect([...WORK_STATUSES]).toEqual(["pending", "in-progress", "blocked", "failed", "done", "skipped", "cancelled"]);
    expect(WORK_STATUSES.filter(statusRequiresReason)).toEqual(["blocked", "failed", "cancelled"]);
  });

  it("leitura: ausente vale o fallback; conhecido vale ele mesmo; o resto vira unknown com o texto", () => {
    expect(readWorkStatus(undefined, WORK_STATUSES, "pending")).toEqual({ status: "pending" });
    expect(readWorkStatus(" blocked ", WORK_STATUSES, "pending")).toEqual({ status: "blocked" });
    expect(readWorkStatus("terminado", WORK_STATUSES, "pending")).toEqual({ status: "unknown", text: "terminado" });
  });
});

describe("gateClosure (§3)", () => {
  it("fecha com done, skipped e cancelled, e lista cada cancelado com o motivo", () => {
    const c = gateClosure([
      { key: "a", status: "done" },
      { key: "b", status: "skipped" },
      { key: "c", status: "cancelled", reason: "cortado" },
    ]);
    expect(c).toEqual({ closed: true, open: [], cancelled: [{ key: "c", status: "cancelled", reason: "cortado" }] });
  });

  it("blocked, failed, aberto e desconhecido impedem o gate", () => {
    const c = gateClosure([
      { key: "a", status: "blocked", reason: "x" },
      { key: "b", status: "failed", reason: "y" },
      { key: "c", status: "in-progress" },
      { key: "d", status: "unknown" },
    ]);
    expect(c.closed).toBe(false);
    expect(c.open.map((i) => i.key)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("deriveWorkStatus — o campo workStatus do snapshot do Cockpit", () => {
  it("fase com status desconhecido gera aviso e fica aberta no G1", () => {
    const ds = parseDeliveryState("phases:\n  business:\n    status: terminada\n");
    const view = deriveWorkStatus(null, ds);
    expect(view.entries).toEqual([{ scope: "phase", key: "business", status: "unknown", statusText: "terminada" }]);
    expect(view.warnings).toHaveLength(1);
    expect(view.warnings[0]).toContain("'terminada'");
    expect(view.gates.find((g) => g.gate === "G1")!.open.map((i) => i.key)).toContain("business");
  });

  it("iniciativa cancelada leva o motivo", () => {
    const { state } = parseInitiativesYaml("initiatives:\n  - id: x\n    status: cancelled\n    reason: mudou a prioridade\n");
    expect(deriveWorkStatus(state, null).entries[0]).toEqual({ scope: "initiative", key: "x", status: "cancelled", reason: "mudou a prioridade" });
  });
});

describe("plano de delivery com o vocabulário novo", () => {
  it("blocked e failed viram condição de bloqueio com o motivo; cancelled conta como fechado", () => {
    const ds = parseDeliveryState(
      "phases:\n  business:\n    status: blocked\n    reason: falta o brief\n  product:\n    status: failed\n    reason: PRD inválido\n  ux-design:\n    status: cancelled\n    reason: sem frontend\n"
    );
    const plan = buildDeliveryPlan(ds, null, NO_ACTIVITY);
    const item = (key: string) => plan.items.find((i) => i.key === key)!;
    expect(item("business")).toMatchObject({ status: "blocked", blockedBy: "falta o brief" });
    expect(item("product")).toMatchObject({ status: "blocked", blockedBy: "PRD inválido" });
    expect(item("ux-design").status).toBe("done");
  });
});
