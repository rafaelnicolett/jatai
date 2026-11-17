/**
 * generateStructureCommand.ts — `<marca>._generateStructure`, comando interno
 * chamado pelo Wizard depois do submit (S1-EXT-04). F3.6, um módulo por comando.
 */

import * as vscode from "vscode";
import { StructureGenerator } from "../../generator/StructureGenerator";
import type { WizardState } from "../../types";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerGenerateStructureCommand({ configLoader, mainPanelProvider, cockpitNextController, ports, templateSource }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${BRAND.commandPrefix}._generateStructure`,
    async (state: WizardState) => {
      // O gerador não importa vscode (F3.4): a pasta aberta entra pela porta.
      const generator = new StructureGenerator(templateSource, { openFolder: (): string | undefined => ports.workspaceRoot.current() });
      // Resolve the target dir once — used for progress, success message and openFolder
      const targetDir = generator.resolveTargetDir(state);

      try {
        await ports.notifier.progress(`${BRAND.displayName}: Gerando estrutura do projeto…`, async () => {
          await generator.generate(state);
        });
      } catch (err) {
        void ports.notifier.error(
          `${BRAND.displayName}: Erro na geração — ${err instanceof Error ? err.message : String(err)}`
        );
        throw err; // re-throw so WizardController resets the button
      }

      const action = await ports.notifier.info(
        `✓ ${BRAND.displayName}: Projeto "${state.projectName}" gerado em ${targetDir}`,
        "Abrir pasta"
      );

      if (action === "Abrir pasta") {
        await vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(targetDir)
        );
      }

      configLoader.invalidate();
      mainPanelProvider.refresh();
      // Auto-open cockpit after successful generation
      void cockpitNextController.open();
    }
  );
}
