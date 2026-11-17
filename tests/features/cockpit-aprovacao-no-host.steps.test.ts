import { describe, it, expect, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workspace } from "vscode";
import { scenarioTitles } from "./gherkin";
import { gatesApproveHandler, decisionsRecordHandler } from "../../src/views/actions/gateActions";
import { approveGateD1Handler } from "../../src/views/actions/approvalActions";
import { toggleGuardRailHandler } from "../../src/views/actions/greenfieldPhaseActions";
import type { ActionContext } from "../../src/views/actions/CommandHandler";
import type { HostToWebviewMessage } from "../../src/shared/cockpit-protocol";
import { YamlStateRepository } from "../../src/state/repository/StateRepository";
import { parseInitiativesYaml } from "../../src/core/contracts/initiatives-contract.pure";
import { parseDeliveryState } from "../../src/core/contracts/delivery-state-contract.pure";
import { parseFoundationState } from "../../src/core/contracts/foundation-state-contract.pure";
import { parseRunEvents, type RunEvent } from "../../src/core/contracts/run-events-contract.pure";

/**
 * Step definitions de `cockpit-aprovacao-no-host.feature` (F4.2, parte 2,
 * ADR-0024): o host do Cockpit aprova gate e registra decisão pelo
 * `StateCommands`. Os handlers rodam de verdade sobre um workspace temporário,
 * sem o VS Code (o módulo `vscode` é o stub dos testes) e sem rede: o único
 * dublê é o nome do git, injetado pelo `ActionContext` (a porta `approverName`),
 * para o resultado não depender do git da máquina.
 */
const FEATURE = path.join(__dirname, "cockpit-aprovacao-no-host.feature");
const ART = ".github/artifacts";
const roots: string[] = [];
afterAll(() => {
  workspace.workspaceFolders = undefined;
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

const PHASES = ["tech-stack", "arch", "coding-archaeology", "quality", "debt"];

interface Harness {
  root: string;
  ctx: ActionContext;
  replies: HostToWebviewMessage[];
}

/** Contexto: a iniciativa "mod-x" e o repositório "api" no Foundation (sem frontend, então a fase de design não conta). */
function setup(opts: { git: string | null; planningApproved?: boolean; openPhases?: string[]; initiativesExtra?: string }): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-cockpit-host-"));
  roots.push(root);
  const write = (rel: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content, "utf-8");
  };
  const gates = opts.planningApproved ? "    roadmap_gate:\n      status: approved\n    risk_matrix_gate:\n      status: approved\n" : "";
  write(`${ART}/initiatives.yaml`, `active: mod-x\ninitiatives:\n  - id: mod-x\n    name: Modernização X\n    status: in-progress\n${gates}${opts.initiativesExtra ?? ""}`);
  write(`${ART}/repos.yaml`, "version: 1\nrepos:\n  - id: api\n    source: local-path\n    path: repos/api\n    has_frontend: false\n");
  const open = new Set(opts.openPhases ?? []);
  const phases = PHASES.map((p) => `      ${p}:\n        status: ${open.has(p) ? "pending" : "done"}`).join("\n");
  write(`${ART}/assessment/foundation-state.yaml`, `repos:\n  api:\n    phases:\n${phases}\n    gate_d1:\n      status: pending\n`);
  workspace.workspaceFolders = [{ uri: { fsPath: root } }];
  const replies: HostToWebviewMessage[] = [];
  const ctx: ActionContext = {
    configLoader: {} as ActionContext["configLoader"],
    extensionContext: {} as ActionContext["extensionContext"],
    promptMap: {},
    repository: new YamlStateRepository(),
    requestRefresh: vi.fn(),
    pushTelemetry: vi.fn(),
    reply: (m) => replies.push(m),
    approverName: async () => opts.git,
  };
  return { root, ctx, replies };
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");
const initiative = (root: string) => parseInitiativesYaml(read(root, `${ART}/initiatives.yaml`)).state!.initiatives[0]!;
const foundationGate = (root: string) => parseFoundationState(read(root, `${ART}/assessment/foundation-state.yaml`))!.repos.api!.gate_d1;

function runEvents(root: string): RunEvent[] {
  const dir = path.join(root, `${ART}/runs`);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => parseRunEvents(read(root, `${ART}/runs/${f}`)));
}

const lastReply = (h: Harness): HostToWebviewMessage => h.replies[h.replies.length - 1]!;

