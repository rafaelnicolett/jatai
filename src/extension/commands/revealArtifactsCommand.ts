/**
 * revealArtifactsCommand.ts — `<marca>.revealArtifacts` (F3.6, um módulo por comando).
 *
 * Abre a pasta de artefatos — tudo que o Discovery produziu vive lá, e é
 * file-as-state: o operador precisa conseguir abrir e ler.
 */

import * as vscode from "vscode";
import * as path from "path";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerRevealArtifactsCommand({ ports }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.revealArtifacts`, async () => {
    const root = ports.workspaceRoot.current();
    if (!root) return;
    await vscode.commands.executeCommand(
      "revealInExplorer",
      vscode.Uri.file(path.join(root, ".github", "artifacts"))
    );
  });
}
