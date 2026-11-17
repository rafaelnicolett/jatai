import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workspace } from "vscode";
import { switchInitiativeHandler } from "../src/views/actions/initiativeActions";
import type { ActionContext } from "../src/views/actions/CommandHandler";
import { YamlStateRepository } from "../src/state/repository/StateRepository";

const tmpWorkspace = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-initiative-actions-"));

const writeInitiatives = (root: string, content: string): string => {
  const full = path.join(root, ".github/artifacts/initiatives.yaml");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return full;
};

const fakeCtx = (): ActionContext => ({
  configLoader: {} as ActionContext["configLoader"],
  extensionContext: {} as ActionContext["extensionContext"],
  promptMap: {},
  repository: new YamlStateRepository(),
  requestRefresh: vi.fn(),
  pushTelemetry: vi.fn(),
});

describe("switchInitiativeHandler", () => {
  it("substitui o campo `active` já existente", async () => {
    const root = tmpWorkspace();
    const filePath = writeInitiatives(
      root,
      `active: mod-billing\ninitiatives:\n  - id: mod-billing\n    name: Billing\n    status: planned\n  - id: feat-lojas\n    name: Lojas\n    status: planned\n`
    );
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    await switchInitiativeHandler.handle({ id: "feat-lojas" }, fakeCtx());

    expect(fs.readFileSync(filePath, "utf-8")).toContain("active: feat-lojas");
  });

  it("adiciona `active` quando o arquivo não tem o campo — sem isto o switch falhava em silêncio", async () => {
    const root = tmpWorkspace();
    const filePath = writeInitiatives(
      root,
      `initiatives:\n  - id: mod-billing\n    name: Billing\n    status: planned\n  - id: feat-lojas\n    name: Lojas\n    status: planned\n`
    );
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];

    await switchInitiativeHandler.handle({ id: "feat-lojas" }, fakeCtx());

    expect(fs.readFileSync(filePath, "utf-8")).toMatch(/^active: feat-lojas$/m);
  });
});