const SCENARIOS: Record<string, () => Promise<void> | void> = {
  "Aprovar o D2 pelo Cockpit registra o nome do git de quem decide": async () => {
    const h = setup({ git: "Pessoa Fictícia", planningApproved: true });
    await gatesApproveHandler.handle({ type: "gates/approve", gate: "d2", initiativeId: "mod-x" }, h.ctx);
    expect(lastReply(h)).toMatchObject({ type: "gates/approve-result", ok: true, gate: "d2", by: "Pessoa Fictícia" });
    expect(initiative(h.root).gate_d2).toMatchObject({ status: "approved", by: "Pessoa Fictícia" });
    expect(h.ctx.requestRefresh).toHaveBeenCalled();
    // O e-mail do git nunca é lido: nada além do nome entra no estado.
    expect(read(h.root, `${ART}/initiatives.yaml`)).not.toMatch(/@/);
  },

  "Sem nome no git, o Cockpit recebe o pedido do nome antes de aprovar": async () => {
    const h = setup({ git: null, planningApproved: true });
    await gatesApproveHandler.handle({ type: "gates/approve", gate: "d2", initiativeId: "mod-x" }, h.ctx);
    expect(lastReply(h)).toMatchObject({ type: "gates/approve-result", ok: false, error: { code: "MISSING_FLAG", field: "by" } });
    expect(initiative(h.root).gate_d2).toBeUndefined();
    // O operador digita o nome, o painel reenvia com `by`, e então aprova.
    await gatesApproveHandler.handle({ type: "gates/approve", gate: "d2", initiativeId: "mod-x", by: "Outra Pessoa" }, h.ctx);
    expect(initiative(h.root).gate_d2).toMatchObject({ status: "approved", by: "Outra Pessoa" });
  },

  "Aprovar o D1 pelo Cockpit grava quem aprovou e o evento sob o lock do estado": async () => {
    const h = setup({ git: "Pessoa Fictícia" });
    await approveGateD1Handler.handle({ type: "approveGateD1", repoId: "api" }, h.ctx);
    expect(foundationGate(h.root)).toMatchObject({ status: "approved", by: "Pessoa Fictícia" });
    expect(runEvents(h.root)).toMatchObject([{ event_type: "gate-approved", repo_id: "api", actor: "human", by: "Pessoa Fictícia" }]);
    expect(fs.existsSync(path.join(h.root, `${ART}/runs/workspace.jsonl`))).toBe(true);
    expect(fs.existsSync(path.join(h.root, `${ART}/runs/human-actions.jsonl`))).toBe(false);
    // Sob o lock de sempre: nada de arquivo temporário nem lock esquecido.
    expect(fs.readdirSync(path.join(h.root, `${ART}/assessment`)).filter((f) => f.includes(".tmp-") || f.endsWith(".lock"))).toEqual([]);
  },

  "Aprovar o D1 pelo Cockpit com fase do Foundation aberta é recusado": async () => {
    const h = setup({ git: "Pessoa Fictícia", openPhases: ["quality", "debt"] });
    await gatesApproveHandler.handle({ type: "gates/approve", gate: "d1", repoId: "api" }, h.ctx);
    const reply = lastReply(h);
    expect(reply).toMatchObject({ type: "gates/approve-result", ok: false, error: { code: "GATE_NOT_CLOSED" } });
    expect(reply.type === "gates/approve-result" && !reply.ok ? reply.error.open?.map((o) => o.phase) : null).toEqual(["quality", "debt"]);
    expect(foundationGate(h.root).status).toBe("pending");
    expect(runEvents(h.root)).toEqual([]);
  },

  "O operador marca um item do checklist humano de uma fase da entrega": async () => {
    const h = setup({ git: "Pessoa Fictícia", initiativesExtra: "    current_phase: business\n" });
    fs.mkdirSync(path.join(h.root, `${ART}/initiatives/mod-x`), { recursive: true });
    fs.writeFileSync(path.join(h.root, `${ART}/initiatives/mod-x/delivery-state.yaml`), "phases:\n  business:\n    status: in-progress\n", "utf-8");
    await toggleGuardRailHandler.handle({ type: "toggleGuardRail", phaseId: "business", itemId: "problem-section", checked: true }, h.ctx);
    const state = parseDeliveryState(read(h.root, `${ART}/initiatives/mod-x/delivery-state.yaml`))!;
    expect(state.phases.business!.human_checklist["problem-section"]).toBe(true);
    expect(h.ctx.requestRefresh).toHaveBeenCalled();
  },

  "O operador registra a decisão pedida por um agente em seu nome": async () => {
    const h = setup({ git: "Pessoa Fictícia" });
    await decisionsRecordHandler.handle({ type: "decisions/record", taskId: "epic-0/task-1", initiativeId: "mod-x", message: "sou o titular" }, h.ctx);
    expect(lastReply(h)).toMatchObject({ type: "decisions/record-result", ok: true, taskId: "epic-0/task-1", by: "Pessoa Fictícia" });
    expect(runEvents(h.root)).toMatchObject([{ event_type: "decision-made", task_id: "epic-0/task-1", actor: "human", by: "Pessoa Fictícia", message: "sou o titular" }]);
  },

  "Sem nome no git, registrar a decisão pede o nome": async () => {
    const h = setup({ git: null });
    await decisionsRecordHandler.handle({ type: "decisions/record", taskId: "epic-0/task-1", message: "sou o titular" }, h.ctx);
    expect(lastReply(h)).toMatchObject({ type: "decisions/record-result", ok: false, error: { code: "MISSING_FLAG", field: "by" } });
    expect(runEvents(h.root)).toEqual([]);
    expect(h.ctx.requestRefresh).not.toHaveBeenCalled();
  },
};

describe("Funcionalidade: Aprovar gate pelo Cockpit em nome de quem decide", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
