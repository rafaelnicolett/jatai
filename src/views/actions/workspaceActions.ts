/**
 * workspaceActions.ts — SRP: ações de workspace/VS Code que não pertencem a
 * nenhuma outra categoria (rodar comando, abrir wizard/arquivo,
 * forçar refresh). Extraído verbatim do switch de
 * `CockpitController._handleMessage`.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import type { CommandHandler } from "./CommandHandler";
import { resolveInsideWorkspace } from "../../data/workspace-path";
import { BRAND } from "../../data/brand.pure";

export const runCommandHandler: CommandHandler = {
  type: "runCommand",
  async handle(msg) {
    // Só comandos do próprio Helyx: o webview não pode disparar comando
    // arbitrário do VS Code a partir de conteúdo renderizado. O prefixo vem
    // do brand.json, o mesmo que o webview usa para montar o id (ADR-0013).
    const command = msg.command as string;
    if (!command || !command.startsWith(`${BRAND.commandPrefix}.`)) return;
    await vscode.commands.executeCommand(command);
  },
};

export const openWizardHandler: CommandHandler = {
  type: "openWizard",
  async handle() {
    await vscode.commands.executeCommand(`${BRAND.commandPrefix}.initializeDeliveryKit`);
  },
};

export const openImportWizardHandler: CommandHandler = {
  type: "openImportWizard",
  async handle() {
    await vscode.commands.executeCommand(`${BRAND.commandPrefix}.initializeDeliveryKit`);
  },
};

export const openFileHandler: CommandHandler = {
  type: "openFile",
  async handle(msg) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    // `relPath` vem do webview: só abre o que fica dentro do workspace (A16b)
    const full = resolveInsideWorkspace(root, msg.relPath);
    if (full !== null && fs.existsSync(full)) {
      await vscode.window.showTextDocument(vscode.Uri.file(full));
    }
  },
};

export const refreshHandler: CommandHandler = {
  type: "refresh",
  async handle(_msg, ctx) {
    await ctx.requestRefresh();
  },
};
