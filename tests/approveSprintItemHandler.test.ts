import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workspace } from "vscode";
import { approveSprintItemHandler } from "../src/views/actions/approvalActions";
import type { ActionContext } from "../src/views/actions/CommandHandler";
import type { RunEvent } from "../src/data/run-events-contract.pure";
import { YamlStateRepository } from "../src/state/repository/StateRepository";

/**
 * Novo Cockpit (Passo 3) — cobre o handler novo que grava aprovação de UM
 * `SprintItem` de verdade em `sprint-backlog.yaml` (antes disso, sprint items
 * em "Aguarda você" eram só informativos). Mesma estrutura de
 * `tests/approvalActions.test.ts` (Onda 2): fixture em workspace temporário,
 * assert no YAML reescrito + no evento humano em `runs/` (F4.2).
 */

const tmpWorkspace = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-approve-sprint-item-"));

const fakeCtx = (): ActionContext => ({
  configLoader: {} as ActionContext["configLoader"],
  extensionContext: {} as ActionContext["extensionContext"],
  promptMap: {},
  repository: new YamlStateRepository(),
  requestRefresh: vi.fn(),
  pushTelemetry: vi.fn(),
  approverName: async () => "Pessoa Fictícia",
});

/** Os eventos de aprovação ficam em `runs/` (escritor validado e sob lock, F4.2), não mais em `human-actions.jsonl`. */
const readHumanEvents = (root: string): RunEvent[] => {
  const dir = path.join(root, ".github/artifacts/runs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .flatMap((f) => fs.readFileSync(path.join(dir, f), "utf-8").split("\n"))
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
};

const CANONICAL_BACKLOG = `meta:
  product: "Acme"
sprints:
  - id: "S1"
    name: "Sprint 1"
    goal: "Entregar o essencial"
    items:
      - id: "S1-BKD-01"
        title: "Endpoint de criação de pedido"
        status: "review"
        component: "backend"
      - id: "S1-BKD-02"
        title: "Endpoint de cancelamento"
        status: "backlog"
`;

describe("approveSprintItemHandler", () => {
  it("aprova um sprint item (status -> done), preserva o resto do YAML e registra item-approved", async () => {
    const root = tmpWorkspace();
    const backlogPath = path.join(root, ".github/artifacts/sprint-backlog.yaml");
    fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
    fs.writeFileSync(backlogPath, CANONICAL_BACKLOG, "utf-8");
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    const ctx = fakeCtx();
    await approveSprintItemHandler.handle({ sprintItemId: "S1-BKD-01" }, ctx);

    const written = fs.readFileSync(backlogPath, "utf-8");
    expect(written).toContain("status: done");
    // preserva o item irmão intocado e os metadados do topo
    expect(written).toContain("S1-BKD-02");
    expect(written).toContain('product: "Acme"');
    expect(ctx.requestRefresh).toHaveBeenCalled();

    const events = readHumanEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ run_id: "human", event_type: "item-approved", phase_id: "sprint-run", actor: "human", by: "Pessoa Fictícia" });
  });

  it("item inexistente: não escreve YAML nem evento, avisa o usuário", async () => {
    const root = tmpWorkspace();
    const backlogPath = path.join(root, ".github/artifacts/sprint-backlog.yaml");
    fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
    fs.writeFileSync(backlogPath, CANONICAL_BACKLOG, "utf-8");
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    const ctx = fakeCtx();
    await approveSprintItemHandler.handle({ sprintItemId: "does-not-exist" }, ctx);

    expect(fs.readFileSync(backlogPath, "utf-8")).toBe(CANONICAL_BACKLOG);
    expect(ctx.requestRefresh).not.toHaveBeenCalled();
    expect(readHumanEvents(root)).toHaveLength(0);
  });

  it("prefere o sprint-backlog.yaml da iniciativa ativa quando o item está lá", async () => {
    const root = tmpWorkspace();
    const initiativesPath = path.join(root, ".github/artifacts/initiatives.yaml");
    fs.mkdirSync(path.dirname(initiativesPath), { recursive: true });
    fs.writeFileSync(initiativesPath, "active: init-x\ninitiatives:\n  - id: init-x\n    name: X\n", "utf-8");

    const perInitPath = path.join(root, ".github/artifacts/initiatives/init-x/sprint-backlog.yaml");
    fs.mkdirSync(path.dirname(perInitPath), { recursive: true });
    fs.writeFileSync(perInitPath, CANONICAL_BACKLOG, "utf-8");
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    const ctx = fakeCtx();
    await approveSprintItemHandler.handle({ sprintItemId: "S1-BKD-01" }, ctx);

    expect(fs.readFileSync(perInitPath, "utf-8")).toContain("status: done");
    expect(ctx.requestRefresh).toHaveBeenCalled();
  });

  it("REGRESSÃO: `active: \"init-x\"` (como o CLI grava) aprova o item no backlog da iniciativa, não procura em initiatives/\"init-x\"/ (C2 / H-BUG-02)", async () => {
    const root = tmpWorkspace();
    const initiativesPath = path.join(root, ".github/artifacts/initiatives.yaml");
    fs.mkdirSync(path.dirname(initiativesPath), { recursive: true });
    fs.writeFileSync(initiativesPath, 'active: "init-x" # trocado pelo CLI\ninitiatives:\n  - id: "init-x"\n    name: "X"\n', "utf-8");

    const perInitPath = path.join(root, ".github/artifacts/initiatives/init-x/sprint-backlog.yaml");
    fs.mkdirSync(path.dirname(perInitPath), { recursive: true });
    fs.writeFileSync(perInitPath, CANONICAL_BACKLOG, "utf-8");
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    const ctx = fakeCtx();
    await approveSprintItemHandler.handle({ sprintItemId: "S1-BKD-01" }, ctx);

    expect(fs.readFileSync(perInitPath, "utf-8")).toContain("status: done");
    expect(ctx.requestRefresh).toHaveBeenCalled();
  });
});
