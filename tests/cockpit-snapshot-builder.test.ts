import { describe, it, expect } from "vitest";
import { CockpitSnapshotBuilder, type CockpitDataSources } from "../src/views/cockpit/CockpitSnapshotBuilder";
import type { OnDataIssue } from "../src/data/data-health";

/**
 * F3.8 (CK2) — o builder do snapshot do Cockpit com fontes falsas. O golden
 * CK1 cobre a montagem real; aqui, a ordem das leituras (que define a ordem
 * dos avisos no snapshot) e a delivery sintetizada quando falta o arquivo.
 */

function sources(over: Partial<CockpitDataSources> = {}, calls: string[] = []): CockpitDataSources {
  const warn = (name: string) => (_root: string, onError: OnDataIssue): null => {
    calls.push(name);
    onError({ source: name, message: `aviso de ${name}` });
    return null;
  };
  return {
    loadConfig: async () => (calls.push("config"), null),
    isConfigured: async () => (calls.push("isConfigured"), false),
    loadRepos: warn("repos"),
    loadFoundationState: warn("foundation"),
    loadContextRepos: warn("context"),
    loadRepoGraph: warn("graph"),
    loadRunEvents: (_r, _l, onError) => (calls.push("runs"), onError({ source: "runs", message: "aviso de runs" }), []),
    readInitiatives: async (_r, onError) => (calls.push("initiatives"), onError({ source: "initiatives", message: "aviso de initiatives" }), null),
    readDeliveryState: async () => (calls.push("delivery"), null),
    loadSprintBacklog: () => (calls.push("sprint"), null),
    loadOperationsSnapshot: () => (calls.push("operations"), { devops: null, observability: null, incidents: null, sustain: null }),
    kitStatus: () => (calls.push("kit"), null),
    ...over,
  };
}

const settings = (): { approvalFrictionFields: string[]; deliveryHierarchy: "legacy"; notificationsLastSeenAt: null } => ({
  approvalFrictionFields: ["merge_block"],
  deliveryHierarchy: "legacy",
  notificationsLastSeenAt: null,
});

describe("CockpitSnapshotBuilder", () => {
  it("lê as fontes sempre na mesma ordem e guarda os avisos nessa ordem", async () => {
    const calls: string[] = [];
    const built = await new CockpitSnapshotBuilder(sources({}, calls)).build("/ws", settings);
    expect(calls).toEqual(["config", "isConfigured", "repos", "foundation", "context", "graph", "runs", "initiatives", "delivery", "sprint", "operations", "kit"]);
    expect(built.warnings.map((w) => w.source)).toEqual(["repos", "foundation", "context", "graph", "runs", "initiatives"]);
    expect(built.snapshot.warnings).toBe(built.warnings);
    expect(built.snapshot.approvalFrictionFields).toEqual(["merge_block"]);
  });

  it("sem delivery-state no disco, sintetiza a partir da fase da iniciativa ativa", async () => {
    const built = await new CockpitSnapshotBuilder(
      sources({
        readInitiatives: async () => ({ active: "a", initiatives: [{ id: "a", name: "A", status: "in-progress", current_phase: "product" }] }) as never,
      })
    ).build("/ws", settings);
    expect(built.snapshot.deliveryState).not.toBeNull();
    expect(Object.keys(built.snapshot.deliveryState!.phases)).toContain("product");
  });
});
