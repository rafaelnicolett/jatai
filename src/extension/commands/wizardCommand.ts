/**
 * wizardCommand.ts — `<marca>.initializeDeliveryKit`: abre o Wizard (F3.6, um módulo por comando).
 */

import * as vscode from "vscode";
import { WizardController } from "../../wizard/WizardController";
import { WizardLauncher } from "../../wizard/WizardLauncher";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerInitializeDeliveryKitCommand({ context, configLoader, ports, workspaceContext, templateSource }: ExtensionCommandDeps): vscode.Disposable {
  // Um Wizard por vez (H-BUG-53): pedir de novo com o painel aberto só o traz à frente.
  const launcher = new WizardLauncher(
    (): WizardController =>
      new WizardController(context, configLoader, templateSource, {
        folderPicker: ports.folderPicker,
        workspaceRoot: ports.workspaceRoot,
        onInstalled: () => void workspaceContext?.refresh(),
      })
  );
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.initializeDeliveryKit`, () => launcher.open());
}
