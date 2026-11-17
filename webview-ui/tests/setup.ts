/**
 * setup.ts — stub global de `acquireVsCodeApi()`, injetada pelo host do
 * webview de verdade (nunca existe fora do VS Code, e só pode ser chamada
 * UMA VEZ por ciclo de vida — ver `src/store/vscodeApi.ts`). Sem isto,
 * qualquer teste que importe (mesmo transitivamente) `vscodeApi.ts` quebra
 * com "acquireVsCodeApi is not defined" antes de rodar um assert sequer.
 */
let state: unknown;

(globalThis as { acquireVsCodeApi?: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: () => {},
  getState: () => state,
  setState: (next: unknown) => { state = next; },
});

/**
 * Silencia o warning "The current testing environment is not configured to
 * support act(...)" do React 18 — só é relevante pros poucos testes que
 * renderizam componente de verdade via `react-dom/client` + `act` (ver
 * `tests/PhaseBoard.test.tsx`); inofensivo pros demais, que nunca importam
 * React.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
