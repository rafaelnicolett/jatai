/**
 * mockBootstrap.ts — polyfill de `acquireVsCodeApi()` para rodar o app FORA
 * do VS Code, num navegador comum. Só existe pra permitir o sanity check
 * visual (`mock-main.tsx`) — nunca importado pelo `main.tsx` de produção.
 *
 * `acquireVsCodeApi` só existe dentro de um webview real; fora dele é
 * `undefined`, e o app quebraria na primeira linha de `vscodeApi.ts` sem
 * este polyfill.
 *
 * NÃO redeclara o tipo global (`declare global`) — `@types/vscode-webview`
 * já declara `acquireVsCodeApi` pro projeto inteiro; uma segunda declaração
 * aqui colide com ela e corrompe o typecheck até de `vscodeApi.ts`, que nem
 * é deste arquivo. Só atribuímos ao global existente via um cast pontual.
 */

import { applyCatalogTheme, type CatalogTheme } from "./catalog/catalogTheme";
import { scenarioFromSearch, type CockpitScenario } from "./cockpitScenarios";
import { buildMockSnapshot } from "./mockData";

/**
 * `?theme=dark|light|hcDark|hcLight` e `?motion=reduce` ligam os mesmos sinais do
 * catálogo do DS v2 (`data-theme`, `data-contrast`, `data-motion`). Sem parâmetro,
 * o mock fica como sempre foi.
 */
function applyThemeFromSearch(search: string): void {
  const params = new URLSearchParams(search);
  const theme = params.get("theme");
  const themes: CatalogTheme[] = ["dark", "light", "hcDark", "hcLight"];
  const wanted = themes.find((t) => t === theme);
  if (!wanted && params.get("motion") !== "reduce") return;
  applyCatalogTheme(document, { theme: wanted ?? "dark", vscode: false, reduceMotion: params.get("motion") === "reduce" });
}

/** O que o host responde, para um cenário escolhido por `?scenario=<id>` (ver `cockpitScenarios.ts`). */
function replyForScenario(scenario: CockpitScenario, seq: number): void {
  if (scenario.degraded) window.postMessage({ type: "shell/degraded", payload: scenario.degraded }, "*");
  if (scenario.snapshot) {
    const payload = scenario.snapshot();
    setTimeout(() => window.postMessage({ type: "shell/snapshot", seq, generatedAt: new Date().toISOString(), payload }, "*"), 150);
  }
}

function installMockVsCodeApi(): void {
  applyThemeFromSearch(window.location.search);
  const scenario = scenarioFromSearch(window.location.search);
  let seq = 0;
  let state: unknown = scenario?.persisted;
  const mockApi = {
    postMessage: (msg: unknown) => {
      const m = msg as { type?: string };
      console.log("[mock] webview → host:", m);
      if (scenario && (m.type === "shell/ready" || m.type === "shell/requestSnapshot")) {
        replyForScenario(scenario, ++seq);
        return;
      }
      if (m.type === "shell/ready" || m.type === "shell/requestSnapshot") {
        // Simula a latência real de um _pushIfChanged() do host.
        setTimeout(() => {
          window.postMessage({ type: "shell/snapshot", seq: 0, generatedAt: new Date().toISOString(), payload: buildMockSnapshot() }, "*");
          window.postMessage({
            type: "shell/toast",
            payload: { id: "mock-toast-1", kind: "agent-done", text: "@tech-mapper terminou · claims-svc — aguarda aprovação", timestamp: new Date().toISOString() },
          }, "*");
        }, 400);
      }
    },
    getState: () => state,
    setState: (s: unknown) => { state = s; return s; },
  };

  // O app já adquiriu uma API delegadora; esta é a implementação por trás dela.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__jataiMockApi = mockApi;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).acquireVsCodeApi = () => mockApi;
}

// Efeito colateral no import: quem importa este módulo primeiro (antes de
// `store/vscodeApi.ts` ser avaliado) garante que o polyfill já existe quando
// `acquireVsCodeApi()` for chamado de verdade. Ver mock-main.tsx.
installMockVsCodeApi();
