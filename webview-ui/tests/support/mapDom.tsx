import { act } from "react";
import type { RunEvent } from "@data";
import { HiveMapView, type HiveMapViewProps } from "../../src/apps/cockpit/map/HiveMapView";
import { cockpitStore } from "../../src/store/CockpitStore";
import type { ColmeiaSnapshotOptions } from "../../src/mock/colmeiaScenarios";
import { buildColmeiaSnapshot } from "../../src/mock/colmeiaScenarios";
import { mount } from "./component";

/**
 * Apoio dos testes de tela do mapa (F5.3), no jsdom: as peças do navegador que
 * o jsdom não tem (ResizeObserver, Web Animations, matchMedia), o "host" que
 * entrega snapshot e eventos pelo store como a extensão faz, e esperas que
 * observam o DOM (MutationObserver), sem `sleep` cego.
 */

// ── O navegador que falta ───────────────────────────────────────────────────

export interface RecordedAnimation {
  element: Element;
  keyframes: unknown;
  options: unknown;
  state: "running" | "paused" | "canceled";
}

export interface BrowserStubs {
  animations: RecordedAnimation[];
  /** Muda o tamanho que os ResizeObserver enxergam (largura e altura do elemento observado). */
  resize(width: number, height?: number): void;
  /** Liga ou desliga o movimento reduzido do sistema (`prefers-reduced-motion`). */
  setReducedMotion(on: boolean): void;
  restore(): void;
}

let activeStubs: BrowserStubs | null = null;

