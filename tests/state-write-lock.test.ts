import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workspace } from "vscode";
import { YamlStateRepository } from "../src/state/repository/StateRepository";
import { approveGateD1Handler, approveSprintItemHandler } from "../src/views/actions/approvalActions";
import { toggleFoundationGuardRailHandler } from "../src/views/actions/guardRailActions";
import type { ActionContext } from "../src/views/actions/CommandHandler";

/**
 * A10 / H-BUG-16 / D13 (ADR-0017): as escritas do Cockpit e do chat
 * (`*InPlace`, aprovações, checklist do Foundation) gravavam com
 * `writeFileSync` direto, sem o lock que o CLI e o State Service usam. Com o
 * CLI no fallback e o VS Code aberto, um read-modify-write intercalado
 * apagava a escrita do outro (no teste de estresse da análise, 2 de 25
 * sobreviveram).
 *
 * Cada caso segura o `.lock` como o CLI seguraria, dispara a escrita do
 * Cockpit, confere que nada foi gravado enquanto o lock existia, simula o
 * CLI gravando a parte dele e liberando o lock, e exige que as duas escritas
 * sobrevivam.
 */

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "jatai-a10-"));

const INITIATIVES = [
  "active: mod-x",
  "initiatives:",
  "  - id: mod-x",
  "    name: Modernização X",
  "    status: in-progress",
  "    current_phase: business",
  "    wave_status:",
  "      wave-1:",
  "        item-1:",
  "          status: done",
  "",
].join("\n");

const DELIVERY = "phases:\n  business:\n    status: in-progress\n  product:\n    status: pending\n";

const FOUNDATION = [
  "version: 2",
  "phases:",
  "  domain:",
  "    status: agent-done",
  "    human_checklist:",
  "      contexts-reviewed: false",
  "repos:",
  "  api:",
  "    phases:",
  // O D1 só aprova com as fases do Foundation do repositório concluídas (ADR-0024, regra de fechamento).
  "      tech-stack:",
  "        status: done",
  "      arch:",
  "        status: done",
  "      coding-archaeology:",
  "        status: done",
  "      quality:",
  "        status: done",
  "      debt:",
  "        status: done",
  "      design:",
  "        status: done",
  "    gate_d1:",
  "      status: pending",
  "",
].join("\n");

const BACKLOG = 'sprints:\n  - id: "S1"\n    items:\n      - id: "S1-01"\n        status: "review"\n';

/** Um marcador que o "CLI" acrescenta no fim do arquivo enquanto segura o lock: tem que sobreviver à escrita do Cockpit. */
const CLI_MARK = "# escrito pelo CLI enquanto segurava o lock\n";

async function assertWaitsForLock(file: string, write: () => Promise<unknown>, expectAfter: (content: string) => void): Promise<void> {
  const before = fs.readFileSync(file, "utf-8");
  const lock = `${file}.lock`;
  fs.writeFileSync(lock, "99999");
  const pending = write();
  await new Promise((r) => setTimeout(r, 40));
  expect(fs.readFileSync(file, "utf-8"), "a escrita do Cockpit não pode acontecer com o lock do CLI de pé").toBe(before);
  fs.writeFileSync(file, before + CLI_MARK, "utf-8");
  fs.rmSync(lock);
  await pending;
  const after = fs.readFileSync(file, "utf-8");
  expect(after, "a escrita do CLI se perdeu").toContain(CLI_MARK);
  expectAfter(after);
  expect(fs.readdirSync(path.dirname(file)).filter((f) => f.includes(".tmp-"))).toEqual([]);
}

function workspaceWith(files: Record<string, string>): string {
  const root = tmp();
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
  }
  return root;
}

const ctx = (): ActionContext => ({
  configLoader: {} as ActionContext["configLoader"],
  extensionContext: {} as ActionContext["extensionContext"],
  promptMap: {},
  repository: new YamlStateRepository(),
  requestRefresh: vi.fn(),
  pushTelemetry: vi.fn(),
  approverName: async () => "Pessoa Fictícia",
});

afterEach(() => {
  workspace.workspaceFolders = undefined;
});

