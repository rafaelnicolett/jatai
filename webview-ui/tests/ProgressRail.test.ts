import { describe, it, expect } from "vitest";
import type { PlanItem, PlanItemStatus } from "@data";
import { computeRailSegments } from "../src/design-system/patterns/ProgressRail/computeRailSegments";

function item(status: PlanItemStatus, key: string = status): PlanItem {
  return { key, kind: "phase", label: key, agent: "@test", icon: "•", status, scope: "workspace" };
}

describe("computeRailSegments", () => {
  it("array vazio: total 0, sem segmentos, sem contagem de review", () => {
    const summary = computeRailSegments([]);
    expect(summary).toEqual({ total: 0, doneCount: 0, reviewCount: 0, segments: [] });
  });

  it("um único status: um segmento só, 100%", () => {
    const summary = computeRailSegments([item("done", "a"), item("done", "b")]);
    expect(summary.total).toBe(2);
    expect(summary.doneCount).toBe(2);
    expect(summary.segments).toEqual([{ status: "done", count: 2, pct: 100 }]);
  });

  it("mix dos 5 status: um segmento por status presente, na ordem done→running→review→blocked→pending", () => {
    const items = [
      item("pending", "p1"),
      item("blocked", "b1"),
      item("review", "r1"),
      item("running", "ru1"),
      item("done", "d1"),
      item("done", "d2"),
    ];
    const summary = computeRailSegments(items);
    expect(summary.total).toBe(6);
    expect(summary.segments.map((s) => s.status)).toEqual(["done", "running", "review", "blocked", "pending"]);
    expect(summary.segments.find((s) => s.status === "done")).toEqual({ status: "done", count: 2, pct: (2 / 6) * 100 });
  });

  it("reviewCount bate exatamente com a contagem de 'review' no array de entrada — nunca uma fonte separada", () => {
    const items = [item("review", "r1"), item("review", "r2"), item("done", "d1"), item("pending", "p1")];
    const summary = computeRailSegments(items);
    const manualCount = items.filter((i) => i.status === "review").length;
    expect(summary.reviewCount).toBe(manualCount);
    expect(summary.reviewCount).toBe(2);
  });

  it("status sem nenhum item não vira segmento (sem barra de largura 0 poluindo a trilha)", () => {
    const summary = computeRailSegments([item("done", "d1")]);
    expect(summary.segments).toHaveLength(1);
    expect(summary.segments.some((s) => s.status === "pending")).toBe(false);
  });
});
