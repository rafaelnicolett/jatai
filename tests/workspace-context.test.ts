import { describe, it, expect } from "vitest";
import { RecordingContextKeys } from "../src/adapters/context/ContextKeys";
import { FixedWorkspaceRoot } from "../src/adapters/workspace/WorkspaceRoot";
import { IS_WORKSPACE_KEY, bindWorkspaceContext } from "../src/extension/startup/workspaceContext";
import { CONFIG_FILENAMES } from "../src/data/kit-version";
import { BRAND } from "../src/data/brand.pure";
import type { WorkspaceActivationFacts } from "../src/data/workspace-activation";

/**
 * Primeiro uso (G9, F4.3): a context key `<marca>.isWorkspace`. Dublês escritos
 * à mão para as portas, sem VS Code e sem `vi.mock`.
 */

/** Os fatos da pasta como a casca os leria: o que a pasta tem na raiz, mudável pelo teste. */
function disk(initial: Record<string, string[]>): { entries: Record<string, string[]>; readFacts(root: string | undefined): WorkspaceActivationFacts } {
  const entries = { ...initial };
  return {
    entries,
    readFacts: (root) => ({ hasFolder: root !== undefined, trusted: true, rootEntries: root === undefined ? [] : (entries[root] ?? []) }),
  };
}

function bind(root: string | undefined, folders: Record<string, string[]>): { keys: RecordingContextKeys; workspace: FixedWorkspaceRoot; fs: ReturnType<typeof disk>; context: ReturnType<typeof bindWorkspaceContext> } {
  const keys = new RecordingContextKeys();
  const workspace = new FixedWorkspaceRoot(root);
  const fs = disk(folders);
  return { keys, workspace, fs, context: bindWorkspaceContext({ contextKeys: keys, workspaceRoot: workspace, readFacts: fs.readFacts }) };
}

describe("a context key <marca>.isWorkspace", () => {
  it("o nome da key é da marca", () => {
    expect(IS_WORKSPACE_KEY).toBe(`${BRAND.name}.isWorkspace`);
  });

  it("sem pasta aberta vale false, e numa pasta qualquer também", () => {
    expect(bind(undefined, {}).keys.values.get(IS_WORKSPACE_KEY)).toBe(false);
    expect(bind("/qualquer", { "/qualquer": ["README.md", ".git"] }).keys.values.get(IS_WORKSPACE_KEY)).toBe(false);
  });

  it.each(CONFIG_FILENAMES.map((name) => [name]))("numa pasta com o config %s (o da marca, o de uma marca anterior ou o legado) vale true", (name) => {
    expect(bind("/ws", { "/ws": [name] }).keys.values.get(IS_WORKSPACE_KEY)).toBe(true);
  });

  it("só .github/ ou .claude/ não bastam: quase todo repositório os tem", () => {
    expect(bind("/repo", { "/repo": [".github", ".claude"] }).keys.values.get(IS_WORKSPACE_KEY)).toBe(false);
  });

  it("refaz a key quando as pastas abertas mudam, sem recarregar", () => {
    const { keys, workspace } = bind("/qualquer", { "/qualquer": [], "/ws": [BRAND.files.config] });
    expect(keys.values.get(IS_WORKSPACE_KEY)).toBe(false);
    workspace.change("/ws");
    expect(keys.values.get(IS_WORKSPACE_KEY)).toBe(true);
    workspace.change(undefined);
    expect(keys.values.get(IS_WORKSPACE_KEY)).toBe(false);
  });

  it("refresh() refaz a key depois que o config aparece na pasta aberta (o Wizard instalou)", async () => {
    const { keys, fs, context } = bind("/ws", { "/ws": [] });
    expect(keys.values.get(IS_WORKSPACE_KEY)).toBe(false);
    fs.entries["/ws"] = [BRAND.files.config];
    await context.refresh();
    expect(keys.values.get(IS_WORKSPACE_KEY)).toBe(true);
  });

  it("depois do dispose, mudar as pastas não grava mais nada", () => {
    const { keys, workspace, context } = bind("/ws", { "/ws": [] });
    context.dispose();
    const before = keys.history.length;
    workspace.change("/outra");
    expect(keys.history).toHaveLength(before);
  });
});
