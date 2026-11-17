/**
 * types.ts — o que os comandos da extensão recebem do composition root
 * (F3.6). Cada módulo de comando desestrutura só o que usa.
 */

import type * as vscode from "vscode";
import type { ConfigLoader } from "../../adapters/config/ConfigLoader";
import type { TemplateSource } from "../../adapters/templates/TemplateSource";
import type { MainPanelProvider } from "../../views/MainPanelProvider";
import type { CockpitNextController } from "../../views/CockpitNextController";
import type { ProviderHub } from "../api/ProviderHub";
import type { HostPorts } from "../ports";

/** Sobe os serviços de workspace (State Service e RunsWatcher) numa pasta. */
export interface WorkspaceServicesStarter {
  /** Só sobe se a pasta for workspace da marca (C7 / H-BUG-14); uma vez por ativação. */
  startIfBrandWorkspace(root: string): Promise<void>;
}

/** A context key do primeiro uso (G9): o comando que instala a refaz para o convite sumir sem recarregar. */
export interface WorkspaceContextRefresher {
  refresh(): Promise<void>;
}

export interface ExtensionCommandDeps {
  context: vscode.ExtensionContext;
  configLoader: ConfigLoader;
  mainPanelProvider: MainPanelProvider;
  cockpitNextController: CockpitNextController;
  workspaceServices: WorkspaceServicesStarter;
  ports: HostPorts;
  workspaceContext?: WorkspaceContextRefresher;
  /** API de extensão (F2.5); ausente em quem monta os comandos sem ela. */
  apiHub?: ProviderHub;
  /** Porta de templates consentida (F2.5); sem ela, o gerador usa o scaffold local. */
  templateSource?: TemplateSource;
}
