import { describe, it, expect } from "vitest";
import type { DeliveryPlan, DeliveryState, SprintGroup, SprintItem, SprintItemStatus } from "@data";
import { sprintAggregateStatus, greenfieldBoardCards } from "../src/features/delivery/computeGreenfieldBoard";

function sprintItem(id: string, status: SprintItemStatus): SprintItem {
  return { id, title: id, status, dependsOn: [], tags: [] };
}

function sprint(items: SprintItem[]): SprintGroup {
  return { id: "s1", name: "Sprint 1", items };
}

describe("sprintAggregateStatus", () => {
  it("sprint vazia (só descoped ou nada) é pendente", () => {
    expect(sprintAggregateStatus(sprint([]))).toBe("pending");
    expect(sprintAggregateStatus(sprint([sprintItem("a", "descoped")]))).toBe("pending");
  });

  it("prioriza blocked sobre review/running/done", () => {
    const s = sprint([sprintItem("a", "done"), sprintItem("b", "review"), sprintItem("c", "blocked")]);
    expect(sprintAggregateStatus(s)).toBe("blocked");
  });

  it("prioriza review sobre running", () => {
    const s = sprint([sprintItem("a", "in-progress"), sprintItem("b", "review")]);
    expect(sprintAggregateStatus(s)).toBe("review");
  });

  it("running quando nenhum blocked/review mas algo em progresso", () => {
    const s = sprint([sprintItem("a", "done"), sprintItem("b", "in-progress")]);
    expect(sprintAggregateStatus(s)).toBe("running");
  });

  it("done só quando TODOS os itens não-descoped estão done", () => {
    const allDone = sprint([sprintItem("a", "done"), sprintItem("b", "done"), sprintItem("c", "descoped")]);
    expect(sprintAggregateStatus(allDone)).toBe("done");

    const notAllDone = sprint([sprintItem("a", "done"), sprintItem("b", "backlog")]);
    expect(sprintAggregateStatus(notAllDone)).toBe("pending");
  });
});

function plan(items: DeliveryPlan["items"]): DeliveryPlan {
  return { items, sprintBacklog: null, done: 0, total: items.length, focus: null };
}

describe("greenfieldBoardCards — item 3.8 (status por artefato)", () => {
  const businessItem: DeliveryPlan["items"][number] = {
    key: "business", kind: "phase", label: "Business", agent: "@business", icon: "🧭",
    status: "blocked", scope: "workspace", stream: "upstream",
  };

  it("sem artefato reportado nenhum: 1 card por output do contrato, lane = status da fase", () => {
    const cards = greenfieldBoardCards("business", plan([businessItem]), null);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.lane).toBe("blocked");
  });

  it("artefato reportado sem `status` próprio: cai no status da fase (comportamento pré-3.8, preservado)", () => {
    const deliveryState: DeliveryState = {
      phases: { business: { status: "in-progress", human_checklist: {}, artifacts: [{ path: ".github/artifacts/business-brief.md" }] } },
    };
    const cards = greenfieldBoardCards("business", plan([businessItem]), deliveryState);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.lane).toBe("blocked");
  });

  it("artefato reportado COM `status` próprio: lane vem do artefato, não da fase — N artefatos podem cair em lanes diferentes", () => {
    const deliveryState: DeliveryState = {
      phases: {
        business: {
          status: "in-progress",
          human_checklist: {},
          artifacts: [
            { path: "a.md", status: "done" },
            { path: "b.md", status: "pending" },
            { path: "c.md", status: "skipped" },
          ],
        },
      },
    };
    const cards = greenfieldBoardCards("business", plan([businessItem]), deliveryState);
    expect(cards.map((c) => c.lane)).toEqual(["done", "pending", "done"]);
  });
});
