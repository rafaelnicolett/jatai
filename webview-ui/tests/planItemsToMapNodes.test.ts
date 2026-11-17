import { describe, it, expect } from "vitest";
import type { PlanItem, PlanItemStatus } from "@data";
import { planItemsToMapNodes } from "../src/design-system/patterns/PhaseMap/planItemsToMapNodes";

function item(key: string, status: PlanItemStatus, kind: "phase" | "gate" = "phase"): PlanItem {
  return { key, kind, label: key, agent: "@test", icon: "•", status, scope: "workspace" };
}

describe("planItemsToMapNodes", () => {
  it("array vazio devolve array vazio", () => {
    expect(planItemsToMapNodes([])).toEqual([]);
  });

  it("preserva a ordem e projeta key/label/status/kind, 1:1", () => {
    const items = [item("business", "done"), item("product", "running"), item("ux-design", "pending")];
    expect(planItemsToMapNodes(items)).toEqual([
      { key: "business", label: "business", status: "done", kind: "phase" },
      { key: "product", label: "product", status: "running", kind: "phase" },
      { key: "ux-design", label: "ux-design", status: "pending", kind: "phase" },
    ]);
  });

  it("por padrão inclui gates (includeGates default true)", () => {
    const items = [item("business", "done"), item("repo-a/gate-d1", "review", "gate")];
    const nodes = planItemsToMapNodes(items);
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toEqual({ key: "repo-a/gate-d1", label: "repo-a/gate-d1", status: "review", kind: "gate" });
  });

  it("includeGates:false remove itens kind:gate, preservando os demais na mesma ordem", () => {
    const items = [
      item("business", "done"),
      item("gate-g1", "blocked", "gate"),
      item("product", "pending"),
    ];
    const nodes = planItemsToMapNodes(items, { includeGates: false });
    expect(nodes.map((n) => n.key)).toEqual(["business", "product"]);
  });
});
