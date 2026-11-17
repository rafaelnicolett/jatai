/**
 * vscodeApi.ts
 *
 * Wrapper único para `acquireVsCodeApi()` — a API só pode ser adquirida UMA
 * vez por ciclo de vida do webview (uma segunda chamada lança exceção), por
 * isso é chamada aqui, no escopo do módulo, uma única vez, e todo o resto do
 * app importa deste arquivo em vez de chamar `acquireVsCodeApi()` de novo.
 */

import type { WebviewToHostMessage } from "@shared/cockpit-protocol";
import { DEFAULT_PERSISTED_STATE, ALL_COCKPIT_TABS, type PersistedUIState } from "./PersistedUIState";

const vscode = acquireVsCodeApi<PersistedUIState>();

const VALID_TABS = new Set(ALL_COCKPIT_TABS);

export function postMessage(msg: WebviewToHostMessage): void {
  vscode.postMessage(msg);
}

/**
 * `vscode.getState()` sobrevive a upgrade do `.vsix` — uma build anterior
 * deste painel pode ter salvo um `activeTab` que não existe mais (ex.:
 * "home"/"analytics", de antes das abas virarem Dashboard). Sem essa
 * validação, o `ShellRoot` cai numa aba desconhecida e a área de conteúdo
 * fica em branco até o usuário clicar em alguma aba na mão.
 */
export function getPersistedState(): PersistedUIState {
  const state = vscode.getState();
  if (!state) return DEFAULT_PERSISTED_STATE;
  const activeTab = VALID_TABS.has(state.activeTab) ? state.activeTab : DEFAULT_PERSISTED_STATE.activeTab;
  // `splitTab` inválido (build antiga, ou igual ao `activeTab` por acidente) só desliga a divisão — nunca quebra a tela.
  const splitTab = state.splitTab && VALID_TABS.has(state.splitTab) && state.splitTab !== activeTab ? state.splitTab : null;
  return { ...state, activeTab, splitTab };
}

export function setPersistedState(state: PersistedUIState): void {
  vscode.setState(state);
}
