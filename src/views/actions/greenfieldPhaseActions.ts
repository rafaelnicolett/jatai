/**
 * greenfieldPhaseActions.ts — SRP: aprovação de fase do fluxo greenfield
 * (`delivery-state.yaml`, Upstream/Downstream/Operation).
 *
 * Extraído verbatim de `CockpitController` (`_markPhaseDone`,
 * `_toggleGuardRail`, `_approveAndAdvancePhase`, e os privados que só esses
 * três usavam: `_getActiveDeliveryStatePath`, `_readChecklistState`,
 * `_buildHandoffPrompt`, `_updateInitiativeCurrentPhase`, mais as constantes
 * `PHASE_NEXT`/`PHASE_LABEL`/`PHASE_AGENT_NAME`, hoje consultas ao catálogo
 * único `data/phase-catalog.pure.ts`). Deliberadamente seu próprio
 * módulo, separado de `guardRailActions.ts` — é uma responsabilidade
 * genuinamente distinta (aprovação de fase greenfield vs. ações de guard rail
 * genéricas/brownfield), não uma divisão arbitrária.
 *
 * As três ações são exportadas como FUNÇÕES tipadas (não só como
 * `CommandHandler`s) porque têm um segundo consumidor: `ConciergeParticipant`
 * (o participante de chat `@helyx`) e `ArtifactValidationProvider` chamam a
 * mesma lógica via `CockpitController.toggleChecklistFromChat`/
 * `markPhaseDoneFromChat`/`getActiveDeliveryStatePath` — os `CommandHandler`s
 * abaixo são só adaptadores finos que desembrulham a mensagem do postMessage
 * e chamam a mesma função.
 */

import * as vscode from "vscode";
import { PHASE_CONTRACTS } from "../../data/phase-contracts";
import { canonicalDeliveryPhaseId, deliveryPhase, nextDeliveryPhaseId } from "../../data/phase-catalog.pure";
import { deliveryAgentPathFor } from "../../data/foundation-prompt";
import type { HostAdapter } from "../../types";
import type { CommandHandler, ActionContext } from "./CommandHandler";
import { openChatWithPrompt, getHostAdapter, getActiveSyncContext } from "./hostChat";
import { getActiveDeliveryStatePath } from "./deliveryStatePaths.pure";
import { BRAND } from "../../data/brand.pure";

export { getActiveDeliveryStatePath };

/** Monta o prompt de handoff para o chat nativo do host, apontando para o próximo agente. */
function buildHandoffPrompt(phaseLabel: string, agentName: string, agentFile: string, host: HostAdapter): string {
  const parts: string[] = [];
  if (agentFile) {
    if (host === "copilot") {
      parts.push(`#file:${agentFile}`);
    } else {
      parts.push(`Leia o arquivo \`${agentFile}\` usando suas ferramentas de leitura antes de prosseguir.`);
    }
    parts.push(``);
  }
  const fileRef = host === "copilot" ? "do arquivo acima" : "do arquivo lido";
  parts.push(`Você é o agente **${agentName}** — execute a fase **${phaseLabel}** seguindo as instruções ${fileRef}.`);
  parts.push(``);
  parts.push(`## 🛑 REGRA HITL (inviolável)`);
  parts.push(`Ao concluir todos os artefatos do \`exit_contract\`, escreva exatamente:`);
  parts.push(`> ✅ **${phaseLabel} concluída.** Volte ao ${BRAND.displayName} Cockpit e clique em "Aprovar fase e abrir próxima".`);
  parts.push(`Não chame outro agente. Não edite \`delivery-state.yaml\` ou \`initiatives.yaml\`. A aprovação é sempre humana via cockpit.`);
  return parts.join("\n");
}

/** Marca uma fase como concluída (`delivery-state.yaml`) e dispara telemetria de `phase_completed`. */
export async function markPhaseDone(phaseId: string, ctx: ActionContext): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root || !phaseId) return;
  const stateFilePath = getActiveDeliveryStatePath(root);
  const now = new Date().toISOString();
  try {
    await ctx.repository.markDeliveryPhaseDoneInPlace(root, stateFilePath, phaseId, now);
    const syncCtx = getActiveSyncContext(root);
    ctx.pushTelemetry({
      event_type: "phase_completed",
      initiative_id: syncCtx.initiativeId,
      initiative_name: syncCtx.initiativeName,
      project_slug: syncCtx.projectSlug,
      phase_id: phaseId,
    });
    await ctx.requestRefresh();
  } catch (err) {
    void vscode.window.showErrorMessage(`Erro ao marcar fase como concluída: ${String(err)}`);
  }
}

