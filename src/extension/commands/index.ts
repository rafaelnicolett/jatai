/**
 * index.ts — registra os comandos da extensão, na ordem de sempre (F3.6).
 * Cada comando mora no seu módulo; aqui só a lista.
 */

import type * as vscode from "vscode";
import type { ExtensionCommandDeps } from "./types";
import { registerInitializeDeliveryKitCommand } from "./wizardCommand";
import { registerOpenCockpitCommand, registerRefreshTreeViewCommand } from "./cockpitCommands";
import { registerSyncReposCommand } from "./syncReposCommand";
import { registerMigrateKitCommand } from "./migrateKitCommand";
import { registerRevealArtifactsCommand } from "./revealArtifactsCommand";
import { registerStartStackCommand, registerStopStackCommand } from "./stackCommands";
import { registerGenerateStructureCommand } from "./generateStructureCommand";
import { registerInstallAgentStructureCommand } from "./installAgentStructureCommand";
import { registerConnectedExtensionsCommand } from "./connectedExtensionsCommand";
import { registerSendArtifactsCommand } from "./sendArtifactsCommand";

export type { ExtensionCommandDeps, WorkspaceServicesStarter } from "./types";

export function registerExtensionCommands(deps: ExtensionCommandDeps): vscode.Disposable[] {
  return [
    registerInitializeDeliveryKitCommand(deps),
    registerOpenCockpitCommand(deps),
    registerSyncReposCommand(deps),
    registerMigrateKitCommand(deps),
    registerRevealArtifactsCommand(deps),
    registerRefreshTreeViewCommand(deps),
    registerStartStackCommand(deps),
    registerStopStackCommand(deps),
    registerGenerateStructureCommand(deps),
    registerInstallAgentStructureCommand(deps),
    registerConnectedExtensionsCommand(deps),
    registerSendArtifactsCommand(deps),
  ];
}
