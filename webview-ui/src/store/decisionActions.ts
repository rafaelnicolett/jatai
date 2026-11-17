/**
 * decisionActions.ts — o que o painel de decisão manda ao host (F4.2, ADR-0024).
 *
 * Aprovar um gate e registrar a decisão que um agente pediu são ações HUMANAS:
 * o host roda `StateCommands.approveGate` e `recordDecision` com o nome do git
 * e a regra de fechamento. A resposta volta como `gates/approve-result` e
 * `decisions/record-result` (ver `CockpitStore.decisionResult`).
 *
 * As demais aprovações e marcas usam os verbos que o host já tinha e que a UI
 * antiga deixou órfãos: o checklist humano da fase (`toggleGuardRail`), o do
 * Foundation (`toggleFoundationGuardRail`) e a aprovação da fase, do item de
 * onda e do item de sprint. Nenhuma tool MCP aprova gate, e isto não muda.
 */
import type { DecisionRecordRequest, GateApprovalRequest } from "@shared/cockpit-protocol";
import { postMessage } from "./vscodeApi";

export function requestGateApproval(request: Omit<GateApprovalRequest, "type">): void {
  postMessage({ type: "gates/approve", ...request });
}

export function requestDecisionRecord(request: Omit<DecisionRecordRequest, "type">): void {
  postMessage({ type: "decisions/record", ...request });
}

/** Aprova a fase de entrega em revisão e abre a próxima (o host recusa se faltar item obrigatório). */
export function requestPhaseApproval(phaseId: string): void {
  postMessage({ type: "approveAndAdvancePhase", phaseId });
}

export function requestWaveItemApproval(request: { initiativeId: string; wave: string; item: string; acknowledged: boolean }): void {
  postMessage({ type: "approveWaveItem", ...request });
}

export function requestSprintItemApproval(sprintItemId: string): void {
  postMessage({ type: "approveSprintItem", sprintItemId });
}

/** Marca ou desmarca um item do checklist humano de uma fase de entrega (iniciativa ativa). */
export function requestGuardRailToggle(phaseId: string, itemId: string, checked: boolean): void {
  postMessage({ type: "toggleGuardRail", phaseId, itemId, checked });
}

/** Marca ou desmarca um item do checklist humano de uma fase do Foundation entre repositórios. */
export function requestFoundationGuardRailToggle(phaseId: string, itemId: string, checked: boolean): void {
  postMessage({ type: "toggleFoundationGuardRail", phaseId, itemId, checked });
}

/** Abre um artefato no editor (o host só abre o que está dentro do workspace). */
export function openArtifact(relPath: string): void {
  postMessage({ type: "openFile", relPath });
}

/** Abre o diff de git de um artefato no editor. */
export function openArtifactDiff(path: string): void {
  postMessage({ type: "openArtifactDiff", path });
}

/** Leva o assunto para o chat com o agente de entrada. */
export function talkToAgent(prompt: string): void {
  postMessage({ type: "injectRaw", prompt });
}

/** "Tornar ativa": a ação explícita que muda o `active:` do registro (navegar nunca muda). */
export function makeInitiativeActive(id: string): void {
  postMessage({ type: "switchInitiative", id });
}
