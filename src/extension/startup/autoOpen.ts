/**
 * autoOpen.ts — UX de startup: abre o Cockpit quando há projeto e o Wizard na
 * primeira ativação sem projeto (F3.6, Extract Module de `extension.ts`).
 */

import * as vscode from "vscode";
import type { ConfigLoader } from "../../adapters/config/ConfigLoader";
import type { CockpitNextController } from "../../views/CockpitNextController";
import { BRAND } from "../../data/brand.pure";

export function scheduleAutoOpen(
  context: vscode.ExtensionContext,
  configLoader: ConfigLoader,
  cockpitNextController: CockpitNextController
): void {
  // Auto-detect existing Helyx project on activation
  void configLoader.isConfigured().then((configured) => {
    if (configured) {
      void vscode.commands.executeCommand(
        "setContext",
        `${BRAND.name}.projectInitialized`,
        true
      );
      // Auto-open cockpit every time a project is detected
      setTimeout(() => void cockpitNextController.open(), 800);
    } else {
      // No config found → first-time user: auto-open the setup wizard
      const hasSeenWizard = context.globalState.get<boolean>(`${BRAND.name}.wizardSeen`, false);
      if (!hasSeenWizard) {
        void context.globalState.update(`${BRAND.name}.wizardSeen`, true);
        // Pelo comando, que tem o lançador: se a pessoa já abriu o Wizard (barra lateral), não abre outro (H-BUG-53).
        setTimeout(() => void vscode.commands.executeCommand(`${BRAND.commandPrefix}.initializeDeliveryKit`), 1200);
      }
    }
  });
}