/** Marca/desmarca um item do checklist humano de uma fase em `delivery-state.yaml`. */
export async function toggleGuardRail(phaseId: string, itemId: string, checked: boolean, ctx: ActionContext): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root || !phaseId || !itemId) return;
  const stateFilePath = getActiveDeliveryStatePath(root);
  try {
    await ctx.repository.toggleDeliveryChecklistInPlace(root, stateFilePath, phaseId, itemId, checked, "human_checklist");
    await ctx.requestRefresh();
  } catch (err) {
    void vscode.window.showErrorMessage(`Erro ao salvar checklist: ${String(err)}`);
  }
}

/**
 * Coração do loop HITL "Caminho B": valida o checklist obrigatório, marca a
 * fase atual como concluída, inicia a próxima, e faz o handoff para o chat
 * nativo do host com um prompt apontando para o próximo agente.
 */
export async function approveAndAdvancePhase(requestedPhaseId: string, ctx: ActionContext): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root || !requestedPhaseId) {
    void vscode.window.showWarningMessage("Sem workspace ativo.");
    return;
  }
  // Alias (ex.: `review`, `sprint-planner`) aprova a fase canônica do catálogo único.
  const phaseId = canonicalDeliveryPhaseId(requestedPhaseId);

  const contract = PHASE_CONTRACTS[phaseId];
  if (!contract) {
    void vscode.window.showWarningMessage(`Sem contrato definido para a fase \`${phaseId}\`.`);
    return;
  }

  // 1. Valida checklist obrigatório — lê human_checklist (verificado por humano, não auto-certificação do agente)
  const stateFilePath = getActiveDeliveryStatePath(root);
  const checklistState = ctx.repository.readChecklistState(stateFilePath, phaseId, "human_checklist");
  const mandatory = contract.guardRailChecklist.filter((i) => i.mandatory);
  const missing = mandatory.filter((i) => checklistState[i.id] !== true);
  if (missing.length > 0) {
    const labels = missing.map((m) => `• ${m.label}`).join("\n");
    void vscode.window.showWarningMessage(
      `Não posso avançar a fase \`${phaseId}\`: ${missing.length} item(ns) obrigatório(s) pendente(s).\n\n${labels}`,
      { modal: true },
    );
    return;
  }

  // 2. Determina a próxima fase
  const nextPhase = nextDeliveryPhaseId(phaseId);
  const now = new Date().toISOString();

  // 3. Marca a fase atual como concluída + human-ok; inicia a próxima como in-progress
  try {
    await ctx.repository.advanceDeliveryPhaseInPlace(
      stateFilePath,
      phaseId,
      now,
      nextPhase ? { id: nextPhase, agent: deliveryPhase(nextPhase)?.agent } : undefined
    );
  } catch (err) {
    void vscode.window.showErrorMessage(`Erro ao atualizar delivery-state.yaml: ${String(err)}`);
    return;
  }

  const syncCtx = getActiveSyncContext(root);
  ctx.pushTelemetry({
    event_type: "phase_approved",
    initiative_id: syncCtx.initiativeId,
    initiative_name: syncCtx.initiativeName,
    project_slug: syncCtx.projectSlug,
    phase_id: phaseId,
  });

  // 4. Atualiza initiatives.yaml — bump do current_phase
  if (nextPhase) {
    try { await ctx.repository.bumpActiveInitiativeCurrentPhaseInPlace(root, nextPhase); }
    catch (err) { console.error("Failed to update initiatives.yaml:", err); }
  }

  await ctx.requestRefresh();

  if (!nextPhase) {
    void vscode.window.showInformationMessage(`✅ Fase \`${phaseId}\` finalizada — fim do pipeline.`);
    return;
  }

  // 5. Handoff para o chat nativo do host com um prompt pré-montado apontando
  //    para o arquivo .md do próximo agente.
  const host = await getHostAdapter(ctx.configLoader);
  const agentName = deliveryPhase(nextPhase)?.agent ?? `@${nextPhase}`;
  const agentFile = deliveryAgentPathFor(host, nextPhase) ?? "";
  const nextLabel = deliveryPhase(nextPhase)?.label ?? nextPhase;
  const prompt = buildHandoffPrompt(nextLabel, agentName, agentFile, host);

  await openChatWithPrompt(prompt, false, ctx.configLoader);

  void vscode.window.showInformationMessage(
    `✅ Fase \`${phaseId}\` aprovada. Próxima fase: \`${nextPhase}\` (${agentName}).`
  );
}

// ── Adaptadores finos: desembrulham o postMessage e chamam as funções acima ──

export const markPhaseDoneHandler: CommandHandler = {
  type: "markPhaseDone",
  handle: (msg, ctx) => markPhaseDone(msg.phaseId as string, ctx),
};

export const toggleGuardRailHandler: CommandHandler = {
  type: "toggleGuardRail",
  handle: (msg, ctx) => toggleGuardRail(msg.phaseId as string, msg.itemId as string, msg.checked as boolean, ctx),
};

export const approveAndAdvancePhaseHandler: CommandHandler = {
  type: "approveAndAdvancePhase",
  handle: (msg, ctx) => approveAndAdvancePhase(msg.phaseId as string, ctx),
};
