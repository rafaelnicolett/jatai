/**
 * initiativeActions.ts — SRP: trocar/criar iniciativa no registro multi-iniciativa.
 * Extraído verbatim do switch de `CockpitController._handleMessage`.
 */

import * as vscode from "vscode";
import type { CommandHandler } from "./CommandHandler";
import { openChatWithPrompt } from "./hostChat";
import { BRAND } from "../../data/brand.pure";

export const switchInitiativeHandler: CommandHandler = {
  type: "switchInitiative",
  async handle(msg, ctx) {
    const id = msg.id as string;
    if (!id) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    // Nem todo agente que grava uma iniciativa nova escreve o campo `active`
    // (o parser assume o primeiro item da lista como fallback — ver
    // `parseInitiativesYaml`). Sem o branch dentro de
    // `setActiveInitiativeInPlace`, o replace silenciosamente não casava com
    // nada e o arquivo saía do disco intocado: o painel aplicava
    // `requestRefresh()`, mas `active` continuava resolvendo pra sempre a
    // primeira iniciativa, travando o pill-switcher.
    await ctx.repository.setActiveInitiativeInPlace(root, id);
    await ctx.requestRefresh();
  },
};

export const newInitiativeHandler: CommandHandler = {
  type: "newInitiative",
  async handle(_msg, ctx) {
    const prompt = `@${BRAND.participant.name} Quero iniciar uma nova iniciativa de delivery. Ajuda-me a definir o id, nome, prioridade e contexto para criar a entrada no initiatives.yaml.`;
    await openChatWithPrompt(prompt, true, ctx.configLoader);
  },
};
