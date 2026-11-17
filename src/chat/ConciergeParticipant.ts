/**
 * ConciergeParticipant.ts — registro do participante de chat (F3.7).
 *
 * Só liga as peças: o turno (`ConciergeTurn`), os comandos dos botões
 * (`conciergeCommands`) e o provedor de chips. Catálogo, regra HITL,
 * renderers e prompt moram em `catalog.ts`, `hitl/`, `render/` e `prompt/`.
 */

import * as vscode from "vscode";
import type { DeliveryStateAccess } from "../views/actions/deliveryStateAccess";
import { BRAND } from "../data/brand.pure";
import { createConciergeTurn, type ConciergeOutput } from "./ConciergeTurn";
import { registerConciergeCommands } from "./conciergeCommands";
import { streamChatSink } from "./render/streamChatSink";
import type { WorkspaceRoot } from "../adapters/workspace/WorkspaceRoot";
import type { LanguageModel } from "../adapters/lm/LanguageModel";
import type { ChatHost } from "../adapters/chat/ChatHost";
import type { Notifier } from "../adapters/notifier/Notifier";

/** As portas do container que o chat usa. */
export interface ConciergePorts {
  workspaceRoot: WorkspaceRoot;
  languageModel: LanguageModel;
  chatHost: ChatHost;
  notifier: Notifier;
}

function outputFor(stream: vscode.ChatResponseStream): ConciergeOutput {
  return { ...streamChatSink(stream), progress: (text) => stream.progress(text) };
}

export function registerConciergeParticipant(
  context: vscode.ExtensionContext,
  cockpit: DeliveryStateAccess,
  ports: ConciergePorts,
): void {
  const turn = createConciergeTurn(ports);
  const participant = vscode.chat.createChatParticipant(
    BRAND.participant.id,
    (request: vscode.ChatRequest, _ctx: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) =>
      turn(request, outputFor(stream), token)
  );
  participant.iconPath = new vscode.ThemeIcon("rocket");

  participant.followupProvider = {
    provideFollowups(
      result: vscode.ChatResult,
      _ctx: vscode.ChatContext,
      _token: vscode.CancellationToken
    ): vscode.ChatFollowup[] {
      return (result.metadata?.["followups"] as vscode.ChatFollowup[]) ?? [];
    },
  };

  context.subscriptions.push(participant, ...registerConciergeCommands({ cockpit, ...ports }));
}
