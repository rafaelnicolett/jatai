/**
 * VsCodeWorkspaceRoot.ts — a porta `WorkspaceRoot` sobre a API do VS Code.
 */

import * as vscode from "vscode";
import type { WorkspaceRoot } from "./WorkspaceRoot";

export class VsCodeWorkspaceRoot implements WorkspaceRoot {
  current(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  all(): readonly string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  }

  onDidChange(listener: () => void): { dispose(): void } {
    return vscode.workspace.onDidChangeWorkspaceFolders(() => listener());
  }
}
