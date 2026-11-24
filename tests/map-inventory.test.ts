import { describe, expect, it } from "vitest";
import type { FoundationState } from "../src/core/contracts/foundation-state-contract.pure";
import type { Initiative, InitiativesState } from "../src/core/contracts/initiatives-contract.pure";
import type { ReposInventory } from "../src/core/contracts/repos-contract.pure";
import type { RunEvent } from "../src/core/contracts/run-events-contract.pure";
import { parseRunEvents } from "../src/core/contracts/run-events-contract.pure";
import { deriveColmeia, type ColmeiaSnapshot } from "../src/core/plans/colmeia";
import { deriveIslandDetails } from "../src/core/plans/colmeia-detail";
import { personaOf } from "../src/core/plans/map-cast.pure";
import { groupProcesses } from "../src/core/plans/map-inventory.pure";

/**
 * F5.4 — o inventário da ilha: todos os processos (não só o gate) e o elenco
 * com persona. A descoberta é o caso mais rico: fases por repositório, fases
 * cross-repo, D1 por repo e as fases extras do assessment.
 */

const INVENTORY: ReposInventory = {
  version: 1,
  repos: [
    { id: "api", source: "git", scan_profile: "deep", has_frontend: false },
    { id: "web", source: "git", scan_profile: "deep", has_frontend: true },
  ],
};

function foundation(over: Partial<FoundationState> = {}): FoundationState {
  const done = (extra: Record<string, boolean> = {}) => ({ status: "done" as const, human_checklist: extra });
  return {
    phases: {
      domain: { status: "in-progress", human_checklist: {} },
      "business-context": { status: "pending", human_checklist: {} },
    },
    repos: {
      api: {
        phases: {
          "tech-stack": done({ "stack-identified": true }),
          arch: { status: "agent-done", human_checklist: {} },
          security: done(),
        },
        gate_d1: { status: "pending" },
      },
      web: {
        phases: {
          "tech-stack": done(),
          design: { status: "in-progress", human_checklist: {} },
          "test-coverage": { status: "pending", human_checklist: {} },
        },
        gate_d1: { status: "pending" },
      },
    },
    ...over,
  };
}

function initiative(over: Partial<Initiative> = {}): Initiative {
  return {
    id: "mod",
    name: "Modernização",
    status: "in-progress",
    type: "modernization",
    mode: "brownfield",
    scope: ["api", "web"],
    epics: ["epic-0: Fundação — rede de segurança", "epic-1: Migração"],
    roadmap_gate: { status: "approved" },
    risk_matrix_gate: { status: "pending" },
    planning_artifacts: [".github/artifacts/planning/mod/roadmap.md", ".github/artifacts/planning/mod/risk-matrix.md", "docs/adr/0001-api.md"],
    epic_status: {
      "epic-0": { status: "in-progress", items: { "task-0.1": { status: "done" }, "task-0.2": { status: "in-progress" } } },
      "epic-1": { status: "pending", items: { "task-1.1": { status: "blocked", reason: "espera o epic-0" } } },
    },
    ...over,
  };
}

function snapshot(active: Initiative | null, state: FoundationState = foundation()): ColmeiaSnapshot & { reposInventory: ReposInventory } {
  const initiatives: InitiativesState | null = active ? { active: active.id, initiatives: [active] } : null;
  return { initiatives, foundationState: state, deliveryState: null, reposInventory: INVENTORY };
}

function event(fields: Record<string, unknown>): RunEvent {
  return parseRunEvents(JSON.stringify({ run_id: "r", timestamp: "2026-11-18T12:00:00Z", initiative_id: "mod", ...fields }))[0]!;
}

function detailsOf(snap: ColmeiaSnapshot, events: RunEvent[] = []) {
  const vm = deriveColmeia(snap, events);
  return { vm, details: deriveIslandDetails(snap, vm, events) };
}

