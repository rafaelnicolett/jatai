/**
 * conciergeCommands.ts — os comandos que os botões do chat disparam (F3.7,
 * cluster K2 do `ConciergeParticipant.ts`). Recebem as portas do container:
 * o chat abre por `ChatHost`, os avisos saem por `Notifier`, a pasta vem de
 * `WorkspaceRoot`, e o checklist HITL é gravado por `DeliveryStateAccess`.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import { PHASE_CONTRACTS } from "../core/methodology/phase-contracts";
import { canonicalDeliveryPhaseId, chatPhaseMeta } from "../core/methodology/phase-catalog.pure";
import { resolveInsideWorkspace } from "../data/workspace-path";
import type { DeliveryStateAccess } from "../views/actions/deliveryStateAccess";
import { BRAND } from "../data/brand.pure";
import { PHASE_TEMPLATE } from "./catalog";
import { missingMandatoryItems } from "./hitl/HitlPolicy";
import type { WorkspaceRoot } from "../adapters/workspace/WorkspaceRoot";
import type { ChatHost } from "../adapters/chat/ChatHost";
import { handOffToOrchestrator } from "../adapters/chat/orchestrator";
import type { Notifier } from "../adapters/notifier/Notifier";

export interface ConciergeCommandDeps {
  cockpit: DeliveryStateAccess;
  workspaceRoot: WorkspaceRoot;
  chatHost: ChatHost;
  notifier: Notifier;
}

/**
 * "Continuar com o agente jatai": o guia não aciona o agente da fase; quem o
 * aciona é o agente orquestrador (ADR-0025).
 */
export function continueWithOrchestrator(chatHost: ChatHost, agentName: string): Promise<void> {
  return handOffToOrchestrator(chatHost, `continuar com ${agentName}`);
}

export function registerConciergeCommands({ cockpit, workspaceRoot, chatHost, notifier }: ConciergeCommandDeps): vscode.Disposable[] {
  return [
    // Botão "Continuar com o agente jatai" do guia (ADR-0025)
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.concierge.continuePhase`,
      async (agentName: string) => {
        await continueWithOrchestrator(chatHost, agentName);
      }
    ),

    // ── HITL inline checklist (Etapa 1) ─ toggles a single guard-rail item from chat
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.concierge.toggleGuardRail`,
      async (phaseId: string, itemId: string, checked: boolean) => {
        await cockpit.toggleChecklistFromChat(phaseId, itemId, checked);
        // Reabre o guia para renderizar o checklist com o estado novo
        await chatHost.open(`@${BRAND.guide.name} status`);
      }
    ),

    // ── HITL auto-advance (Etapa 2) ─ validates mandatory items + marks done + routes next
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.concierge.advancePhase`,
      async (requestedPhaseId: string) => {
        // Alias (ex.: `review`, `sprint-planner`) aprova a fase canônica do catálogo único.
        const phaseId = canonicalDeliveryPhaseId(requestedPhaseId);
        if (!PHASE_CONTRACTS[phaseId]) {
          void notifier.warn(`Sem contrato definido para a fase \`${phaseId}\`.`);
          return;
        }
        const deliveryState = cockpit.readActiveDeliveryState();
        const missing = missingMandatoryItems(phaseId, deliveryState?.phases[phaseId]?.human_checklist ?? {}) ?? [];
        if (missing.length > 0) {
          const labels = missing.map(m => `• ${m.label}`).join("\n");
          void notifier.ask(
            `Não posso avançar a fase \`${phaseId}\`: ${missing.length} item(ns) mandatory pendente(s).\n\n${labels}`,
            { modal: true },
          );
          return;
        }
        // Mark human-ok + status=done
        await cockpit.toggleChecklistFromChat(phaseId, "human-ok", true);
        await cockpit.markPhaseDoneFromChat(phaseId);
        // A próxima fase é com o agente orquestrador, que aciona o agente dela (ADR-0025)
        const next = chatPhaseMeta(phaseId)?.next;
        if (next) {
          const nextAgent = chatPhaseMeta(next)?.agent ?? "@maestro";
          await handOffToOrchestrator(
            chatHost,
            `Fase \`${phaseId}\` validada pelo humano (todos itens mandatory ✓). Roteie para ${nextAgent} (próxima fase: ${next}).`
          );
        } else {
          void notifier.info(
            `✅ Fase \`${phaseId}\` finalizada — fim do mapa de fases conhecido.`
          );
        }
      }
    ),

    // Botões de trabalho do guia (Foundation, nova iniciativa): o pedido pronto vai para o agente jatai
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.concierge.runRawPrompt`,
      async (rawPrompt: string) => {
        await handOffToOrchestrator(chatHost, rawPrompt);
      }
    ),

    // Template de fase: preenche (sem enviar) o pedido para o agente jatai
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.concierge.startWithTemplate`,
      async (requestedPhase: string) => {
        const phase    = canonicalDeliveryPhaseId(requestedPhase);
        const template = PHASE_TEMPLATE[phase];
        const meta     = chatPhaseMeta(phase);
        const query    = template ?? `@${BRAND.participant.name} continuar com ${meta?.agent ?? phase}`;
        await handOffToOrchestrator(chatHost, query, { partial: true });
      }
    ),

    // Used by folder anchors + artifact buttons
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.concierge.revealArtifact`,
      async (relPath: string) => {
        const root = workspaceRoot.current();
        if (!root) return;
        // `relPath` vem do chat: só revela o que fica dentro do workspace (A16b)
        const full = resolveInsideWorkspace(root, relPath);
        if (full !== null && fs.existsSync(full)) {
          const uri = vscode.Uri.file(full);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            await vscode.commands.executeCommand("revealFileInOS", uri);
          } else {
            await vscode.window.showTextDocument(uri);
          }
        }
      }
    ),
  ];
}
