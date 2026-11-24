/**
 * colmeiaBootstrap.ts — o "host" de mentira do mapa (F5.3): instala o
 * `acquireVsCodeApi()` que o webview espera e, quando ele pede o snapshot,
 * entrega o mundo do cenário escolhido pelos parâmetros da página
 * (`colmeiaParams.ts`). Como `mockBootstrap.ts`, tem efeito colateral no
 * import e precisa ser o PRIMEIRO import da entrada, antes de
 * `store/vscodeApi.ts` (que adquire a API uma vez só, no escopo do módulo).
 *
 * Os eventos andam pela mesma mensagem do host (`shell/snapshot` e, logo
 * depois, `shell/runEvents-append`), então o mapa exercita o caminho real.
 */
import { HOTFIX_ID, foundationDiscovery, buildColmeiaSnapshot, colmeiaEvent, createColmeiaSimulator, stressEvents, type SimMessage } from "./colmeiaScenarios";
import { readMockParams, type MockParams } from "./colmeiaParams";

export const params: MockParams = readMockParams(window.location.search);

/** Os sinais que o VS Code põe no documento e que os tokens e o mapa leem. */
function applyEnvironment(p: MockParams): void {
  const root = document.documentElement;
  if (p.theme === "claro") root.setAttribute("data-theme", "light");
  if (p.highContrast) root.setAttribute("data-contrast", "more");
  if (p.reducedMotion) root.setAttribute("data-motion", "reduce");
  if (p.screenReader) document.body.classList.add("vscode-using-screen-reader");
}

function persistedFromParams(p: MockParams): Record<string, unknown> {
  return {
    activeTab: "live-progress",
    collapsedSections: {},
    ...(p.scene ? { mapScene: p.scene === "dia" ? "day" : "night" } : {}),
    ...(p.mode ? { mapMode: p.mode === "lista" ? "list" : "scene" } : {}),
  };
}

function install(): void {
  applyEnvironment(params);

  const deliver = (msg: SimMessage): void => void window.postMessage(msg, "*");
  const simulator = createColmeiaSimulator({ deliver });
  let timer: number | null = null;
  let state: unknown = persistedFromParams(params);
  let seq = 0;

  const sendStatic = (active: string | null | undefined, events: ReturnType<typeof stressEvents>): void => {
    deliver({ type: "shell/snapshot", seq: seq++, generatedAt: new Date().toISOString(), payload: buildColmeiaSnapshot({ active, events }) });
  };

  const start = (): void => {
    switch (params.scenario) {
      case "descoberta": {
        const at = Date.now() - Date.parse("2026-11-16T12:00:00Z") - 5000;
        const events = [
          colmeiaEvent(
            { event_type: "agent-started", agent_id: "@coding-archaeologist", phase_id: "coding-archaeology", repo_id: "jatai", message: "lendo o padrão que o time já usa", initiative_id: undefined },
            at
          ),
        ];
        deliver({ type: "shell/snapshot", seq: seq++, generatedAt: new Date().toISOString(), payload: buildColmeiaSnapshot({ active: null, foundation: foundationDiscovery(), events }) });
        return;
      }
      case "vazio":
        deliver({ type: "shell/snapshot", seq: seq++, generatedAt: new Date().toISOString(), payload: buildColmeiaSnapshot({ active: null, foundation: null, reposInventory: null, events: [] }) });
        return;
      case "estresse":
        sendStatic(undefined, stressEvents(30, (i) => Date.now() - Date.parse("2026-11-16T12:00:00Z") - 30_000 + i * 900));
        return;
      case "hotfix": {
        const at = Date.now() - Date.parse("2026-11-16T12:00:00Z");
        sendStatic(HOTFIX_ID, [
          colmeiaEvent({ event_type: "agent-started", agent_id: "@feature-adder", task_id: "wave-1/item-1.1", initiative_id: HOTFIX_ID, message: "reproduzindo a tela em branco" }, at - 8000),
          colmeiaEvent({ event_type: "agent-started", agent_id: "@test-backfill-agent", task_id: "wave-1/item-1.2", initiative_id: HOTFIX_ID, message: "pinando o comportamento atual" }, at - 4000),
        ]);
        return;
      }
      case "vivo":
        if (params.steps > 0) simulator.advance(params.steps);
        else simulator.snapshot();
        if (!params.frozen && timer === null) timer = window.setInterval(() => simulator.step(), params.tickMs);
    }
  };

  const mockApi = {
    postMessage: (msg: unknown) => {
      const m = msg as { type?: string; id?: string };
      if (m.type === "shell/ready" || m.type === "shell/requestSnapshot") window.setTimeout(start, 50);
      else if (m.type === "switchInitiative" && m.id) simulator.switchTo(m.id);
      else console.log("[mock] webview → host:", m);
    },
    getState: () => state,
    setState: (s: unknown) => {
      state = s;
      return s;
    },
  };
  // O app já adquiriu uma API delegadora; esta é a implementação por trás dela.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__jataiMockApi = mockApi;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).acquireVsCodeApi = () => mockApi;
}

install();
