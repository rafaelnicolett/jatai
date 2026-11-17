/**
 * Apoio dos testes de tela do mapa (F5.3): um `acquireVsCodeApi()` que grava o
 * que o webview manda ao host e guarda o estado persistido. Precisa ser o
 * PRIMEIRO import do arquivo de teste: `store/vscodeApi.ts` adquire a API uma
 * vez, no escopo do módulo, e é este módulo que a troca antes disso (sem
 * `vi.mock` de módulo). O mesmo truque de `mock-main.tsx`.
 */
export const sent: Array<Record<string, unknown>> = [];
export const persisted: { state: unknown } = { state: undefined };

(globalThis as { acquireVsCodeApi?: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: (msg: Record<string, unknown>) => void sent.push(msg),
  getState: () => persisted.state,
  setState: (next: unknown) => {
    persisted.state = next;
  },
});

/** Esvazia o que foi gravado e o estado persistido, entre um teste e o outro. */
export function resetVsCodeApi(): void {
  sent.length = 0;
  persisted.state = undefined;
}
