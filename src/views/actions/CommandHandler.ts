/**
 * CommandHandler.ts
 *
 * O contrato SOLID que substitui o switch de ~140 linhas que existia dentro
 * do `CockpitController._handleMessage`:
 *
 *   - **SRP**: cada arquivo em `actions/*Actions.ts` cuida de UMA
 *     responsabilidade (prompt, workspace, iniciativa, tutorial, guard rail).
 *   - **OCP**: adicionar um verbo novo é registrar um `CommandHandler` novo em
 *     `registry.ts` — nunca editar um switch gigante.
 *   - **DIP**: um handler nunca lê campo privado de um controller concreto.
 *     Ele recebe suas dependências via `ActionContext` — é isso que permite
 *     `CockpitNextController` e `deliveryStateAccess.ts` compartilharem o
 *     MESMO registry/ações sem se acoplarem a nenhuma classe "controller".
 *     `pushTelemetry`, por exemplo, é a CAPACIDADE abstrata "enviar um evento
 *     de telemetria" — o handler não sabe (nem precisa saber) qual
 *     `TelemetrySink` concreto está por trás.
 *   - **ISP**: a interface `CommandHandler` tem um método só — nada força um
 *     handler a implementar superfície que não usa.
 */

import type * as vscode from "vscode";
import type { ConfigLoader } from "../../adapters/config/ConfigLoader";
import type { TelemetryEvent } from "../../adapters/telemetry/TelemetrySink";
import type { StateRepository } from "../../state/repository/StateRepository";
import type { ApproverNameSource } from "../../state/identity/git-user-name";
import type { HostToWebviewMessage } from "../../shared/cockpit-protocol";

export type { TelemetryEvent } from "../../adapters/telemetry/TelemetrySink";

export interface ActionContext {
  configLoader: ConfigLoader;
  extensionContext: vscode.ExtensionContext;
  /** Repositório de estado, entregue pelo container (F3.6): nenhum handler importa o singleton. */
  repository: StateRepository;
  /** `promptId -> texto do prompt` do fluxo greenfield — hoje sempre `{}` (ver `ConciergeParticipant.PHASE_TEMPLATE`/`data/phase-prompts.ts` para os catálogos vivos de prompt). */
  promptMap: Record<string, string>;
  /** Pede ao controller dono para re-renderizar / repostar o snapshot — o handler não decide COMO. */
  requestRefresh(): void | Promise<void>;
  /** Envia um evento de telemetria (Fase 1 sync) — abstrai o `TelemetrySink` concreto. */
  pushTelemetry(event: TelemetryEvent): void;
  /**
   * Responde ao webview que pediu (F4.2, aditivo): o resultado de uma aprovação
   * de gate ou do registro de uma decisão. Ausente onde ninguém olha a resposta.
   */
  reply?(msg: HostToWebviewMessage): void;
  /** Quem aprova (ADR-0024): o `user.name` do git do workspace. Default `gitUserName`; os testes injetam. */
  approverName?: ApproverNameSource;
}

export interface CommandHandler {
  readonly type: string;
  /** `msg` é a mensagem inteira recebida via `postMessage` (o `type` mais os campos daquele verbo). */
  handle(msg: Record<string, unknown>, ctx: ActionContext): Promise<void> | void;
}
