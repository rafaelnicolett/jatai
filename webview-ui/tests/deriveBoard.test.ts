import { describe, it, expect } from "vitest";
import { buildViewContext } from "../src/apps/cockpit/view/viewTarget";
import { deriveTrack } from "../src/apps/cockpit/view/deriveTrack";
import { deriveBoard, hasTaskDetails, type BoardModel, type TaskModel } from "../src/apps/cockpit/view/deriveBoard";
import { buildSnapshot } from "../src/mock/snapshotBuilder";
import { REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml, modernizationSnapshot } from "./support/cockpitFixtures";

function boardOf(snapshot: ReturnType<typeof modernizationSnapshot>, stop: string | null = null, id = "mod-x"): BoardModel {
  const ctx = buildViewContext(snapshot, { kind: "initiative", id });
  return deriveBoard(ctx, deriveTrack(ctx, stop));
}

const column = (b: BoardModel, status: string) => b.columns.find((c) => c.status === status)!;
const withTasks = (tasks: string) => modernizationSnapshot({ epicStatus: `epic-0:\n  status: in-progress\n  items:\n${tasks.split("\n").map((l) => "    " + l).join("\n")}` });
/** Como `buildSnapshot` de uma modernização com D1 e D2 aprovados, para os épicos que o teste define. */
const approved = (epics: string[], epicStatus: string, events: Array<Record<string, unknown>> = []) =>
  buildSnapshot({
    reposYaml: REPOS_YAML,
    foundationYaml: foundationYaml({ d1: "approved" }),
    initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"], epics, epicStatus })]),
    events,
  });

describe("deriveBoard — as 4 colunas e os status de trabalho (ADR-0022 §7)", () => {
  it("as colunas vêm sempre na ordem Fila, Trabalhando, Espera você, Feito", () => {
    expect(boardOf(modernizationSnapshot()).columns.map((c) => c.status)).toEqual(["queue", "working", "you", "done"]);
  });

  it("o quadro do épico em andamento traz o título, a descrição e os cartões nas colunas certas", () => {
    const b = boardOf(modernizationSnapshot());
    expect(b.title).toBe("Epic 0 · Fundação");
    expect(b.description).toBe("repositório isolado e CI");
    expect(column(b, "working").tasks.map((t) => t.key)).toEqual(["epic-0/task-1"]);
    expect(column(b, "queue").tasks.map((t) => t.key)).toEqual(["epic-0/task-2"]);
    expect(b.total).toBe(2);
    expect(b.empty).toBeUndefined();
  });

  it.each([
    ["blocked", "bloqueada por task-0", "queue", "blocked"],
    ["failed", "o teste de contrato caiu", "queue", "failed"],
    ["cancelled", "escopo cortado pelo dono", "done", "cancelled"],
  ])("tarefa %s fica na coluna %s com a condição e o motivo em texto", (status, reason, col, kind) => {
    const b = boardOf(withTasks(`task-1: { status: ${status}, reason: "${reason}" }`), "epic-0");
    const task = column(b, col).tasks.find((t) => t.key === "epic-0/task-1")!;
    expect(task.condition).toEqual({ kind, reason });
  });

  it("bloqueada e que falhou contam no cabeçalho da coluna; cancelada não conta como bloqueio", () => {
    const b = boardOf(withTasks(`task-1: { status: blocked, reason: "x" }\ntask-2: { status: failed, reason: "y" }\ntask-3: { status: cancelled, reason: "z" }`));
    expect(column(b, "queue").blockedCount).toBe(2);
    expect(column(b, "done").blockedCount).toBe(0);
  });

  it("sem motivo registrado, o cartão diz isso em vez de ficar mudo", () => {
    const b = boardOf(withTasks("task-1: { status: blocked }"));
    expect(column(b, "queue").tasks[0]!.condition).toEqual({ kind: "blocked", reason: "sem motivo registrado" });
  });

  it("status fora do vocabulário não é rebaixado: o cartão mostra o texto original", () => {
    const b = boardOf(withTasks("task-1: { status: finished }"));
    const task = column(b, "queue").tasks[0]!;
    expect(task.meta).toBe("status desconhecido: finished");
    expect(task.condition).toBeUndefined();
  });

  it("concluída que exige aprovação humana vai para Espera você, com a decisão; depois de aprovada vai para Feito", () => {
    const awaiting = withTasks("task-1: { status: done, requires_approval: true }");
    // O épico não está assentado enquanto uma tarefa dele espera você: a missão fica nele.
    expect(deriveTrack(buildViewContext(awaiting, { kind: "initiative", id: "mod-x" }), null).selectedStopKey).toBe("epic-0");
    const pending = boardOf(awaiting);
    expect(column(pending, "you").tasks[0]!.decision).toEqual({ kind: "approval", initiativeId: "mod-x", wave: "epic-0", item: "task-1" });

    const decided = boardOf(withTasks('task-1: { status: done, requires_approval: true, human_approved_at: "2026-11-16T10:00:00Z" }'), "epic-0");
    expect(column(decided, "you").tasks).toEqual([]);
    expect(column(decided, "done").tasks.map((t) => t.key)).toEqual(["epic-0/task-1"]);
  });

  it("legado: merge_block numa tarefa que não foi feita vira bloqueio com o motivo no próprio campo", () => {
    const b = boardOf(withTasks('task-1: { status: pending, merge_block: "aguarda rollback em staging" }'));
    expect(column(b, "queue").tasks[0]!.condition).toEqual({ kind: "blocked", reason: "aguarda rollback em staging" });
  });

  it("o agente do último evento da tarefa aparece como meta; sem evento, o repositório", () => {
    const snapshot = approved(
      ["epic-0: Fundação"],
      "epic-0:\n  status: in-progress\n  items:\n    task-1: { status: in-progress }\n    task-2: { status: pending, repo: api }",
      [{ run_id: "r1", event_type: "agent-started", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", agent_id: "migration-agent", task_id: "epic-0/task-1" }]
    );
    const b = boardOf(snapshot);
    expect(column(b, "working").tasks[0]!.meta).toBe("@migration-agent");
    expect(column(b, "queue").tasks[0]!.meta).toBe("api");
    expect(b.activityKey).toBe("2026-11-16T10:00:00Z");
  });

  it("as tarefas prometidas no rótulo e ainda não relatadas entram na Fila, na ordem do rótulo", () => {
    const snapshot = approved(["epic-0: Fundação (item-a, item-b, item-c) — nota"], "epic-0:\n  items:\n    item-b: { status: done }");
    const b = boardOf(snapshot);
    expect(column(b, "queue").tasks.map((t) => t.key)).toEqual(["epic-0/item-a", "epic-0/item-c"]);
    expect(column(b, "done").tasks.map((t) => t.key)).toEqual(["epic-0/item-b"]);
  });

  it("onda plana (só o status no nível dela) vira um cartão único", () => {
    const b = boardOf(approved(["epic-0: Fundação"], "epic-0:\n  status: in-progress"));
    expect(b.total).toBe(1);
    expect(column(b, "working").tasks[0]).toMatchObject({ key: "epic-0/epic-0", title: "Fundação" });
  });
});

describe("deriveBoard — quadro vazio diz por quê", () => {
  it("épico futuro sem tarefas espera o anterior fechar", () => {
    const b = boardOf(modernizationSnapshot(), "epic-1");
    expect(b.total).toBe(0);
    expect(b.empty).toEqual({ title: "Ainda sem tarefas abertas", body: 'Começa quando "Fundação" fechar.' });
  });

  it("sem parada selecionada, o quadro explica o que falta", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ scope: ["api"], epics: [] })]),
    });
    const b = boardOf(snapshot);
    expect(b.stopKey).toBeNull();
    expect(b.empty?.body).toBe("Os épicos aparecem quando o Planejamento terminar.");
  });
});

