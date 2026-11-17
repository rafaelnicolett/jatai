import { describe, it, expect } from "vitest";
import { deriveColmeia, initiativeFlow, type ColmeiaSnapshot, type ColmeiaVM } from "../src/core/plans/colmeia";
import { deriveIslandDetails, MAX_PLANNED_POTS, type ColmeiaDetailSnapshot, type IslandDetail } from "../src/core/plans/colmeia-detail";
import { agentRoleFromDescription, agentRoleIndex, normalizeAgentId, AGENT_ROLE_MAX } from "../src/core/contracts/agent-directory.pure";
import { parseRunEvents, type RunEvent } from "../src/core/contracts/run-events-contract.pure";
import { activeInitiative, type Initiative, type InitiativesState } from "../src/core/contracts/initiatives-contract.pure";
import type { FoundationState } from "../src/core/contracts/foundation-state-contract.pure";

/**
 * Os detalhes de uma ilha (F5.3): responsabilidade do agente, passo atual,
 * checklist do gate e favos por vir. Aditivo ao `deriveColmeia`, que não muda.
 * O estado é montado em memória e os eventos passam pelo parser de sempre.
 */

const MISSAO = "mod-missao-open-source";

function missao(over: Partial<Initiative> = {}): Initiative {
  return {
    id: MISSAO,
    name: "Missão Open Source",
    status: "in-progress",
    type: "modernization",
    mode: "brownfield",
    scope: ["jatai"],
    epics: ["epic-0: Fundação — repositório isolado", "epic-1: Marca"],
    roadmap_gate: { status: "approved" },
    risk_matrix_gate: { status: "approved" },
    gate_d2: { status: "approved" },
    planning_artifacts: [".github/artifacts/planning/mod-missao-open-source/roadmap.md", ".github/artifacts/planning/mod-missao-open-source/risk-matrix.md"],
    epic_status: {
      "epic-0": {
        status: "in-progress",
        items: {
          "task-0.1": { status: "done", artifacts: [".github/artifacts/execution/feature-report-jatai-f0.1.md"] },
          "task-0.2": { status: "in-progress" },
          "task-0.3": { status: "blocked", reason: "bloqueada por T0.2" },
          "task-0.4": { status: "pending" },
        },
      },
    },
    ...over,
  };
}

const DISCOVERY_DONE = (status: "done" | "agent-done" | "in-progress" | "pending") => ({ status, human_checklist: {} });

const FOUNDATION: FoundationState = {
  phases: {},
  repos: {
    jatai: {
      phases: {
        "tech-stack": DISCOVERY_DONE("done"),
        arch: DISCOVERY_DONE("agent-done"),
        "coding-archaeology": DISCOVERY_DONE("in-progress"),
        quality: DISCOVERY_DONE("pending"),
      },
      gate_d1: { status: "approved" },
    },
  },
};

function snapshot(initiatives: Initiative[] = [missao()], active = initiatives[0]!.id, foundation: FoundationState | null = FOUNDATION): ColmeiaDetailSnapshot {
  const state: InitiativesState = { active, initiatives };
  return { initiatives: state, foundationState: foundation, deliveryState: null, reposInventory: { repos: [{ id: "jatai", has_frontend: false }] } };
}

let clock = 0;
function ev(fields: Record<string, unknown>): RunEvent {
  clock += 1;
  const line = JSON.stringify({ run_id: "r-detalhe", timestamp: `2026-11-16T12:00:${String(clock % 60).padStart(2, "0")}.000Z`, initiative_id: MISSAO, ...fields });
  return parseRunEvents(line)[0]!;
}

const CATALOG = [
  { id: "migration-agent", role: "Migra versão de runtime ou framework de forma incremental." },
  { id: "@reviewer", role: "Revisa cada PR." },
];

function details(snap: ColmeiaDetailSnapshot, events: RunEvent[] = [], catalog = CATALOG): { vm: ColmeiaVM; all: IslandDetail[]; by: (id: string) => IslandDetail } {
  const flow = initiativeFlow(activeInitiative(snap.initiatives));
  const vm = deriveColmeia(snap as ColmeiaSnapshot, events, flow);
  const all = deriveIslandDetails(snap, vm, events, catalog);
  return { vm, all, by: (id) => all.find((d) => d.islandId === id)! };
}

