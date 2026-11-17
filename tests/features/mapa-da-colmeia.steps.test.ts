import { describe, it, expect } from "vitest";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { deriveColmeia, type ColmeiaSnapshot, type ColmeiaVM } from "../../src/core/plans/colmeia";
import { parseRunEvents, type RunEvent } from "../../src/core/contracts/run-events-contract.pure";
import type { Initiative, InitiativesState } from "../../src/core/contracts/initiatives-contract.pure";
import type { FoundationState } from "../../src/core/contracts/foundation-state-contract.pure";

/**
 * Step definitions de `mapa-da-colmeia.feature` (F5.2), sobre a função pura
 * `deriveColmeia`: o estado é montado em memória, e os eventos passam pelo
 * mesmo parser que lê `runs/*.jsonl` (o que o mapa recebe do Cockpit).
 */
const FEATURE = path.join(__dirname, "mapa-da-colmeia.feature");

const MISSAO = "mod-missao-open-source";
const HOTFIX = "hotfix-wizard-intro-blank-screen";

/** "Missão Open Source": modernização com D1 (repo jatai) e D2 aprovados, no Epic 0 · Fundação. */
function missao(over: Partial<Initiative> = {}): Initiative {
  return {
    id: MISSAO,
    name: "Missão Open Source",
    status: "in-progress",
    type: "modernization",
    mode: "brownfield",
    epics: ["epic-0: Fundação — repositório isolado e rede de segurança", "epic-1: Marca Jataí"],
    gate_d2: { status: "approved" },
    epic_status: { "epic-0": { status: "in-progress", items: { "task-0.1": { status: "pending" } } } },
    ...over,
  };
}

function hotfix(): Initiative {
  return {
    id: HOTFIX,
    name: "Hotfix: tela 1 do Wizard em branco",
    status: "in-progress",
    type: "hotfix",
    waves: ["wave-1: Diagnóstico — causa raiz", "wave-2: Correção — com testes", "wave-3: Validação — sem regressão"],
  };
}

const FOUNDATION_D1_OK: FoundationState = { phases: {}, repos: { jatai: { phases: {}, gate_d1: { status: "approved" } } } };

function snapshot(active: string | null, initiatives: Initiative[] = [missao()]): ColmeiaSnapshot {
  const state: InitiativesState | null = active === null ? null : { active, initiatives };
  return { initiatives: state, foundationState: FOUNDATION_D1_OK, deliveryState: null };
}

let clock = 0;
/** Um evento como o mapa o recebe: uma linha de `runs/*.jsonl` lida pelo parser de sempre. */
function ev(fields: Record<string, unknown>): RunEvent {
  clock += 1;
  const line = JSON.stringify({ run_id: "r-bdd", timestamp: `2026-11-15T12:00:${String(clock % 60).padStart(2, "0")}.000Z`, initiative_id: MISSAO, ...fields });
  return parseRunEvents(line)[0]!;
}

/**
 * Um aviso do hook do kit (SubagentStart/SubagentStop): só tipo, agente e harness.
 * O Claude Code não informa iniciativa, fase nem tarefa; quem mostra resolve pela iniciativa ativa.
 */
function hook(type: "agent-started" | "agent-done", agent: string): RunEvent {
  clock += 1;
  const line = JSON.stringify({ run_id: "r-hook", event_type: type, timestamp: `2026-11-15T12:00:${String(clock % 60).padStart(2, "0")}.000Z`, agent_id: agent, harness: "claude-code" });
  return parseRunEvents(line)[0]!;
}

const started = (task: string, agent = "@migration-agent"): RunEvent => ev({ event_type: "agent-started", agent_id: agent, task_id: task, phase_id: "execution", harness: "claude-code" });
const done = (task: string, agent = "@migration-agent"): RunEvent => ev({ event_type: "agent-done", agent_id: agent, task_id: task, phase_id: "execution", harness: "claude-code" });

const island = (vm: ColmeiaVM, label: string) => vm.islands.find((i) => i.label === label)!;
const islandId = (vm: ColmeiaVM, label: string): string => island(vm, label).id;
const workingBees = (vm: ColmeiaVM) => vm.bees.filter((b) => b.state === "working");

