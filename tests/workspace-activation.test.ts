import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  OPENCODE_LAYOUT_DIR,
  WORKSPACE_MARKER_FILES,
  isHelyxWorkspace,
  shouldEnsureClaudeCommand,
  shouldEnsureOpenCodeCommand,
  shouldStartWorkspaceServices,
} from "../src/data/workspace-activation";

/**
 * Predicado de ativação (C7 / H-BUG-14, F2.2): efeito colateral na pasta
 * aberta só em workspace Helyx. Funções puras — os fatos vêm prontos.
 */

describe("workspace-activation — quando a ativação pode mexer na pasta aberta", () => {
  it("workspace Helyx = config na raiz, com o nome atual ou o legado", () => {
    expect(isHelyxWorkspace(["helyx.config.yaml"])).toBe(true);
    expect(isHelyxWorkspace(["ai-sdk.config.yaml"])).toBe(true);
    expect(isHelyxWorkspace([".github", ".claude", "README.md"])).toBe(false);
    expect(isHelyxWorkspace([])).toBe(false);
  });

  it("State Service e server.json: só com pasta aberta, confiável E workspace Helyx", () => {
    expect(shouldStartWorkspaceServices({ hasFolder: true, trusted: true, rootEntries: ["helyx.config.yaml"] })).toBe(true);
    expect(shouldStartWorkspaceServices({ hasFolder: true, trusted: true, rootEntries: [".github", ".claude"] })).toBe(false);
    expect(shouldStartWorkspaceServices({ hasFolder: false, trusted: true, rootEntries: ["helyx.config.yaml"] })).toBe(false);
  });

  it("G12: em workspace não confiável (Restricted Mode) nada roda, nem em workspace Helyx", () => {
    expect(shouldStartWorkspaceServices({ hasFolder: true, trusted: false, rootEntries: ["helyx.config.yaml"] })).toBe(false);
    expect(shouldEnsureClaudeCommand({ hasFolder: true, trusted: false, rootEntries: ["helyx.config.yaml", ".claude"] })).toBe(false);
  });

  it("/helyx do Claude Code: só em workspace Helyx que já tem .claude/ (Copilot não ganha .claude/)", () => {
    expect(shouldEnsureClaudeCommand({ hasFolder: true, trusted: true, rootEntries: ["helyx.config.yaml", ".claude"] })).toBe(true);
    expect(shouldEnsureClaudeCommand({ hasFolder: true, trusted: true, rootEntries: ["helyx.config.yaml"] })).toBe(false);
    expect(shouldEnsureClaudeCommand({ hasFolder: true, trusted: true, rootEntries: [".claude"] })).toBe(false);
  });

  it("/jatai do OpenCode: só em workspace Helyx que já tem .opencode/", () => {
    expect(OPENCODE_LAYOUT_DIR).toBe(".opencode");
    expect(shouldEnsureOpenCodeCommand({ hasFolder: true, trusted: true, rootEntries: ["jatai.config.yaml", ".opencode"] })).toBe(true);
    expect(shouldEnsureOpenCodeCommand({ hasFolder: true, trusted: true, rootEntries: ["jatai.config.yaml"] })).toBe(false);
    expect(shouldEnsureOpenCodeCommand({ hasFolder: true, trusted: true, rootEntries: [".opencode"] })).toBe(false);
    expect(shouldEnsureOpenCodeCommand({ hasFolder: true, trusted: false, rootEntries: ["jatai.config.yaml", ".opencode"] })).toBe(false);
  });

  it("G12: o manifesto declara que a extensão não roda em workspace não confiável", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")) as {
      capabilities?: { untrustedWorkspaces?: { supported?: unknown; description?: unknown } };
    };
    expect(pkg.capabilities?.untrustedWorkspaces?.supported).toBe(false);
    expect(typeof pkg.capabilities?.untrustedWorkspaces?.description).toBe("string");
  });

  it("os marcadores são exatamente os activationEvents workspaceContains: do package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")) as { activationEvents: string[] };
    const fromManifest = pkg.activationEvents.filter((e) => e.startsWith("workspaceContains:")).map((e) => e.slice("workspaceContains:".length));
    expect(fromManifest.sort()).toEqual([...WORKSPACE_MARKER_FILES].sort());
    expect(pkg.activationEvents).not.toContain("onStartupFinished");
  });
});
