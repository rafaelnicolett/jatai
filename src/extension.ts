/**
 * extension.ts — ponto de entrada da extensão: só wiring (F3.6, ADR-0016).
 *
 * O container constrói as dependências uma vez por ativação; os comandos
 * moram em `extension/commands/`, a UX e os serviços de startup em
 * `extension/startup/`.
 */

import * as vscode from "vscode";
import { StatusBarManager } from "./views/StatusBarManager";
import { MainPanelProvider } from "./views/MainPanelProvider";
import { CockpitNextController } from "./views/CockpitNextController";
import { createDeliveryStateAccess } from "./views/actions/deliveryStateAccess";
import { registerConciergeParticipant } from "./chat/ConciergeParticipant";
import { registerArtifactValidation } from "./codelens/ArtifactValidationProvider";
import { shouldEnsureClaudeCommand, shouldEnsureOpenCodeCommand, shouldStartWorkspaceServices } from "./data/workspace-activation";
import { ExtensionContainer } from "./extension/container";
import { createVsCodePorts } from "./extension/ports";
import { PENDING_FOUNDATION_KEY, resumePendingFoundation as resumeFoundation } from "./extension/startup/foundationResume";
import { checkKitVersion } from "./extension/startup/kitNag";
import { ensureClaudeSlashCommand, ensureOpenCodeSlashCommand } from "./extension/startup/claudeCommand";
import { readWorkspaceActivationFacts } from "./extension/startup/workspaceServices";
import { scheduleAutoOpen } from "./extension/startup/autoOpen";
import { bindWorkspaceContext } from "./extension/startup/workspaceContext";
import { registerWelcomeView } from "./extension/startup/welcomeView";
import { registerExtensionCommands } from "./extension/commands";
import { ProviderHub } from "./extension/api/ProviderHub";
import { createJataiApi, type JataiApiV1 } from "./extension/api/createJataiApi";
import { createVsCodeIdentity } from "./extension/api/identity";
import { MementoConsentStore } from "./extension/api/ConsentStore";
import { ProviderPorts } from "./extension/api/providerPorts";
import { readActiveInitiativeIdSafe } from "./extension/api/artifactFiles";

// Reexportados para os testes que importam de `src/extension` (`tests/extension-resume-foundation.test.ts`).
export { PENDING_FOUNDATION_KEY };

/** Retomada do Foundation com as portas de produção (a mesma que `activate()` dispara). */
export function resumePendingFoundation(context: vscode.ExtensionContext): Promise<void> {
  return resumeFoundation(context, container?.ports ?? createVsCodePorts(context));
}

/** Container da ativação corrente — descartado em `deactivate()`. */
let container: ExtensionContainer | null = null;
/** Registro da API pública (F2.5) — descartado em `deactivate()`. */
let apiHub: ProviderHub | null = null;

