/**
 * installAgentStructureCommand.ts — `<marca>._installAgentStructure`: o fluxo
 * brownfield do Wizard instala a estrutura agêntica num repositório existente.
 * F3.6, um módulo por comando.
 */

import * as vscode from "vscode";
import { StructureGenerator } from "../../generator/StructureGenerator";
import { startFoundation, PENDING_FOUNDATION_KEY } from "../startup/foundationResume";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerInstallAgentStructureCommand({ context, configLoader, mainPanelProvider, cockpitNextController, workspaceServices, ports, templateSource }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${BRAND.commandPrefix}._installAgentStructure`,
    async (projectName: string, targetDir: string, hostAdapter: string, maturityFrameworks?: string[]) => {
      const generator = new StructureGenerator(templateSource);
      try {
        await ports.notifier.progress(`${BRAND.displayName}: Instalando estrutura agêntica em "${projectName}"…`, async () => {
          await generator.installAgentStructure(targetDir, projectName, hostAdapter, maturityFrameworks);
        });
      } catch (err) {
        void ports.notifier.error(
          `${BRAND.displayName}: Erro ao instalar estrutura — ${err instanceof Error ? err.message : String(err)}`
        );
        throw err;
      }

      configLoader.invalidate();
      mainPanelProvider.refresh();

      // O workspace nasce vazio: quem coleta os repositórios é o @assessor, via
      // AskUserQuestion (o mesmo caminho serve para adicionar um repo depois).
      // Mas o agente só tem contexto se a pasta estiver aberta — e openFolder
      // recarrega a extensão. Por isso o disparo é persistido e retomado na
      // ativação seguinte.
      const alreadyOpen = ports.workspaceRoot.current() === targetDir;

      if (alreadyOpen) {
        // A pasta virou workspace Helyx agora: sobe o State Service antes do
        // Cockpit ler (na ativação ela ainda não era Helyx, ver C7).
        await workspaceServices.startIfBrandWorkspace(targetDir);
        void cockpitNextController.open();
        await startFoundation(hostAdapter, ports);
        return;
      }

      const action = await ports.notifier.info(
        `✓ ${BRAND.displayName}: workspace "${projectName}" criado. Abra a pasta para o @assessor mapear os repositórios.`,
        "Abrir workspace"
      );
      if (action === "Abrir workspace") {
        await context.globalState.update(PENDING_FOUNDATION_KEY, { dir: targetDir, host: hostAdapter });
        await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(targetDir));
        return; // a janela recarrega aqui
      }
      void cockpitNextController.open();
    }
  );
}