describe("detalhes da ilha — responsabilidade e passo atual dos agentes", () => {
  const started = ev({ event_type: "agent-started", agent_id: "@migration-agent", task_id: "epic-0/task-0.2", phase_id: "execution", message: "semeando repos/jatai", harness: "claude-code" });

  it("o agente que trabalha leva a responsabilidade do frontmatter, a tarefa e o passo atual; a fila fica sem passo", () => {
    const execution = details(snapshot(), [started]).by("execution");
    const migration = execution.agents.find((a) => a.agentId === "@migration-agent")!;
    expect(migration).toMatchObject({
      status: "working",
      role: "Migra versão de runtime ou framework de forma incremental.",
      taskId: "epic-0/task-0.2",
      step: "semeando repos/jatai",
    });
    const queued = execution.agents.find((a) => a.agentId === "@test-backfill-agent")!;
    expect(queued.status).toBe("queued");
    expect(queued.step).toBeUndefined();
    expect(queued.role).toBeUndefined();
    expect(execution.agents.find((a) => a.agentId === "@reviewer")?.role).toBe("Revisa cada PR.");
  });

  it("o passo atual é o último início ou progresso do agente, cortado em 140 caracteres (R8)", () => {
    const progress = ev({ event_type: "agent-progress", agent_id: "@migration-agent", task_id: "epic-0/task-0.2", message: "x".repeat(300) });
    const step = details(snapshot(), [started, progress]).by("execution").agents.find((a) => a.agentId === "@migration-agent")!.step!;
    expect([...step]).toHaveLength(140);
  });

  it("evento de outra iniciativa não vira passo atual; metadados fora da lista nunca saem", () => {
    const other = ev({ event_type: "agent-progress", agent_id: "@migration-agent", initiative_id: "outra", message: "da outra iniciativa", metadata: { diff: "+ segredo" } });
    const { all } = details(snapshot(), [started, other]);
    expect(JSON.stringify(all)).not.toContain("da outra iniciativa");
    expect(JSON.stringify(all)).not.toContain("segredo");
  });

  it("a abelha bloqueada leva o motivo, e a guarda da ilha aparece nos detalhes", () => {
    const blocked = ev({ event_type: "agent-started", agent_id: "@migration-agent", task_id: "epic-0/task-0.3", message: "tentando a migração" });
    const decision = ev({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" });
    const execution = details(snapshot(), [blocked, decision]).by("execution");
    expect(execution.agents.find((a) => a.agentId === "@migration-agent")).toMatchObject({ status: "blocked", reason: "bloqueada por T0.2", step: "tentando a migração" });
    expect(execution.guards).toEqual([expect.objectContaining({ kind: "decision", reason: "titularidade do código" })]);
  });

  it("id do catálogo com ou sem arroba é o mesmo agente", () => {
    expect(normalizeAgentId("migration-agent")).toBe("@migration-agent");
    expect(normalizeAgentId("@migration-agent")).toBe("@migration-agent");
    expect([...agentRoleIndex([{ id: "migration-agent", role: "a" }, { id: "@migration-agent", role: "b" }])]).toEqual([["@migration-agent", "a"]]);
  });
});

describe("detalhes da ilha — checklist do gate e favos por vir", () => {
  it("Execução: o que falta para o D3, item a item, com o motivo do bloqueio", () => {
    const { checklist } = details(snapshot()).by("execution");
    expect(checklist?.gate).toBe("D3");
    expect(checklist?.items.map((i) => [i.key, i.status])).toEqual([
      ["epic-0/task-0.1", "done"],
      ["epic-0/task-0.2", "in-progress"],
      ["epic-0/task-0.3", "blocked"],
      ["epic-0/task-0.4", "open"],
    ]);
    expect(checklist?.items[2]?.reason).toBe("bloqueada por T0.2");
  });

  it("os favos vazios são as entregas por vir da ilha atual, no máximo seis", () => {
    expect(details(snapshot()).by("execution").plannedPots).toBe(3);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`task-1.${i}`, { status: "pending" }]));
    const big = missao({ epic_status: { "epic-0": { status: "in-progress", items: many } } });
    expect(details(snapshot([big])).by("execution").plannedPots).toBe(MAX_PLANNED_POTS);
    expect(details(snapshot()).by("planning").plannedPots).toBe(0);
  });

  it("Planejamento: o D2 pede o roadmap e a matriz de risco aprovados", () => {
    expect(details(snapshot()).by("planning").checklist).toEqual({
      gate: "D2",
      items: [
        { key: "roadmap_gate", label: "Roadmap aprovado", status: "done" },
        { key: "risk_matrix_gate", label: "Matriz de risco aprovada", status: "done" },
      ],
    });
    const pending = missao({ risk_matrix_gate: { status: "pending" }, roadmap_gate: undefined });
    expect(details(snapshot([pending])).by("planning").checklist?.items.map((i) => i.status)).toEqual(["open", "open"]);
  });

  it("Planejamento concluído mostra as entregas, e os agentes dele aparecem concluídos", () => {
    const planning = details(snapshot()).by("planning");
    expect(planning.pots.map((p) => p.artifactPath.split("/").pop())).toEqual(["roadmap.md", "risk-matrix.md"]);
    expect(new Set(planning.agents.map((a) => a.status))).toEqual(new Set(["done"]));
  });

  it("Descoberta: as fases do D1 do repositório, com 'espera você' para o agente que terminou, sem a de design quando o repo não tem frontend", () => {
    const discovery = details(snapshot()).by("discovery");
    const rows = Object.fromEntries((discovery.checklist?.items ?? []).map((i) => [i.key, i.status]));
    expect(discovery.checklist?.gate).toBe("D1");
    expect(rows["jatai/tech-stack"]).toBe("done");
    expect(rows["jatai/arch"]).toBe("review");
    expect(rows["jatai/coding-archaeology"]).toBe("in-progress");
    expect(rows["jatai/quality"]).toBe("open");
    expect(rows["jatai/design"]).toBeUndefined();
    expect(discovery.checklist?.items[0]?.label).toBe("Tech Stack");
  });

  it("com mais de um repositório no escopo, cada linha leva o nome do repositório", () => {
    const foundation: FoundationState = { phases: {}, repos: { a: { phases: { "tech-stack": DISCOVERY_DONE("done") }, gate_d1: { status: "pending" } }, b: { phases: {}, gate_d1: { status: "pending" } } } };
    const two = missao({ scope: ["a", "b"] });
    const labels = details(snapshot([two], two.id, foundation)).by("discovery").checklist!.items.map((i) => i.label);
    expect(labels).toContain("a · Tech Stack");
    expect(labels).toContain("b · Tech Stack");
  });

  it("Operação adormecida não tem checklist: acorda depois do D3, e os agentes dormem", () => {
    const operation = details(snapshot()).by("operation");
    expect(operation.checklist).toBeNull();
    expect(operation).toMatchObject({ state: "sleeping", wakesAfterGate: "D3" });
    expect(new Set(operation.agents.map((a) => a.status))).toEqual(new Set(["sleeping"]));
    expect(operation.plannedPots).toBe(0);
  });

  it("hotfix: cada onda lista os próprios itens, sem gate", () => {
    const hotfix: Initiative = {
      id: "hotfix-x", name: "Hotfix X", status: "in-progress", type: "hotfix",
      waves: ["wave-1: Diagnóstico — causa raiz", "wave-2: Correção — com testes", "wave-3: Validação — sem regressão"],
      wave_status: { "wave-1": { status: "done", items: { "item-1.1": { status: "done" } } }, "wave-2": { status: "in-progress", items: { "item-2.1": { status: "failed", reason: "teste caiu" } } } },
    };
    const { by, vm } = details(snapshot([hotfix]));
    expect(vm.flow).toBe("waves");
    expect(by("wave-1").checklist).toEqual({ items: [{ key: "wave-1/item-1.1", label: "wave-1/item-1.1", status: "done" }] });
    expect(by("wave-2").checklist?.items[0]).toMatchObject({ status: "failed", reason: "teste caiu" });
    // A onda futura ainda não tem itens gravados: nada a listar.
    expect(by("wave-3").checklist).toBeNull();
  });

  it("sem iniciativa ativa não há detalhe nenhum", () => {
    const none: ColmeiaDetailSnapshot = { initiatives: null, foundationState: null, deliveryState: null };
    const vm = deriveColmeia(none, [], undefined);
    expect(deriveIslandDetails(none, vm, [], CATALOG)).toEqual([]);
  });
});

