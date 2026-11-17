/**
 * VsCodeChatHost.ts — a porta `ChatHost` sobre o comando
 * `workbench.action.chat.open` do VS Code.
 *
 * `openAgent` respeita o harness do workspace (H-BUG-24): no Copilot, passa o
 * agente em `mode`, a opção do comando que seleciona o modo/agente do chat (a
 * seleção de um custom agent por nome ainda precisa ser conferida num VS Code
 * de verdade, pendência registrada na F3.7); no Claude Code, o pedido vai como
 * `/<agente> …` para a área de transferência, com foco no Claude Code.
 */

import * as vscode from "vscode";
import type { ChatHost, ChatHostId, ChatOpenOptions } from "./ChatHost";
import { openInClaudeCode, toClaudeCodePrompt } from "./claudeCode";

export class VsCodeChatHost implements ChatHost {
  /** `resolveHost`: o harness do workspace (o container lê do config); default Copilot. */
  constructor(private readonly _resolveHost: () => Promise<ChatHostId> = () => Promise.resolve("copilot")) {}

  async open(query: string, options: ChatOpenOptions = {}): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.chat.open", options.partial ? { query, isPartialQuery: true } : { query });
  }

  async openAgent(agent: string, query: string, options: ChatOpenOptions = {}): Promise<void> {
    const host = options.host ?? (await this._resolveHost());
    if (host === "claude") {
      await openInClaudeCode(toClaudeCodePrompt(`@${agent} ${query}`));
      return;
    }
    await vscode.commands.executeCommand(
      "workbench.action.chat.open",
      options.partial ? { query, isPartialQuery: true, mode: agent } : { query, mode: agent }
    );
  }
}