function blockedOrFailed(status: "blocked" | "failed", reason: string, shown: string): void {
  const vm = deriveColmeia(
    snapshot(MISSAO, [missao({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status, reason } } } } })]),
    [started("epic-0/task-0.2")]
  );
  const bee = vm.bees.find((b) => b.taskId === "epic-0/task-0.2")!;
  expect(bee).toMatchObject({ state: "blocked", islandId: "execution", reason: shown, agentId: "@migration-agent" });
  expect(island(vm, "Execução").agents.find((a) => a.agentId === "@migration-agent")!.status).toBe("blocked");
}

function anyHarness(harness: string): void {
  const vm = deriveColmeia(snapshot(MISSAO), [ev({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: "repos/jatai/README.md", harness })]);
  expect(vm.feed[0]).toMatchObject({ islandId: "execution", agentId: "@migration-agent", artifactPath: "repos/jatai/README.md" });
  expect(vm.pots).toEqual([expect.objectContaining({ islandId: "execution", artifactPath: "repos/jatai/README.md" })]);
}

const SCENARIOS: Record<string, (() => void) | "pendente"> = {
  "Um subagente avisado pelo hook, sem iniciativa nem fase, aparece na iniciativa ativa": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [hook("agent-started", "migration-agent")]);
    expect(workingBees(vm)).toEqual([expect.objectContaining({ agentId: "@migration-agent", islandId: "execution", source: "event" })]);
    expect(island(vm, "Execução").agents.find((a) => a.agentId === "@migration-agent")?.status).toBe("working");
    expect(vm.feed[0]).toMatchObject({ eventType: "agent-started", agentId: "@migration-agent", islandId: "execution" });
  },

  "Dois subagentes em paralelo avisados pelo hook são duas abelhas": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [hook("agent-started", "migration-agent"), hook("agent-started", "test-backfill-agent")]);
    expect(workingBees(vm).map((b) => b.agentId).sort()).toEqual(["@migration-agent", "@test-backfill-agent"]);
    expect(workingBees(vm).every((b) => b.islandId === "execution")).toBe(true);
  },

  "O fim de um dos subagentes em paralelo pousa só a abelha dele": () => {
    const parallel = [hook("agent-started", "migration-agent"), hook("agent-started", "test-backfill-agent")];
    const vm = deriveColmeia(snapshot(MISSAO), [...parallel, hook("agent-done", "migration-agent")]);
    expect(workingBees(vm).map((b) => b.agentId)).toEqual(["@test-backfill-agent"]);
  },

  "O fim de um subagente avisado pelo hook pousa a abelha sem acender a guarda": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [hook("agent-started", "migration-agent"), hook("agent-done", "migration-agent")]);
    expect(workingBees(vm)).toEqual([]);
    expect(vm.guards).toEqual([]);
    expect(island(vm, "Execução").agents.find((a) => a.agentId === "@migration-agent")?.status).toBe("queued");
  },

  "Um subagente fora do elenco da metodologia aparece na ilha em que a iniciativa está": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [hook("agent-started", "general-purpose")]);
    expect(workingBees(vm)).toEqual([expect.objectContaining({ agentId: "@general-purpose", islandId: "execution" })]);
    expect(island(vm, "Execução").agents.map((a) => a.agentId)).toContain("@general-purpose");
  },

  "Os streams viram ilhas ligadas pelos gates": () => {
    const vm = deriveColmeia(snapshot(MISSAO), []);
    expect(vm.islands.map((i) => i.label)).toEqual(["Descoberta", "Planejamento", "Execução", "Operação"]);
    expect(vm.bridges.map((b) => [b.gate, b.state])).toEqual([["D1", "approved"], ["D2", "approved"], ["D3", "unbuilt"]]);
    expect(island(vm, "Execução")).toMatchObject({ state: "current", focus: "Epic 0 · Fundação" });
    expect(vm.islands.map((i) => i.state)).toEqual(["done", "done", "current", "sleeping"]);
  },

  "Um stream que ainda não começou aparece adormecido": () => {
    const vm = deriveColmeia(snapshot(MISSAO), []);
    const operation = island(vm, "Operação");
    expect(operation).toMatchObject({ state: "sleeping", wakesAfterGate: "D3" });
    expect(operation.agents.length).toBeGreaterThan(0);
    expect(new Set(operation.agents.map((a) => a.status))).toEqual(new Set(["sleeping"]));
  },

  "As ilhas seguem o fluxo do tipo de iniciativa": () => {
    const vm = deriveColmeia(snapshot(HOTFIX, [hotfix()]), []);
    expect(vm.flow).toBe("waves");
    expect(vm.islands.map((i) => i.label)).toEqual(["Diagnóstico", "Correção", "Validação"]);
    for (const label of ["Descoberta", "Planejamento", "Execução", "Operação"]) expect(vm.islands.map((i) => i.label)).not.toContain(label);
    expect(vm.islands[0]!.state).toBe("current");
  },

  "Trocar de iniciativa troca o mapa inteiro": () => {
    const events = [started("epic-0/task-0.2")];
    const before = deriveColmeia(snapshot(MISSAO, [missao(), hotfix()]), events);
    expect(workingBees(before).map((b) => b.agentId)).toEqual(["@migration-agent"]);
    const after = deriveColmeia(snapshot(HOTFIX, [missao(), hotfix()]), events);
    expect(after.islands.map((i) => i.label)).toEqual(["Diagnóstico", "Correção", "Validação"]);
    expect(after.bees).toEqual([]);
    expect(after.feed).toEqual([]);
  },

  "Sem iniciativa ativa o mapa explica o que falta": () => {
    const vm = deriveColmeia(snapshot(null), [started("epic-0/task-0.2")]);
    expect(vm.initiativeId).toBeNull();
    expect(vm.empty?.reason).toMatch(/não há iniciativa ativa/i);
    expect(vm.empty?.hint).toContain("@jatai");
    expect(vm.islands).toEqual([]);
  },

  "Um agente que começa uma tarefa aparece como abelha na ilha do seu stream": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [started("epic-0/task-0.2")]);
    expect(workingBees(vm)).toEqual([expect.objectContaining({ agentId: "@migration-agent", islandId: islandId(vm, "Execução"), taskId: "epic-0/task-0.2" })]);
    expect(vm.feed[0]).toMatchObject({ eventType: "agent-started", agentId: "@migration-agent", text: expect.stringContaining("@migration-agent começou") });
  },

  "Um agente que termina uma tarefa pousa": () => {
    const state = snapshot(MISSAO, [missao({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status: "in-progress" } } } } })]);
    const vm = deriveColmeia(state, [started("epic-0/task-0.2"), done("epic-0/task-0.2")]);
    expect(workingBees(vm).filter((b) => b.agentId === "@migration-agent")).toEqual([]);
    expect(vm.guards).toEqual([]);
    expect(vm.feed[0]).toMatchObject({ eventType: "agent-done", text: expect.stringContaining("@migration-agent terminou") });
  },

  "A tarefa do estado em andamento também vira abelha, sem evento de início": () => {
    const vm = deriveColmeia(snapshot(MISSAO, [missao({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.3": { status: "in-progress" } } } } })]), []);
    expect(workingBees(vm)).toEqual([expect.objectContaining({ islandId: "execution", taskId: "epic-0/task-0.3", source: "state", agentId: null })]);
  },

  "Uma entrega concluída enche um pote que leva à evidência": () => {
    const report = ".github/artifacts/execution/feature-report-jatai-f0.2-seed.md";
    const vm = deriveColmeia(snapshot(MISSAO), [ev({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: report, harness: "claude-code" })]);
    expect(vm.pots).toEqual([{ islandId: "execution", artifactPath: report, agentId: "@migration-agent", source: "event" }]);
  },

  "O mesmo artefato visto pelo hook e pelo observador enche um pote só": () => {
    const report = ".github/artifacts/execution/relatorio.md";
    const vm = deriveColmeia(snapshot(MISSAO), [
      ev({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: report, harness: "claude-code" }),
      ev({ event_type: "artifact-written", artifact_path: report, harness: "watcher", run_id: "artifact-watcher" }),
    ]);
    expect(vm.pots.filter((p) => p.artifactPath === report)).toHaveLength(1);
    expect(vm.feed.filter((f) => f.artifactPath === report)).toHaveLength(1);
  },

  "A guarda acende quando a tarefa terminada exige aprovação humana": () => {
    const state = snapshot(MISSAO, [missao({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status: "done", requires_approval: true } } } } })]);
    const vm = deriveColmeia(state, [started("epic-0/task-0.2"), done("epic-0/task-0.2")]);
    expect(vm.guards).toEqual([expect.objectContaining({ islandId: "execution", kind: "approval", taskId: "epic-0/task-0.2", reason: "epic-0/task-0.2 espera você" })]);
  },

  "A guarda acende quando uma decisão humana é pedida": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [
      ev({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código", metadata: { reason: "titularidade" } }),
    ]);
    expect(vm.guards).toEqual([expect.objectContaining({ islandId: islandId(vm, "Execução"), kind: "decision", reason: "titularidade do código", taskId: "epic-0/task-0.1" })]);
  },

  "A decisão tomada apaga a guarda e registra quem decidiu": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [
      ev({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" }),
      ev({ event_type: "decision-made", task_id: "epic-0/task-0.1", actor: "human", by: "Pessoa Fictícia", message: "titular definido" }),
    ]);
    expect(vm.guards).toEqual([]);
    expect(vm.feed[0]).toMatchObject({ eventType: "decision-made", by: "Pessoa Fictícia", text: "Decisão tomada por Pessoa Fictícia — titular definido" });
  },

  "Bloqueio e falha param a abelha com o motivo [blocked · bloqueada por T0.1 · bloqueada por T0.1]": () => blockedOrFailed("blocked", "bloqueada por T0.1", "bloqueada por T0.1"),
  "Bloqueio e falha param a abelha com o motivo [failed · suíte de testes caiu · falhou: suíte de testes caiu]": () => blockedOrFailed("failed", "suíte de testes caiu", "falhou: suíte de testes caiu"),

  "A ilha registra a atividade de qualquer harness [claude-code]": () => anyHarness("claude-code"),
  "A ilha registra a atividade de qualquer harness [copilot]": () => anyHarness("copilot"),
  "A ilha registra a atividade de qualquer harness [mcp]": () => anyHarness("mcp"),

  "O mapa mostra só metadados da atividade": () => {
    const line = JSON.stringify({
      run_id: "r", event_type: "artifact-written", timestamp: "2026-11-15T12:00:00Z", initiative_id: MISSAO, agent_id: "@security-auditor",
      artifact_path: ".github/artifacts/assessment/security/report.md", content: "senha=hunter2", metadata: { diff: "+ token=abc", reason: "varredura" },
    });
    const vm = deriveColmeia(snapshot(MISSAO), parseRunEvents(line));
    const shown = JSON.stringify(vm);
    expect(shown).not.toContain("hunter2");
    expect(shown).not.toContain("token=abc");
    expect(vm.pots).toEqual([{ islandId: "discovery", artifactPath: ".github/artifacts/assessment/security/report.md", agentId: "@security-auditor", source: "event" }]);
    expect(Object.keys(vm.feed[0]!).sort()).toEqual(["agentId", "artifactPath", "eventType", "islandId", "text", "timestamp"]);
  },

  "Um evento ilegível é ignorado sem derrubar o mapa": () => {
    const events = [started("epic-0/task-0.2")];
    const before = deriveColmeia(snapshot(MISSAO), events);
    const garbage = parseRunEvents(['{"run_id":"r","event_type":"agente.explodiu","timestamp":"2026-11-15T13:00:00Z"}', "{não é json"].join("\n"));
    const after = deriveColmeia(snapshot(MISSAO), [...events, ...garbage]);
    expect(after).toEqual(before);
    expect(after.feed.map((f) => f.eventType)).not.toContain("agente.explodiu");
  },

  "A ilha mostra quem trabalha ali e quem está na fila": () => {
    const vm = deriveColmeia(snapshot(MISSAO), [started("epic-0/task-0.2")]);
    const agents = island(vm, "Execução").agents;
    expect(agents.find((a) => a.agentId === "@migration-agent")?.status).toBe("working");
    expect(agents.find((a) => a.agentId === "@test-backfill-agent")?.status).toBe("queued");
  },

  "As entregas do Planejamento levam aos artefatos": () => {
    const planning = [".github/artifacts/planning/mod-missao-open-source/roadmap.md", ".github/artifacts/planning/mod-missao-open-source/risk-matrix.md"];
    const vm = deriveColmeia(snapshot(MISSAO, [missao({ planning_artifacts: planning })]), []);
    expect(vm.pots.filter((p) => p.islandId === islandId(vm, "Planejamento")).map((p) => path.basename(p.artifactPath))).toEqual(["roadmap.md", "risk-matrix.md"]);
    expect(vm.pots.map((p) => p.artifactPath)).toEqual(planning);
  },
};

describe("Funcionalidade: Derivar o mapa da colmeia do estado gravado e dos eventos de atividade", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) {
    if (steps === "pendente") it.todo(`Cenário: ${title}`);
    else it(`Cenário: ${title}`, steps);
  }
});
