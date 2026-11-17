/**
 * container.ts — composition root explícito da extensão (F3.6, Introduce
 * Container, ADR-0016).
 *
 * Constrói uma vez por ativação o que antes era singleton de módulo:
 * - o repositório de estado (`stateRepository`, `src/state/repository`);
 * - o barramento de eventos do State Service (`stateServiceEventBus`, `src/server/EventBus.ts`);
 * - o estado mutável de `extension.ts` (servidor, promessa de prontidão e
 *   watcher), agora em `WorkspaceServices`.
 * O terceiro singleton da análise, o `templateCache`, saiu na F2.1 com o
 * registry (ADR-0015): o Wizard e o gerador recebem a porta `TemplateSource`.
 *
 * Portas de extensão (ADR-0023, F2.5): `telemetry`, `templateSource` e
 * `remoteSync` nascem com a implementação Null, a da edição aberta
 * (ADR-0015). A API de extensão da F2.5 liga um provedor consentido trocando
 * o que o container entrega aqui; nenhum consumidor constrói a sua.
 */

import type * as vscode from "vscode";
import { ConfigLoader } from "../adapters/config/ConfigLoader";
import { NullTelemetrySink, type TelemetrySink } from "../adapters/telemetry/TelemetrySink";
import { NullTemplateSource, type TemplateSource } from "../adapters/templates/TemplateSource";
import { NullRemoteSyncProvider, type RemoteSyncProvider } from "../adapters/sync/RemoteSyncProvider";
import { YamlStateRepository, type StateRepository } from "../state/repository/StateRepository";
import { EventBus } from "../server/EventBus";
import { WorkspaceServices } from "./startup/workspaceServices";
import { createVsCodePorts, type HostPorts } from "./ports";

/** Substituições aceitas pelo container (testes e, na F2.5, a API de extensão). */
export interface ContainerOverrides {
  ports?: HostPorts;
  stateRepository?: StateRepository;
  eventBus?: EventBus;
  telemetry?: TelemetrySink;
  templateSource?: TemplateSource;
  remoteSync?: RemoteSyncProvider;
}

export class ExtensionContainer implements vscode.Disposable {
  readonly stateRepository: StateRepository;
  readonly eventBus: EventBus;
  readonly configLoader: ConfigLoader;
  readonly workspaceServices: WorkspaceServices;
  /** Portas da casca (relógio, raiz do workspace…), com a implementação do VS Code. */
  readonly ports: HostPorts;
  /** Porta de saída de telemetria; Null na edição aberta (ADR-0015, ADR-0023). */
  readonly telemetry: TelemetrySink;
  /** Porta de templates externos; Null na edição aberta (ADR-0015, ADR-0023). */
  readonly templateSource: TemplateSource;
  /** Porta de espelho remoto; Null e ainda sem consumidor (ADR-0015, ADR-0023). */
  readonly remoteSync: RemoteSyncProvider;

  constructor(
    readonly context: vscode.ExtensionContext,
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
    overrides: ContainerOverrides = {}
  ) {
    this.configLoader = new ConfigLoader(workspaceFolders);
    // O chat leva pedidos ao harness do workspace, lido do config a cada vez (H-BUG-24).
    this.ports = overrides.ports ?? createVsCodePorts(context, () => this.configLoader.hostAdapter());
    this.stateRepository = overrides.stateRepository ?? new YamlStateRepository();
    this.eventBus = overrides.eventBus ?? new EventBus();
    this.telemetry = overrides.telemetry ?? new NullTelemetrySink();
    this.templateSource = overrides.templateSource ?? new NullTemplateSource();
    this.remoteSync = overrides.remoteSync ?? new NullRemoteSyncProvider();
    this.workspaceServices = new WorkspaceServices({
      context,
      secrets: this.ports.secrets,
      fileWatcher: this.ports.fileWatcher,
      repository: this.stateRepository,
      eventBus: this.eventBus,
    });
  }

  /** Para os serviços de workspace (State Service e watcher). As subscriptions o VS Code descarta sozinho. */
  dispose(): void {
    this.workspaceServices.stop();
  }
}
