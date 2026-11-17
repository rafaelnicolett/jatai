/**
 * guardRailActions.ts — SRP: ações genéricas de guard rail (abrir arquivo/pasta
 * a partir de um item de checklist) e o checklist humano do Foundation
 * brownfield (`foundation-state.yaml`). Extraído verbatim do switch de
 * `CockpitController._handleMessage`.
 *
 * Não confundir com `greenfieldPhaseActions.ts` — aquele cuida da aprovação
 * de fase greenfield (`delivery-state.yaml`); este cuida de ações de guard
 * rail que não dependem daquela máquina de fases.
 */

import * as vscode from "vscode";
import * as path from "path";
import { FOUNDATION_STATE_PATH } from "../../data/foundation-state-contract";
import type { CommandHandler } from "./CommandHandler";
import { upsertChecklistItemInYaml } from "./yamlUpsert";
import { atomicWrite } from "../../cli/lib/atomic-write";

/** Executa ação contextual de um item do checklist — atalho para o humano validar. */
export const guardRailActionHandler: CommandHandler = {
  type: "guardRailAction",
  async handle(msg) {
    const actionType = msg.actionType as string;
    const target = msg.target as string;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;

    try {
      if (actionType === "openFile") {
        const fileUri = vscode.Uri.joinPath(root, target);
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } else if (actionType === "revealFolder") {
        const folderUri = vscode.Uri.joinPath(root, target);
        await vscode.commands.executeCommand("revealInExplorer", folderUri);
      } else if (actionType === "openBrowser") {
        const fileUri = vscode.Uri.joinPath(root, target);
        await vscode.env.openExternal(fileUri);
      }
    } catch {
      void vscode.window.showWarningMessage(`Não foi possível abrir: ${target}`);
    }
  },
};

export const toggleFoundationGuardRailHandler: CommandHandler = {
  type: "toggleFoundationGuardRail",
  async handle(msg, ctx) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const phaseId = msg.phaseId as string;
    const itemId = msg.itemId as string;
    const checked = msg.checked as boolean;

    const filePath = path.join(root, ...FOUNDATION_STATE_PATH);
    // Sob o mesmo lock do CLI, gravação atômica (A10 / H-BUG-16).
    await atomicWrite(filePath, (before) => {
      const content = upsertChecklistItemInYaml(before, phaseId, itemId, checked, "human_checklist");
      const phasesIdx = content.split("\n").findIndex((l) => /^phases:\s*$/.test(l));
      return phasesIdx === -1
        ? `phases:\n  ${phaseId}:\n    status: in-progress\n    human_checklist:\n      ${itemId}: ${checked}\n`
        : content;
    });

    await ctx.requestRefresh();
  },
};
