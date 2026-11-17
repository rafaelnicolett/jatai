/**
 * deliveryStateAccess.ts
 *
 * Substitui o antigo `CockpitController` como dependência de `ConciergeParticipant`
 * e `ArtifactValidationProvider` — ambos só precisavam de 4 métodos (HITL toggle,
 * mark-done, path do delivery-state ativo, leitura do delivery-state ativo), que já
 * viviam em `greenfieldPhaseActions.ts` (ações) e `data/delivery-state-contract.ts`
 * (leitura). Esta função monta o `ActionContext` compartilhado sem precisar de
 * nenhuma classe "controller" ou de um `WebviewPanel` por trás.
 */

import * as vscode from "vscode";
import type { ConfigLoader } from "../../adapters/config/ConfigLoader";
import { NullTelemetrySink, type TelemetrySink } from "../../adapters/telemetry/TelemetrySink";
import { toggleGuardRail, markPhaseDone, getActiveDeliveryStatePath } from "./greenfieldPhaseActions";
import { loadDeliveryState, type DeliveryState } from "../../data/delivery-state-contract";
import { loadInitiatives } from "../../data/initiatives-contract";
import type { ActionContext } from "./CommandHandler";
import type { StateRepository } from "../../state/repository/StateRepository";

export interface DeliveryStateAccess {
  toggleChecklistFromChat(phaseId: string, itemId: string, checked: boolean): Promise<void>;
  markPhaseDoneFromChat(phaseId: string): Promise<void>;
  getActiveDeliveryStatePath(): string | null;
  readActiveDeliveryState(): DeliveryState | null;
}

export function createDeliveryStateAccess(
  extensionContext: vscode.ExtensionContext,
  configLoader: ConfigLoader,
  repository: StateRepository,
  telemetry: TelemetrySink = new NullTelemetrySink(),
): DeliveryStateAccess {

  const ctx: ActionContext = {
    configLoader,
    extensionContext,
    repository,
    // Catálogo de prompt estático do fluxo greenfield — nenhum dos dois
    // consumidores desta interface (ConciergeParticipant, ArtifactValidationProvider)
    // usa injeção de prompt por template; CockpitNextController também injeta {}.
    promptMap: {},
    // No-op deliberado — sem painel próprio para "repintar" a partir daqui.
    // ATUALIZADO (roadmap `mod-state-service`, item 3.2): antes, um escrita
    // sob `.github/artifacts/**` feita pelo chat/CodeLens era pega de graça
    // pelo FileSystemWatcher do CockpitNextController (debounce de 600ms).
    // Esse watcher saiu — o Cockpit agora só reage a `GET /events` (SSE) e a
    // um poll de segurança a cada 4s, e nenhum dos dois cobre escrita de
    // checklist/initiative hoje (ver achado no relatório do item 3.2: os
    // endpoints de escrita do State Service não publicam evento nenhum).
    // Na prática, uma ação feita aqui (chat) só aparece no Cockpit aberto em
    // até 4s (o poll), não mais quase-instantâneo como antes.
    // `ArtifactValidationProvider` não depende mais disto de qualquer forma
    // (chama `provider.refresh()` explicitamente após o toggle).
    requestRefresh: () => {},
    pushTelemetry: (event) => telemetry.push(event),
  };

  const root = (): string | null => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;

  return {
    toggleChecklistFromChat: (phaseId, itemId, checked) => toggleGuardRail(phaseId, itemId, checked, ctx),
    markPhaseDoneFromChat: (phaseId) => markPhaseDone(phaseId, ctx),
    getActiveDeliveryStatePath: (): string | null => {
      const r = root();
      return r ? getActiveDeliveryStatePath(r) : null;
    },
    readActiveDeliveryState: (): DeliveryState | null => {
      const r = root();
      if (!r) return null;
      const initiatives = loadInitiatives(r);
      return loadDeliveryState(r, initiatives?.active);
    },
  };
}
