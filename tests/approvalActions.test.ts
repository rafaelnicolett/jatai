import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workspace } from "vscode";
import { approveWaveItemHandler, approveGateD1Handler } from "../src/views/actions/approvalActions";
import { upsertInitiative, upsertWaveItem } from "../src/cli/writers/initiatives-writer";
import type { ActionContext } from "../src/views/actions/CommandHandler";
import type { RunEvent } from "../src/data/run-events-contract.pure";
import { YamlStateRepository } from "../src/state/repository/StateRepository";

/**
 * Onda 2 — cobre o que `yamlUpsert.test.ts`/`golden-round-trip.test.ts` (Onda
 * 1) não cobrem: o HANDLER inteiro (não só o writer), incluindo o efeito
 * colateral novo — registrar a aprovação humana em `runs/`, a fonte da central
 * de notificações.
 *
 * F4.2 (ADR-0024): o gate D1 passa pelo `StateCommands` (nome do git, regra de
 * fechamento, lock) e o evento humano pelo escritor validado de `runs/`, não
 * mais por um append sem lock em `human-actions.jsonl`.
 */

const tmpWorkspace = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-approval-actions-"));

const fakeCtx = (): ActionContext => ({
  configLoader: {} as ActionContext["configLoader"],
  extensionContext: {} as ActionContext["extensionContext"],
  promptMap: {},
  repository: new YamlStateRepository(),
  requestRefresh: vi.fn(),
  pushTelemetry: vi.fn(),
  approverName: async () => "Pessoa Fictícia",
});

const runsDir = (root: string): string => path.join(root, ".github/artifacts/runs");

/** Todos os eventos gravados em `runs/*.jsonl`, de qualquer arquivo. */
const readHumanEvents = (root: string): RunEvent[] => {
  if (!fs.existsSync(runsDir(root))) return [];
  return fs
    .readdirSync(runsDir(root))
    .filter((f) => f.endsWith(".jsonl"))
    .flatMap((f) => fs.readFileSync(path.join(runsDir(root), f), "utf-8").split("\n"))
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
};

