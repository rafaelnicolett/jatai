/**
 * cockpitCommands.ts — abrir o Cockpit e o refresh da view lateral (F3.6, um módulo por comando).
 */

import * as vscode from "vscode";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerOpenCockpitCommand({ cockpitNextController }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.openCockpitNext`, async () => {
    await cockpitNextController.open();
  });
}

export function registerRefreshTreeViewCommand({ mainPanelProvider }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.refreshTreeView`, () => {
    mainPanelProvider.refresh();
  });
}