export function activate(context: vscode.ExtensionContext): JataiApiV1 {
  // As portas de templates e de sincronização são delegadas ao hub: até a
  // ativação terminar de montá-lo, respondem como Null (edição aberta).
  const providerPorts = new ProviderPorts();
  container = new ExtensionContainer(context, vscode.workspace.workspaceFolders, {
    templateSource: providerPorts.templateSource,
    remoteSync: providerPorts.remoteSync,
  });
  const { configLoader, stateRepository, workspaceServices, telemetry, ports } = container;

  // A API pública (F2.5, ADR-0023): o hub liga as portas delegadas ao
  // consentimento por workspace e recebe os RunEvents do State Service.
  const identity = createVsCodeIdentity(context);
  apiHub = new ProviderHub({
    store: new MementoConsentStore(context.workspaceState),
    notifier: ports.notifier,
    callerId: (): string | null => identity.callerId(),
    describeExtension: (id: string): { id: string; displayName: string } | undefined => identity.describe(id),
    workspaceRoot: (): string | undefined => ports.workspaceRoot.current(),
    isTrusted: (): boolean => vscode.workspace.isTrusted,
    activeInitiativeId: (): string | null => {
      const root = ports.workspaceRoot.current();
      return root ? readActiveInitiativeIdSafe(root) : null;
    },
  });
  providerPorts.attach(apiHub);
  apiHub.bindEventBus(container.eventBus);

  // Workspace recém-criado que reabriu nesta janela → o @assessor assume daqui.
  void resumeFoundation(context, ports);

  // Estrutura do workspace defasada em relação ao plugin? Avisa uma vez.
  void checkKitVersion(context, ports);

  // Efeitos colaterais na pasta aberta (State Service HTTP local em
  // 127.0.0.1, `server.json` com o token, RunsWatcher e o `/helyx`) só em
  // workspace Helyx (C7 / H-BUG-14, F2.2, ADR-0015). Numa pasta qualquer a
  // extensão ativa (view, comando, chat) sem gravar nada. Se o kit for
  // instalado na pasta aberta depois, `_installAgentStructure` sobe os
  // serviços na hora.
  const workspaceRoot = ports.workspaceRoot.current();
  const workspaceFacts = readWorkspaceActivationFacts(workspaceRoot);
  if (workspaceRoot && shouldStartWorkspaceServices(workspaceFacts)) {
    void workspaceServices.start(workspaceRoot);
  }

  // O Modo Online saiu da v1 (ADR-0015). Versões anteriores injetavam
  // HELYX_CLOUD_API_* nos terminais por esta coleção, que o VS Code persiste
  // entre sessões: limpar aqui garante que nenhum terminal herde URL, tenant
  // ou token antigos depois do upgrade.
  context.environmentVariableCollection.clear();

  const mainPanelProvider = new MainPanelProvider(context, configLoader);
  const cockpitNextController = new CockpitNextController(context, {
    configLoader,
    repository: stateRepository,
    eventBus: container.eventBus,
    telemetry,
    clock: ports.clock,
    workspaceRoot: ports.workspaceRoot,
    settings: ports.settings,
  });
  const statusBar = new StatusBarManager();
  const deliveryStateAccess = createDeliveryStateAccess(context, configLoader, stateRepository, telemetry);

  // Register @helyx chat participant (gets DeliveryStateAccess for HITL toggles)
  registerConciergeParticipant(context, deliveryStateAccess, ports);

  // Register CodeLens validation overlays on artifact files
  registerArtifactValidation(context, deliveryStateAccess);

  // Register webview view provider (cockpit)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MainPanelProvider.viewType,
      mainPanelProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Primeiro uso (G9, F4.3): a key `<marca>.isWorkspace` diz se a pasta aberta é workspace da marca, e a
  // view de boas-vindas (só em pasta que não é) convida a começar. A key se refaz quando as pastas mudam e
  // quando o Wizard instala na pasta aberta.
  const workspaceContext = bindWorkspaceContext({ contextKeys: ports.contextKeys, workspaceRoot: ports.workspaceRoot, readFacts: readWorkspaceActivationFacts });
  context.subscriptions.push(workspaceContext, registerWelcomeView());

  // Register commands
  context.subscriptions.push(
    statusBar,
    ...registerExtensionCommands({ context, configLoader, mainPanelProvider, cockpitNextController, workspaceServices, ports, workspaceContext, apiHub, templateSource: container.templateSource })
  );

  // `/helyx` do Claude Code: só em workspace Helyx com layout Claude (C7).
  if (shouldEnsureClaudeCommand(workspaceFacts)) void ensureClaudeSlashCommand(ports);
  // `/jatai` do OpenCode: só em workspace Helyx com layout OpenCode (epic-9).
  if (shouldEnsureOpenCodeCommand(workspaceFacts)) void ensureOpenCodeSlashCommand(ports);

  scheduleAutoOpen(context, configLoader, cockpitNextController);
  return createJataiApi(apiHub);
}

export function deactivate(): void {
  apiHub?.dispose();
  apiHub = null;
  // cleanup handled by context.subscriptions; o container para o State Service e o watcher
  container?.dispose();
  container = null;
}
