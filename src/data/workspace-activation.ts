/**
 * workspace-activation.ts
 *
 * Quando a ativação da extensão pode ter efeito colateral na pasta aberta
 * (C7 / H-BUG-14, F2.2, ADR-0015): subir o State Service HTTP, gravar
 * `server.json` com o token, vigiar `.github/artifacts/runs/` e garantir o
 * comando `/helyx` do Claude Code. Só em workspace Helyx (hoje) ou Jataí
 * (depois da F1.3, que acrescenta os marcadores da marca nova aqui), e só em
 * workspace confiável (G12, Workspace Trust).
 *
 * Funções puras: recebem os fatos já lidos do disco pela casca
 * (`extension.ts`) e só decidem. Não confundir com `validateWorkspaceDir` do
 * Wizard, que decide outra coisa (se uma pasta pode receber o kit).
 */

import { CONFIG_FILENAMES } from "./kit-version";

/**
 * Arquivos na raiz que marcam um workspace Helyx: o config atual e os das
 * marcas anteriores (ADR-0013). São os mesmos dos `activationEvents`
 * `workspaceContains:` do `package.json`.
 */
export const WORKSPACE_MARKER_FILES: readonly string[] = CONFIG_FILENAMES;

/** Pasta do layout do Claude Code, onde vive o `/helyx` (`.claude/commands/helyx.md`). */
export const CLAUDE_LAYOUT_DIR = ".claude";

export interface WorkspaceActivationFacts {
  /** Há uma pasta aberta (`workspaceFolders[0]`). */
  hasFolder: boolean;
  /**
   * `vscode.workspace.isTrusted`. O manifesto declara
   * `untrustedWorkspaces.supported: false`, então o VS Code nem ativa a
   * extensão em Restricted Mode; isto é a defesa em profundidade.
   */
  trusted: boolean;
  /** Nomes presentes na raiz dessa pasta. Basta trazer os de `WORKSPACE_MARKER_FILES` e `CLAUDE_LAYOUT_DIR`. */
  rootEntries: readonly string[];
}

/** A raiz tem o config de um workspace Helyx (nome atual ou legado). */
export function isHelyxWorkspace(rootEntries: readonly string[]): boolean {
  return WORKSPACE_MARKER_FILES.some((marker) => rootEntries.includes(marker));
}

/** State Service, `server.json` e RunsWatcher: só em workspace Helyx confiável. */
export function shouldStartWorkspaceServices(facts: WorkspaceActivationFacts): boolean {
  return facts.hasFolder && facts.trusted && isHelyxWorkspace(facts.rootEntries);
}

/** `/helyx` do Claude Code: só em workspace Helyx que já usa o layout do Claude (um workspace Copilot não ganha `.claude/`). */
export function shouldEnsureClaudeCommand(facts: WorkspaceActivationFacts): boolean {
  return shouldStartWorkspaceServices(facts) && facts.rootEntries.includes(CLAUDE_LAYOUT_DIR);
}
