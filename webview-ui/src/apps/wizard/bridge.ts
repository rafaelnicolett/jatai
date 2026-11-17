import type { WizardBoot, WizardMessage } from "@shared/wizard-protocol";
import type { WizardBridge } from "./WizardFlow";

/**
 * Ponte do Wizard com o host (F3.10, W3). Separada da do Cockpit
 * (`store/vscodeApi.ts`), que é tipada pelo protocolo do Cockpit e adquire a
 * API no carregamento do módulo: cada painel é um webview próprio e carrega
 * só o seu bundle.
 */
export function createVsCodeBridge(): WizardBridge {
  const vscode = acquireVsCodeApi<{ screen: string }>();
  return {
    postMessage: (msg: WizardMessage) => vscode.postMessage(msg),
    setState: (state) => {
      vscode.setState(state);
    },
    getState: () => vscode.getState(),
  };
}

/** Bootstrap que o host escreve no `<script type="application/json" id="hx-boot">` (o mesmo do Wizard legado). */
export function readBoot(doc: Document): WizardBoot {
  const el = doc.getElementById("hx-boot");
  return JSON.parse(el?.textContent ?? "{}") as WizardBoot;
}