describe("A10 — escritas do Cockpit e do chat respeitam o lock do CLI", () => {
  const repo = new YamlStateRepository();
  const INIT = ".github/artifacts/initiatives.yaml";
  const DS = ".github/artifacts/delivery-state.yaml";

  it("REGRESSÃO: approveWaveItemHumanly espera o lock e não apaga a escrita do CLI (A10 / H-BUG-16)", async () => {
    const root = workspaceWith({ [INIT]: INITIATIVES });
    await assertWaitsForLock(
      path.join(root, INIT),
      async () => repo.approveWaveItemHumanly(root, "mod-x", "wave-1", "item-1", "2026-11-15T10:00:00Z"),
      (after) => expect(after).toContain("human_approved_at")
    );
  });

  it("REGRESSÃO: setActiveInitiativeInPlace espera o lock (A10)", async () => {
    const root = workspaceWith({ [INIT]: INITIATIVES });
    await assertWaitsForLock(path.join(root, INIT), async () => repo.setActiveInitiativeInPlace(root, "outra"), (after) =>
      expect(after).toMatch(/^active: outra$/m)
    );
  });

  it("REGRESSÃO: bumpActiveInitiativeCurrentPhaseInPlace espera o lock (A10)", async () => {
    const root = workspaceWith({ [INIT]: INITIATIVES });
    await assertWaitsForLock(path.join(root, INIT), async () => repo.bumpActiveInitiativeCurrentPhaseInPlace(root, "product"), (after) =>
      expect(after).toMatch(/^ {4}current_phase: product$/m)
    );
  });

  it("REGRESSÃO: markDeliveryPhaseDoneInPlace espera o lock (A10)", async () => {
    const root = workspaceWith({ [DS]: DELIVERY });
    const file = path.join(root, DS);
    await assertWaitsForLock(file, async () => repo.markDeliveryPhaseDoneInPlace(root, file, "business", "2026-11-15T10:00:00Z"), (after) =>
      expect(after).toContain("completed_at")
    );
  });

  it("REGRESSÃO: toggleDeliveryChecklistInPlace espera o lock (A10)", async () => {
    const root = workspaceWith({ [DS]: DELIVERY });
    const file = path.join(root, DS);
    await assertWaitsForLock(file, async () => repo.toggleDeliveryChecklistInPlace(root, file, "business", "brief-ok", true, "human_checklist"), (after) =>
      expect(after).toContain("brief-ok: true")
    );
  });

  it("REGRESSÃO: advanceDeliveryPhaseInPlace espera o lock (A10)", async () => {
    const root = workspaceWith({ [DS]: DELIVERY });
    const file = path.join(root, DS);
    await assertWaitsForLock(file, async () => repo.advanceDeliveryPhaseInPlace(file, "business", "2026-11-15T10:00:00Z", { id: "product" }), (after) =>
      expect(after).toContain("human-ok: true")
    );
  });

  it("REGRESSÃO: aprovar item de sprint espera o lock de sprint-backlog.yaml (A10)", async () => {
    const root = workspaceWith({ ".github/artifacts/sprint-backlog.yaml": BACKLOG });
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    await assertWaitsForLock(
      path.join(root, ".github/artifacts/sprint-backlog.yaml"),
      () => approveSprintItemHandler.handle({ type: "approveSprintItem", sprintItemId: "S1-01" }, ctx()),
      (after) => expect(after).toMatch(/status: "?done"?/)
    );
  });

  it("REGRESSÃO: aprovar o Gate D1 espera o lock de foundation-state.yaml (A10)", async () => {
    const root = workspaceWith({ ".github/artifacts/assessment/foundation-state.yaml": FOUNDATION });
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    await assertWaitsForLock(
      path.join(root, ".github/artifacts/assessment/foundation-state.yaml"),
      () => approveGateD1Handler.handle({ type: "approveGateD1", repoId: "api" }, ctx()),
      (after) => expect(after).toMatch(/gate_d1:\n {6}status: approved/)
    );
  });

  it("REGRESSÃO: marcar o checklist humano do Foundation espera o lock (A10)", async () => {
    const root = workspaceWith({ ".github/artifacts/assessment/foundation-state.yaml": FOUNDATION });
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    await assertWaitsForLock(
      path.join(root, ".github/artifacts/assessment/foundation-state.yaml"),
      () => toggleFoundationGuardRailHandler.handle({ type: "toggleFoundationGuardRail", phaseId: "domain", itemId: "contexts-reviewed", checked: true }, ctx()),
      (after) => expect(after).toContain("contexts-reviewed: true")
    );
  });
});
