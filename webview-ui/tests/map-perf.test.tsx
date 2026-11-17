import "./support/recordingVsCodeApi";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { deriveView } from "../src/apps/cockpit/map/useColmeia";
import { MAX_BEES_PER_ISLAND } from "../src/apps/cockpit/map/sceneModel";
import { missaoInitiative, stressEvents } from "../src/mock/colmeiaScenarios";
import { cleanup } from "./support/component";
import { beeOf, bees, deliver as deliverRaw, installBrowserStubs, mountMap, untilDom, type BrowserStubs } from "./support/mapDom";
import { resetVsCodeApi } from "./support/recordingVsCodeApi";
import { buildColmeiaSnapshot } from "./support/colmeiaWorld";
import { started } from "./support/colmeiaWorld";

/**
 * Orçamento do mapa (F5.3, DS v2 §3.11): 30 agentes em tela sem engasgo, até
 * 60 nós animados, só `transform` e opacidade, e o atraso do evento à tela
 * dentro do 1 s (aqui a parte do webview; o host põe 600 ms de debounce).
 *
 * São tetos de regressão, folgados de propósito para não oscilar com a
 * máquina: o que vale é o valor medido no navegador de verdade, no relatório.
 */

let stubs: BrowserStubs;
beforeEach(() => {
  resetVsCodeApi();
  document.body.className = "";
  stubs = installBrowserStubs();
});
afterEach(() => {
  cleanup();
  stubs.restore();
});

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const p95 = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)]!;

const IDLE = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.1": { status: "pending" } } } } });
const THIRTY = stressEvents(30, (i) => i * 900);

describe("orçamento do mapa — o que se calcula", () => {
  it("30 agentes e uma janela de 200 eventos viram o mapa inteiro (snapshot, ColmeiaVM, detalhes e cena) em poucos milissegundos", () => {
    const filler = Array.from({ length: 170 }, (_, i) => started(`@ruido-${i % 7}`, `epic-0/task-1.${i}`));
    const snapshot = buildColmeiaSnapshot({ initiatives: [IDLE], events: [...filler, ...THIRTY] });
    const state = { status: "ready" as const, snapshot, recentRunEvents: [] };
    const runs = Array.from({ length: 25 }, () => {
      const t0 = performance.now();
      const view = deriveView(state, { maxBeesPerIsland: 30 });
      expect(view.scene.bees.length).toBeGreaterThanOrEqual(30);
      return performance.now() - t0;
    });
    expect(median(runs)).toBeLessThan(40);
    expect(p95(runs)).toBeLessThan(120);
  });
});

describe("orçamento do mapa — o que se anima", () => {
  it("30 agentes: 30 abelhas com uma animação cada, bem abaixo dos 60 nós animados, todas só de `transform`", () => {
    deliverRaw({ initiatives: [IDLE], events: THIRTY });
    const { root } = mountMap({ scene: { maxBeesPerIsland: 30 } });
    expect(bees(root())).toHaveLength(30);
    const animated = stubs.animations.filter((a) => a.state === "running");
    expect(animated).toHaveLength(30);
    expect(animated.length).toBeLessThanOrEqual(60);
    for (const a of animated) for (const f of a.keyframes as Array<Record<string, string>>) expect(Object.keys(f)).toEqual(["transform"]);
  });

  it("no limite padrão, as abelhas além de seis por ilha viram o chip '+N' e a cena nunca passa de seis por ilha", () => {
    deliverRaw({ initiatives: [IDLE], events: THIRTY });
    const { root } = mountMap();
    const perIsland = new Map<string, number>();
    for (const b of bees(root())) perIsland.set(b.getAttribute("data-island")!, (perIsland.get(b.getAttribute("data-island")!) ?? 0) + 1);
    expect(Math.max(...perIsland.values())).toBeLessThanOrEqual(MAX_BEES_PER_ISLAND);
    expect(root().querySelectorAll("[data-more]").length).toBeGreaterThan(0);
    expect(stubs.animations.filter((a) => a.state === "running").length).toBeLessThanOrEqual(60);
  });

  it("sem ninguém trabalhando não há nó animado nenhum e nenhum redesenho é pedido sozinho (CPU ociosa)", async () => {
    deliverRaw({ initiatives: [IDLE], events: [] });
    let redraws = 0;
    const { root } = mountMap({ onApplied: () => void redraws++ });
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(stubs.animations).toEqual([]);
    expect(redraws).toBe(0);
    expect(bees(root())).toEqual([]);
  });
});

describe("orçamento do mapa — o atraso do evento à tela (parte do webview)", () => {
  it("um evento isolado chega à tela no quadro seguinte: bem abaixo do teto de 1 s (o host usa 600 ms de debounce)", async () => {
    deliverRaw({ initiatives: [IDLE], events: [] });
    const { root } = mountMap();
    const event = started("@migration-agent", "epic-0/task-0.2");
    const t0 = performance.now();
    deliverRaw({ initiatives: [IDLE], events: [event] }, [event]);
    await untilDom(() => beeOf(root(), "@migration-agent") !== null, { within: 1000 });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(250);
  });

  it("uma rajada de 40 eventos é desenhada uma vez, com o estado mais novo, e o último chega dentro do teto", async () => {
    deliverRaw({ initiatives: [IDLE], events: [] });
    let redraws = 0;
    const { root } = mountMap({ onApplied: () => void redraws++, scene: { maxBeesPerIsland: 50 } });
    const burst = Array.from({ length: 40 }, (_, i) => started(`@agente-${i}`, `epic-0/task-2.${i}`));
    const t0 = performance.now();
    for (const e of burst) deliverRaw({ initiatives: [IDLE], events: burst.slice(0, burst.indexOf(e) + 1) }, [e]);
    await untilDom(() => beeOf(root(), "@agente-39") !== null, { within: 1000 });
    expect(performance.now() - t0).toBeLessThan(400);
    expect(redraws).toBeLessThanOrEqual(2);
  });

  it("30 eventos em sequência, cada um esperado até chegar à tela: a mediana e o p95 ficam abaixo do teto", async () => {
    deliverRaw({ initiatives: [IDLE], events: [] });
    const { root } = mountMap({ scene: { maxBeesPerIsland: 40 } });
    const sofar: ReturnType<typeof started>[] = [];
    const latencies: number[] = [];
    for (let i = 0; i < 30; i++) {
      const event = started(`@agente-${i}`, `epic-0/task-3.${i}`);
      sofar.push(event);
      const t0 = performance.now();
      deliverRaw({ initiatives: [IDLE], events: [...sofar] }, [event]);
      await untilDom(() => beeOf(root(), `@agente-${i}`) !== null, { within: 1000 });
      latencies.push(performance.now() - t0);
    }
    // O redesenho espera no máximo o intervalo mínimo (120 ms) e um quadro; muito abaixo de 1 s.
    expect(median(latencies)).toBeLessThan(200);
    expect(p95(latencies)).toBeLessThan(400);
  });
});