describe("o item do feed leva a tarefa do evento (aditivo)", () => {
  it("o evento com tarefa dá um item com taskId; o sem tarefa continua com as mesmas chaves de antes", () => {
    const withTask = ev({ event_type: "agent-started", agent_id: "@migration-agent", task_id: "epic-0/task-0.2", phase_id: "execution" });
    const withoutTask = ev({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: ".github/artifacts/execution/r.md" });
    const vm = details(snapshot(), [withTask, withoutTask]).vm;
    expect(vm.feed.find((f) => f.eventType === "agent-started")).toMatchObject({ taskId: "epic-0/task-0.2", agentId: "@migration-agent" });
    expect(Object.keys(vm.feed.find((f) => f.eventType === "artifact-written")!).sort()).toEqual(["agentId", "artifactPath", "eventType", "islandId", "text", "timestamp"]);
  });
});

describe("responsabilidade do agente — o texto do frontmatter", () => {
  it("tira o prefixo de stream do kit e começa em maiúscula", () => {
    expect(agentRoleFromDescription("Execution: migra versão de runtime ou framework.")).toBe("Migra versão de runtime ou framework.");
    expect(agentRoleFromDescription("Discovery (opcional): avalia a maturidade do projeto.")).toBe("Avalia a maturidade do projeto.");
    expect(agentRoleFromDescription("Side-car: scan de CVEs, OWASP e segredos.")).toBe("Scan de CVEs, OWASP e segredos.");
  });

  it("não corta uma frase que só tem dois-pontos no meio, junta quebras de linha e limita o tamanho", () => {
    expect(agentRoleFromDescription("Revisa o PR e confere: testes verdes e cobertura.")).toBe("Revisa o PR e confere: testes verdes e cobertura.");
    expect(agentRoleFromDescription("uma\n  frase   em\nvárias linhas")).toBe("Uma frase em várias linhas");
    expect([...agentRoleFromDescription("a".repeat(500))]).toHaveLength(AGENT_ROLE_MAX);
    expect(agentRoleFromDescription("   ")).toBe("");
  });
});