describe("approveWaveItemHandler", () => {
  it("aprova um item sem risco e registra item-approved em runs/mod-x.jsonl, com o nome do git", async () => {
    const root = tmpWorkspace();
    const initiativesPath = path.join(root, ".github/artifacts/initiatives.yaml");
    fs.mkdirSync(path.dirname(initiativesPath), { recursive: true });
    let content = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", { status: "done", repo: "legacy-erp" }).content;
    fs.writeFileSync(initiativesPath, content, "utf-8");
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    const ctx = fakeCtx();
    await approveWaveItemHandler.handle(
      { initiativeId: "mod-x", wave: "wave-1", item: "item-1.1", acknowledged: false },
      ctx
    );

    expect(fs.readFileSync(initiativesPath, "utf-8")).toContain("human_approved_at:");
    expect(ctx.requestRefresh).toHaveBeenCalled();

    const events = readHumanEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ run_id: "human", event_type: "item-approved", initiative_id: "mod-x", phase_id: "wave-1", repo_id: "legacy-erp", actor: "human", by: "Pessoa Fictícia" });
    expect(fs.existsSync(path.join(runsDir(root), "mod-x.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(runsDir(root), "human-actions.jsonl"))).toBe(false);
  });

  it("item arriscado sem acknowledged: recusa — não grava YAML nem evento", async () => {
    const root = tmpWorkspace();
    const initiativesPath = path.join(root, ".github/artifacts/initiatives.yaml");
    fs.mkdirSync(path.dirname(initiativesPath), { recursive: true });
    let content = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", { status: "done", mergeBlock: "aguarda staging" }).content;
    fs.writeFileSync(initiativesPath, content, "utf-8");
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    const ctx = fakeCtx();
    await approveWaveItemHandler.handle(
      { initiativeId: "mod-x", wave: "wave-1", item: "item-1.1", acknowledged: false },
      ctx
    );

    expect(fs.readFileSync(initiativesPath, "utf-8")).not.toContain("human_approved_at:");
    expect(ctx.requestRefresh).not.toHaveBeenCalled();
    expect(readHumanEvents(root)).toHaveLength(0);
  });

  it("item arriscado COM acknowledged: aprova normalmente e registra o evento", async () => {
    const root = tmpWorkspace();
    const initiativesPath = path.join(root, ".github/artifacts/initiatives.yaml");
    fs.mkdirSync(path.dirname(initiativesPath), { recursive: true });
    let content = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", { status: "done", mergeBlock: "aguarda staging" }).content;
    fs.writeFileSync(initiativesPath, content, "utf-8");
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    const ctx = fakeCtx();
    await approveWaveItemHandler.handle(
      { initiativeId: "mod-x", wave: "wave-1", item: "item-1.1", acknowledged: true },
      ctx
    );

    expect(fs.readFileSync(initiativesPath, "utf-8")).toContain("human_approved_at:");
    expect(readHumanEvents(root)).toHaveLength(1);
  });
});

const GATE_REPO = "billing-api";
const PHASES = ["tech-stack", "arch", "coding-archaeology", "quality", "debt"];

/** Foundation do `billing-api` (sem frontend, então a fase de design não conta) com as fases pedidas no status dado. */
function foundationWorkspace(status: (phase: string) => string): { root: string; foundationPath: string } {
  const root = tmpWorkspace();
  const foundationPath = path.join(root, ".github/artifacts/assessment/foundation-state.yaml");
  fs.mkdirSync(path.dirname(foundationPath), { recursive: true });
  const phases = PHASES.map((p) => `      ${p}:\n        status: ${status(p)}`).join("\n");
  fs.writeFileSync(foundationPath, `repos:\n  ${GATE_REPO}:\n    phases:\n${phases}\n    gate_d1:\n      status: pending\n`, "utf-8");
  fs.writeFileSync(path.join(root, ".github/artifacts/repos.yaml"), `version: 1\nrepos:\n  - id: ${GATE_REPO}\n    source: local-path\n    path: repos/${GATE_REPO}\n    has_frontend: false\n`, "utf-8");
  workspace.workspaceFolders = [{ uri: { fsPath: root } }];
  return { root, foundationPath };
}

describe("approveGateD1Handler (ADR-0024, pelo StateCommands)", () => {
  it("REGRESSÃO: aprova o D1 com o nome do git e grava o evento gate-approved em runs/workspace.jsonl, sem human-actions.jsonl", async () => {
    const { root, foundationPath } = foundationWorkspace(() => "done");

    const ctx = fakeCtx();
    await approveGateD1Handler.handle({ repoId: GATE_REPO }, ctx);

    const written = fs.readFileSync(foundationPath, "utf-8");
    expect(written).toContain("status: approved");
    expect(written).toContain('by: "Pessoa Fictícia"');
    expect(written).toContain("human_approved_at:");
    expect(ctx.requestRefresh).toHaveBeenCalled();

    const events = readHumanEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: "gate-approved", repo_id: GATE_REPO, actor: "human", by: "Pessoa Fictícia" });
    expect(fs.existsSync(path.join(runsDir(root), "workspace.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(runsDir(root), "human-actions.jsonl"))).toBe(false);
  });

  it("REGRESSÃO: recusa o D1 com fase do Foundation aberta (antes aprovava qualquer repositório): nada é gravado", async () => {
    const { root, foundationPath } = foundationWorkspace((p) => (p === "quality" || p === "debt" ? "pending" : "done"));
    const before = fs.readFileSync(foundationPath, "utf-8");

    const ctx = fakeCtx();
    await approveGateD1Handler.handle({ repoId: GATE_REPO }, ctx);

    expect(fs.readFileSync(foundationPath, "utf-8")).toBe(before);
    expect(ctx.requestRefresh).not.toHaveBeenCalled();
    expect(readHumanEvents(root)).toHaveLength(0);
  });

  it("sem usuário no git, o D1 não é aprovado (a aprovação precisa do nome de quem decide)", async () => {
    const { root, foundationPath } = foundationWorkspace(() => "done");
    const before = fs.readFileSync(foundationPath, "utf-8");

    const ctx = { ...fakeCtx(), approverName: async () => null };
    await approveGateD1Handler.handle({ repoId: GATE_REPO }, ctx);

    expect(fs.readFileSync(foundationPath, "utf-8")).toBe(before);
    expect(readHumanEvents(root)).toHaveLength(0);
  });
});