describe("deriveBoard — Descoberta e entrega", () => {
  it("a Descoberta mostra as fases do repositório; a que o agente terminou espera você, e quality traz os achados", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "pending" }).replace(
        "quality: { status: done,",
        "quality: { status: agent-done,"
      ),
    });
    const ctx = buildViewContext(snapshot, { kind: "discovery" });
    const b = deriveBoard(ctx, deriveTrack(ctx, "repo:api"));
    expect(b.title).toBe("Repositório · api");
    expect(column(b, "done").tasks.map((t) => t.id)).toContain("tech-stack");
    const waiting = column(b, "you").tasks.find((t) => t.id === "quality")!;
    expect(waiting.decision).toEqual({ kind: "foundation-phase", phaseId: "quality", repoId: "api" });
  });

  it("a entrega mostra as saídas da fase em revisão e as sprints do Downstream (item descoped vira cancelado)", () => {
    const sprintYaml = `sprints:\n  - id: S1\n    name: "Sprint 1"\n    items:\n      - id: S1-A\n        title: "Feito"\n        status: done\n      - id: S1-B\n        title: "Em revisão"\n        status: review\n      - id: S1-C\n        title: "Cortado"\n        status: descoped\n      - id: S1-D\n        title: "Travado"\n        status: blocked\n        blocked_reason: "aguarda credenciais"\n`;
    const deliveryYaml = ["business", "product", "ux-design", "domain-modeler", "bdd", "architecture", "sprint-plan"].map((p) => `  ${p}: { status: done, human_checklist: {} }`);
    const snapshot = buildSnapshot({
      mode: "greenfield",
      initiativesYaml: initiativesYaml("loja", [initiativeYaml({ id: "loja", name: "Loja", type: "feature", mode: "greenfield", currentPhase: "sprint-run", epics: [] })]),
      deliveryYaml: `phases:\n${deliveryYaml.join("\n")}\n  sprint-run: { status: in-progress, human_checklist: {} }\n`,
      sprintYaml,
    });
    const ctx = buildViewContext(snapshot, { kind: "initiative", id: "loja" });
    const track = deriveTrack(ctx, null);
    expect(track.kind).toBe("greenfield");
    const b = deriveBoard(ctx, track);
    const tasks = b.columns.flatMap((c) => c.tasks);
    expect(tasks.find((t) => t.key === "S1-B")).toMatchObject({ column: "you", decision: { kind: "sprint-item", sprintItemId: "S1-B" } });
    expect(tasks.find((t) => t.key === "S1-C")).toMatchObject({ column: "done", condition: { kind: "cancelled" } });
    expect(tasks.find((t) => t.key === "S1-D")).toMatchObject({ column: "queue", condition: { kind: "blocked", reason: "aguarda credenciais" } });
  });
});

describe("hasTaskDetails — o que a tela afirma tem fonte para abrir", () => {
  const task = (details: Partial<TaskModel["details"]>): TaskModel => ({ key: "epic-0/task-1", id: "task-1", title: "Semear", column: "queue", details: { artifacts: [], knownBugs: [], ...details } });

  it("sem commit, data, artefatos nem pontos de atenção: não há o que abrir", () => {
    expect(hasTaskDetails(task({}))).toBe(false);
  });

  it.each([
    ["commit", { commit: "abc1234" }],
    ["data de conclusão", { completedAt: "2026-07-20T12:00:00Z" }],
    ["artefatos", { artifacts: ["docs/x.md"] }],
    ["pontos de atenção", { knownBugs: ["falha conhecida"] }],
  ])("com %s: há o que abrir", (_nome, details) => {
    expect(hasTaskDetails(task(details))).toBe(true);
  });
});