describe("inventário da ilha — descoberta do brownfield", () => {
  it("cobre todas as fases por repositório, as cross-repo e as extras do assessment", () => {
    const { details } = detailsOf(snapshot(initiative()));
    const discovery = details.find((d) => d.islandId === "discovery")!;
    const processes = discovery.processes ?? [];
    const labels = processes.map((p) => `${p.groupId}:${p.id}`);
    expect(labels).toContain("api:api/tech-stack");
    expect(labels).toContain("api:api/arch");
    expect(labels).toContain("api:api/security");
    expect(labels).toContain("web:web/design");
    expect(labels).toContain("web:web/test-coverage");
    expect(labels).toContain("workspace:domain");
    // O design só aparece no repositório com frontend.
    expect(labels.some((l) => l.startsWith("api:") && l.includes("design"))).toBe(false);
    // A fase que terminou no agente e espera o humano vira "review"; a que roda, "working".
    expect(processes.find((p) => p.id === "api/arch")?.status).toBe("review");
    expect(processes.find((p) => p.id === "web/design")?.status).toBe("working");
    expect(processes.find((p) => p.id === "workspace:domain" || p.id === "domain")?.status).toBe("working");
  });

  it("mostra D1 por repositório e o progresso do checklist humano", () => {
    const { details } = detailsOf(snapshot(initiative()));
    const discovery = details.find((d) => d.islandId === "discovery")!;
    const api = (discovery.processes ?? []).find((p) => p.id === "api/tech-stack")!;
    expect(api.gate).toBe("D1");
    expect(api.progress).toMatchObject({ total: 3 });
    expect(api.progress!.done).toBeGreaterThanOrEqual(1);
    expect(discovery.checklist?.gate).toBe("D1");
    expect(discovery.checklist?.items.some((i) => i.label === "api · Tech Stack")).toBe(true);
  });

  it("dá persona e responsabilidade ao elenco, inclusive a segurança", () => {
    const { details } = detailsOf(snapshot(initiative()));
    const discovery = details.find((d) => d.islandId === "discovery")!;
    const characters = discovery.characters ?? [];
    const meli = characters.find((c) => c.agentId === "@tech-mapper")!;
    expect(meli.name).toBe("Meli");
    expect(meli.archetype).toBe("A Cartógrafa");
    expect(meli.status).toBe("queued");
    expect(meli.handles).toContain("Tech Stack");
    const ferrao = characters.find((c) => c.agentId === "@security-auditor")!;
    expect(ferrao.name).toBe("Ferrão");
    expect(ferrao.handles).toContain("Segurança");
  });
});

describe("inventário da ilha — execução, planejamento e operação", () => {
  it("lista todas as tarefas do épico, com o agente e o motivo do bloqueio", () => {
    const events = [event({ event_type: "agent-started", agent_id: "@migration-agent", task_id: "epic-0/task-0.2", phase_id: "execution" })];
    const { details } = detailsOf(snapshot(initiative()), events);
    const execution = details.find((d) => d.islandId === "execution")!;
    const byId = new Map((execution.processes ?? []).map((p) => [p.id, p]));
    expect(byId.get("epic-0/task-0.1")?.status).toBe("done");
    expect(byId.get("epic-0/task-0.2")).toMatchObject({ status: "working", agent: "@migration-agent" });
    expect(byId.get("epic-1/task-1.1")).toMatchObject({ status: "blocked", blockedBy: "espera o epic-0" });
    expect(execution.characters?.find((c) => c.agentId === "@migration-agent")?.status).toBe("working");
  });

  it("o planejamento conta roadmap, matriz de risco e ADRs, não só o gate D2", () => {
    const { details } = detailsOf(snapshot(initiative()));
    const planning = details.find((d) => d.islandId === "planning")!;
    expect(planning.processes?.map((p) => [p.id, p.status, p.gate])).toEqual([
      ["roadmap", "done", "D2"],
      ["risk-matrix", "review", "D2"],
      ["adr", "done", undefined],
    ]);
  });

  it("a operação mostra as cinco responsabilidades mesmo sem delivery-state", () => {
    const { details } = detailsOf(snapshot(initiative()));
    const operation = details.find((d) => d.islandId === "operation")!;
    expect(operation.processes?.map((p) => p.agent)).toEqual(["@devops", "@release", "@observability", "@incident", "@sustain"]);
    expect(operation.characters?.find((c) => c.agentId === "@release")?.name).toBe("Selo");
  });
});

describe("inventário da ilha — descoberta sem iniciativa", () => {
  it("o mapa da Foundation tem a descoberta e o planejamento adormecido", () => {
    const { vm, details } = detailsOf(snapshot(null));
    expect(vm.flow).toBe("foundation");
    expect(vm.islands.map((i) => i.label)).toEqual(["Descoberta", "Planejamento"]);
    const discovery = details.find((d) => d.islandId === "discovery")!;
    expect(discovery.processes?.length).toBeGreaterThan(5);
    expect(discovery.processes?.some((p) => p.repoId === "api")).toBe(true);
    expect(discovery.checklist?.gate).toBe("D1");
    expect(details.find((d) => d.islandId === "planning")!.processes).toEqual([]);
  });

  it("agrupa os processos por repositório e por workspace", () => {
    const { details } = detailsOf(snapshot(null));
    const groups = groupProcesses(details.find((d) => d.islandId === "discovery")!.processes ?? []);
    expect(groups.map((g) => g.label)).toEqual(expect.arrayContaining(["api", "web", "Workspace"]));
  });
});

describe("elenco — fallback", () => {
  it("agente fora do elenco ganha nome derivado do id, sem sumir do mapa", () => {
    const persona = personaOf("@general-purpose");
    expect(persona.name).toBe("General Purpose");
    expect(persona.archetype).toBe("Agente da colmeia");
  });
});
