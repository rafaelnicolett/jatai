/**
 * registry.ts
 *
 * Monta o mapa `type -> CommandHandler` a partir de todos os módulos de
 * `actions/*`. Este é o ÚNICO lugar que precisa mudar para adicionar um verbo
 * novo (OCP) — `CockpitNextController` chama `buildActionRegistry()` uma vez
 * e despacha `onDidReceiveMessage` através dele, em vez de manter seu próprio
 * switch.
 */

import type { CommandHandler } from "./CommandHandler";
import { injectPromptHandler, injectRawHandler, openChatHandler } from "./promptActions";
import {
  runCommandHandler,
  openWizardHandler,
  openImportWizardHandler,
  openFileHandler,
  refreshHandler,
} from "./workspaceActions";
import { switchInitiativeHandler, newInitiativeHandler } from "./initiativeActions";
import { skipTutorialHandler, resetTutorialHandler } from "./tutorialActions";
import { guardRailActionHandler, toggleFoundationGuardRailHandler } from "./guardRailActions";
import {
  markPhaseDoneHandler,
  toggleGuardRailHandler,
  approveAndAdvancePhaseHandler,
} from "./greenfieldPhaseActions";
import { approveWaveItemHandler, approveGateD1Handler, approveSprintItemHandler } from "./approvalActions";
import { gatesApproveHandler, decisionsRecordHandler } from "./gateActions";
import { notificationsMarkSeenHandler } from "./notificationActions";
import { openArtifactDiffHandler } from "./verificationActions";

const ALL_HANDLERS: CommandHandler[] = [
  injectPromptHandler,
  injectRawHandler,
  openChatHandler,
  runCommandHandler,
  openWizardHandler,
  openImportWizardHandler,
  openFileHandler,
  refreshHandler,
  switchInitiativeHandler,
  newInitiativeHandler,
  skipTutorialHandler,
  resetTutorialHandler,
  guardRailActionHandler,
  toggleFoundationGuardRailHandler,
  markPhaseDoneHandler,
  toggleGuardRailHandler,
  approveAndAdvancePhaseHandler,
  approveWaveItemHandler,
  approveGateD1Handler,
  approveSprintItemHandler,
  gatesApproveHandler,
  decisionsRecordHandler,
  notificationsMarkSeenHandler,
  openArtifactDiffHandler,
];

export function buildActionRegistry(): Map<string, CommandHandler> {
  return new Map(ALL_HANDLERS.map((h) => [h.type, h]));
}