export function installBrowserStubs(): BrowserStubs {
  const animations: RecordedAnimation[] = [];
  const original = {
    animate: (Element.prototype as { animate?: unknown }).animate,
    matchMedia: window.matchMedia,
    ResizeObserver: (globalThis as { ResizeObserver?: unknown }).ResizeObserver,
  };

  (Element.prototype as unknown as { animate: unknown }).animate = function (this: Element, keyframes: unknown, options: unknown) {
    const record: RecordedAnimation = { element: this, keyframes, options, state: "running" };
    animations.push(record);
    return {
      pause: () => void (record.state = "paused"),
      play: () => void (record.state = "running"),
      cancel: () => void (record.state = "canceled"),
      finished: Promise.resolve(),
    };
  };

  let reduced = false;
  const queries = new Set<{ query: string; listeners: Set<() => void> }>();
  window.matchMedia = ((query: string) => {
    const entry = { query, listeners: new Set<() => void>() };
    queries.add(entry);
    return {
      get matches() {
        return query.includes("prefers-reduced-motion") ? reduced : false;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => entry.listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => entry.listeners.delete(cb),
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  const observers = new Set<{ el: Element; cb: ResizeObserverCallback }>();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private readonly cb: ResizeObserverCallback) {}
    observe(el: Element): void {
      observers.add({ el, cb: this.cb });
    }
    disconnect(): void {
      for (const o of [...observers]) if (o.cb === this.cb) observers.delete(o);
    }
    unobserve(): void {}
  };

  const stubs: BrowserStubs = {
    animations,
    resize(width, height = 900) {
      act(() => {
        // Como o navegador: elemento que saiu do documento não é mais notificado.
        for (const o of observers) if (o.el.isConnected) o.cb([{ target: o.el, contentRect: { width, height } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      });
    },
    setReducedMotion(on) {
      reduced = on;
      act(() => {
        for (const q of queries) for (const l of q.listeners) l();
      });
    },
    restore() {
      (Element.prototype as unknown as { animate: unknown }).animate = original.animate;
      window.matchMedia = original.matchMedia;
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original.ResizeObserver;
      activeStubs = null;
    },
  };
  activeStubs = stubs;
  return stubs;
}

// ── O host de mentira: snapshot e eventos pelo store ────────────────────────

let seq = 0;

/** Entrega o estado como o host faz: o snapshot (com a janela de eventos) e, logo depois, o `runEvents-append` com os eventos novos. */
export function deliver(options: ColmeiaSnapshotOptions = {}, fresh: RunEvent[] = []): void {
  act(() => {
    cockpitStore.setView("cockpit");
    cockpitStore.clearDecision();
    cockpitStore.handleMessage({ type: "shell/snapshot", seq: seq++, generatedAt: new Date().toISOString(), payload: buildColmeiaSnapshot(options) });
    if (fresh.length > 0) cockpitStore.handleMessage({ type: "shell/runEvents-append", seq: seq++, payload: fresh });
  });
}

/** Só os eventos novos, sem snapshot (o caminho do `shell/runEvents-append`). */
export function append(events: RunEvent[]): void {
  act(() => cockpitStore.handleMessage({ type: "shell/runEvents-append", seq: seq++, payload: events }));
}

// ── Montar a vista ──────────────────────────────────────────────────────────

/** Monta a vista no tamanho de um painel largo (1440 × 900); `size` muda isso. */
export function mountMap(props: Partial<HiveMapViewProps> = {}, size: { width: number; height?: number } = { width: 1440, height: 900 }): { container: HTMLElement; root: () => HTMLElement } {
  const container = mount(<HiveMapView onBack={() => cockpitStore.setView("cockpit")} onOpenDecision={(r) => cockpitStore.requestDecision(r)} onSelectInitiative={() => undefined} {...props} />);
  // O jsdom não mede nada: o ResizeObserver de mentira entrega o tamanho do painel logo depois de montar.
  activeStubs?.resize(size.width, size.height ?? 900);
  return { container, root: () => container.querySelector<HTMLElement>("section[aria-label='Mapa da colmeia']")! };
}

// ── Esperas que observam o DOM ──────────────────────────────────────────────

/**
 * Enquanto o teste espera o DOM mudar por conta própria (o redesenho acontece
 * no quadro seguinte, fora de `act`), o React não precisa avisar "não está
 * dentro de act": é o que a espera quer observar, não um erro.
 */
async function outsideAct<T>(wait: () => Promise<T>): Promise<T> {
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const before = g.IS_REACT_ACT_ENVIRONMENT;
  g.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    return await wait();
  } finally {
    g.IS_REACT_ACT_ENVIRONMENT = before;
  }
}

/** Espera a condição ficar verdadeira, observando as mudanças do DOM (e checando já). Devolve os ms que levou. */
export function untilDom(condition: () => boolean, { within = 2000, target = document.body }: { within?: number; target?: Node } = {}): Promise<number> {
  const started = performance.now();
  return outsideAct(
    () =>
      new Promise<number>((resolve, reject) => {
        if (condition()) return resolve(0);
        const observer = new MutationObserver(() => {
          if (condition()) {
            observer.disconnect();
            clearTimeout(timer);
            resolve(performance.now() - started);
          }
        });
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`a condição não ficou verdadeira em ${within} ms`));
        }, within);
        observer.observe(target, { subtree: true, childList: true, attributes: true, characterData: true });
      })
  );
}

/** O próximo quadro de animação (com o `requestAnimationFrame` do jsdom), e o seguinte, para o React terminar o que o quadro agendou. */
export const nextFrame = (): Promise<void> =>
  outsideAct(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );

// ── Consultas ───────────────────────────────────────────────────────────────

export const islandButton = (root: ParentNode, id: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`button[data-island="${id}"]`)!;
export const islandButtons = (root: ParentNode): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>("button[data-island]")];
export const bees = (root: ParentNode): HTMLElement[] => [...root.querySelectorAll<HTMLElement>("[data-bee]")];
export const beeOf = (root: ParentNode, agent: string, island?: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-bee="${agent}"]${island ? `[data-island="${island}"]` : ""}`);
export const panelOf = (root: ParentNode): HTMLElement | null => root.querySelector<HTMLElement>("aside[data-panel]");
export const announcement = (root: ParentNode): string => root.querySelector("[data-announcer]")?.textContent?.trim() ?? "";
export const buttonNamed = (root: ParentNode, name: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().replace(/\s+/g, " ") === name);
  if (!found) throw new Error(`botão "${name}" não encontrado`);
  return found;
};
export const textOf = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
