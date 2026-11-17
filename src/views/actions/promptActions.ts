/**
 * promptActions.ts — SRP: injetar prompt no chat do host configurado.
 *
 * `injectPrompt` (fase greenfield estática) e `injectRaw` (prompt já
 * montado, o caminho que o brownfield usa) extraídos verbatim do switch de
 * `CockpitController._handleMessage`.
 *
 * O mapa `promptId → texto` (`ctx.promptMap`) é injetado, não importado —
 * é o `PHASES`/`_promptMap` do greenfield, que continua vivendo em
 * `CockpitController.ts` (é usado por muita coisa de renderização ali, mover
 * seria um risco desproporcional a este refactor). Isso é Inversão de
 * Dependência de verdade: o handler não sabe nem precisa saber de onde vem o
 * mapa — cada controller injeta o seu (o Cockpit Next, que ainda não expõe UI
 * greenfield, pode injetar `{}` sem quebrar nada).
 */

import * as vscode from "vscode";
import type { CommandHandler } from "./CommandHandler";
import { openChatWithPrompt, getHostAdapter, getActiveSyncContext } from "./hostChat";
import { openInOpenCode } from "../../adapters/chat/openCode";
import { BRAND } from "../../data/brand.pure";

export const injectPromptHandler: CommandHandler = {
  type: "injectPrompt",
  async handle(msg, ctx) {
    const promptId = msg.promptId as string;
    const prompt = ctx.promptMap[promptId];
    if (!prompt) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const syncCtx = getActiveSyncContext(root);
    ctx.pushTelemetry({
      event_type: "phase_started",
      initiative_id: syncCtx.initiativeId,
      initiative_name: syncCtx.initiativeName,
      project_slug: syncCtx.projectSlug,
      phase_id: promptId,
    });
    await openChatWithPrompt(prompt, true, ctx.configLoader);
  },
};

export const injectRawHandler: CommandHandler = {
  type: "injectRaw",
  async handle(msg, ctx) {
    const raw = msg.prompt as string;
    if (!raw) return;
    await openChatWithPrompt(raw, true, ctx.configLoader);
  },
};

export const openChatHandler: CommandHandler = {
  type: "openChat",
  async handle(_msg, ctx) {
    const host = await getHostAdapter(ctx.configLoader);
    if (host === "opencode") {
      await openInOpenCode(`/${BRAND.name}`);
      return;
    }
    if (host === "claude") {
      try {
        await vscode.commands.executeCommand("workbench.action.chat.open", { agentId: "claude" });
      } catch {
        try { await vscode.commands.executeCommand("claude-code.open"); } catch { /* ignore */ }
      }
    } else {
      await vscode.commands.executeCommand("workbench.panel.chat.view.copilot.focus")
        .then(undefined, () => vscode.commands.executeCommand("workbench.action.chat.open"));
    }
  },
};
