import "./support/recordingVsCodeApi";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { LAND_MS, LINGER_MS } from "../src/apps/cockpit/map/BeeLayer";
import { missaoInitiative, colmeiaEvent } from "../src/mock/colmeiaScenarios";
import { cleanup, click, accessibleName, rulesMatching, source } from "./support/component";
import { beeOf, bees, buttonNamed, deliver as deliverRaw, installBrowserStubs, islandButton, islandButtons, mountMap, nextFrame, panelOf, textOf, untilDom, type BrowserStubs } from "./support/mapDom";
import { persisted, resetVsCodeApi } from "./support/recordingVsCodeApi";
import { finished, started } from "./support/colmeiaWorld";
import { fitStage } from "../src/apps/cockpit/map/stageFit";

/**
 * A vista do mapa montada no jsdom (F5.3): o que a cena faz além dos cenários
 * do BDD: o pouso da abelha, o favo que enche, a acessibilidade (papéis,
 * nomes, foco) e o que o CSS precisa dizer (jsdom não calcula CSS, então a
 * fonte do CSS Module é conferida, como nos testes do design system).
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
  vi.useRealTimers();
});

const IDLE = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.1": { status: "pending" }, "task-0.2": { status: "pending" } } } } });
const deliver = (events: Parameters<typeof deliverRaw>[0]["events"] = [], fresh: Parameters<typeof deliverRaw>[1] = []): void => deliverRaw({ initiatives: [IDLE], events }, fresh);

describe("HiveMapView — as abelhas", () => {
  it("monta as quatro ilhas e uma abelha por agente que trabalha", () => {
    deliver([started("@migration-agent", "epic-0/task-0.2", "semeando")]);
    const { root } = mountMap();
    expect(islandButtons(root()).map((b) => b.getAttribute("data-island"))).toEqual(["discovery", "planning", "execution", "operation"]);
    expect(bees(root()).map((b) => b.getAttribute("data-bee"))).toEqual(["@migration-agent"]);
    // A persona colore o colar da abelha (decorativo) e a ilha mostra a trilha de processos.
    expect(beeOf(root(), "@migration-agent")?.getAttribute("data-accent")).toBe("honey");
    expect(root().querySelector("[data-process-trail='discovery']")?.querySelectorAll("[data-process-node]").length).toBeGreaterThan(0);
  });

  it("a abelha voa por `transform` (Web Animations), uma volta em loop, e com atraso negativo para não voar junto das outras", () => {
    deliver([started("@migration-agent", "epic-0/task-0.2"), started("@test-backfill-agent", "epic-0/task-0.3")]);
    const { root } = mountMap();
    const runs = stubs.animations.filter((a) => a.state === "running");
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      const options = run.options as { iterations: number; easing: string; delay: number; duration: number };
      expect(options).toMatchObject({ iterations: Infinity, easing: "linear" });
      expect(options.delay).toBeLessThanOrEqual(0);
      const frames = run.keyframes as Array<Record<string, string>>;
      expect(frames.length).toBeGreaterThan(8);
      for (const f of frames) expect(Object.keys(f)).toEqual(["transform"]);
    }
    expect(new Set(runs.map((r) => (r.options as { delay: number }).delay)).size).toBe(2);
    expect(bees(root())).toHaveLength(2);
  });

  it("pausar para as animações onde estão, e retomar as solta; a pausa não recria as voltas", () => {
    deliver([started("@migration-agent", "epic-0/task-0.2")]);
    const { root } = mountMap();
    const [run] = stubs.animations;
    expect(stubs.animations).toHaveLength(1);
    click(buttonNamed(root(), "Pausar"));
    expect(run!.state).toBe("paused");
    click(buttonNamed(root(), "Retomar"));
    expect(run!.state).toBe("running");
    expect(stubs.animations).toHaveLength(1);
  });

  it("uma nova leitura do mesmo estado não reinicia o voo: a volta é a mesma e a abelha é o mesmo elemento", async () => {
    const event = started("@migration-agent", "epic-0/task-0.2");
    deliver([event]);
    const { root } = mountMap();
    const element = beeOf(root(), "@migration-agent");
    const first = stubs.animations.length;
    deliver([event]);
    await nextFrame();
    expect(beeOf(root(), "@migration-agent")).toBe(element);
    expect(stubs.animations).toHaveLength(first);
    expect(stubs.animations.every((a) => a.state === "running")).toBe(true);
  });

  it("a abelha que deixa de trabalhar não some: pousa (desliza até o ponto de pouso), fica um tempo e apaga", async () => {
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliver([begin]);
    const { root } = mountMap();
    const element = beeOf(root(), "@migration-agent")!;
    const end = finished("@migration-agent", "epic-0/task-0.2");
    // Os timers do pouso são os do relógio falso, para o teste andar o tempo sem esperar.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    deliver([begin, end], [end]);
    await untilDom(() => element.getAttribute("data-landing") === "true");
    // O mesmo elemento: o pouso sai de onde a abelha estava.
    expect(beeOf(root(), "@migration-agent")).toBe(element);
    const landing = stubs.animations.filter((a) => a.element === element).at(-1)!;
    expect((landing.options as { duration: number }).duration).toBe(LAND_MS);
    expect(element.querySelector("svg")?.getAttribute("data-posture")).toBe("landed");
    // Pousada, fica um tempo; depois apaga e, no fim do apagar, sai da cena.
    act(() => void vi.advanceTimersByTime(LAND_MS + LINGER_MS - 10));
    expect(element.hasAttribute("data-leaving")).toBe(false);
    act(() => void vi.advanceTimersByTime(20));
    expect(element.getAttribute("data-leaving")).toBe("true");
    act(() => void vi.advanceTimersByTime(400));
    expect(root().contains(element)).toBe(false);
  });

  it("com movimento reduzido ou em pausa a abelha que termina some de uma vez, sem pousar", async () => {
    stubs.setReducedMotion(true);
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliver([begin]);
    const { root } = mountMap();
    expect(beeOf(root(), "@migration-agent")?.getAttribute("data-flying")).toBe("false");
    const end = finished("@migration-agent", "epic-0/task-0.2");
    deliver([begin, end], [end]);
    await untilDom(() => beeOf(root(), "@migration-agent") === null);
    expect(stubs.animations).toEqual([]);
  });

  it("trocar de iniciativa leva todas as abelhas da anterior de uma vez (nenhuma pousa na iniciativa nova)", async () => {
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliverRaw({ initiatives: [IDLE, { id: "outra", name: "Outra", status: "in-progress", type: "hotfix", waves: ["wave-1: Diagnóstico"] }], events: [begin] });
    const { root } = mountMap();
    expect(bees(root())).toHaveLength(1);
    deliverRaw({ initiatives: [IDLE, { id: "outra", name: "Outra", status: "in-progress", type: "hotfix", waves: ["wave-1: Diagnóstico"] }], active: "outra", events: [begin] });
    await untilDom(() => islandButtons(root()).length === 1);
    expect(bees(root())).toEqual([]);
    expect(root().querySelector("[data-landing]")).toBeNull();
  });
});

describe("HiveMapView — o encaixe da cena na área que sobra", () => {
  it("a cena continua se encaixando depois de trocar da lista para o mapa (o canvas é um elemento só e o ResizeObserver segue nele)", () => {
    // Na lista não há cena: o canvas existe, vazio. Ao voltar para o mapa a cena nasce dentro do MESMO canvas.
    persisted.state = { activeTab: "live-progress", collapsedSections: {}, mapMode: "list" };
    deliver();
    const { root } = mountMap();
    const stage = (): HTMLElement | null => root().querySelector<HTMLElement>("[data-stage-scale]");
    expect(stage()).toBeNull();
    const canvasBefore = root().querySelector("[class*='canvas']");
    click(buttonNamed(root(), "Mapa"));
    expect(root().querySelector("[class*='canvas']")).toBe(canvasBefore);
    // O painel da ilha abre e o canvas encolhe: a cena tem que se afastar para caber, e nenhuma ilha fica atrás do painel.
    stubs.resize(1012, 900);
    expect(Number(stage()!.getAttribute("data-stage-scale"))).toBeCloseTo(fitStage(1012, 900).k, 3);
    expect(Number(stage()!.getAttribute("data-stage-scale"))).toBeLessThan(0.8);
  });
});

describe("HiveMapView — o favo que enche", () => {
  it("a entrega nova faz o favo crescer uma vez (a classe sai depois), e as que já estavam não animam", async () => {
    const first = colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: ".github/artifacts/execution/a.md" });
    deliver([first]);
    const { root } = mountMap();
    const grows = (): number => root().querySelectorAll("[class*='potFill']").length;
    expect(grows()).toBe(0);
    const second = colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: ".github/artifacts/execution/b.md" });
    deliver([first, second], [second]);
    await untilDom(() => root().querySelector("g[data-island='execution'] [data-pot$='b.md']") !== null);
    await untilDom(() => grows() === 1);
    expect(grows()).toBe(1);
    expect(root().querySelector("[data-pot$='b.md'] > [class*='potFill']")).not.toBeNull();
  });
});

describe("HiveMapView — acessibilidade", () => {
  it("as ilhas são um grupo de botões com nome, e a cena e as camadas vivas ficam fora da árvore de acessibilidade", () => {
    deliver([started("@migration-agent", "epic-0/task-0.2")]);
    const { root } = mountMap();
    const group = root().querySelector("[role='group'][aria-label='Ilhas']")!;
    expect([...group.querySelectorAll("button")]).toHaveLength(4);
    for (const b of islandButtons(root())) {
      expect(accessibleName(b)).toMatch(/^Ilha /);
      expect(b.hasAttribute("aria-expanded")).toBe(true);
    }
    expect(root().querySelector("svg[viewBox='0 0 1440 900']")?.getAttribute("aria-hidden")).toBe("true");
    expect(root().querySelector("[data-bee]")?.closest("[aria-hidden='true']")).not.toBeNull();
    // Nenhum botão da vista fica sem nome.
    for (const b of root().querySelectorAll("button")) expect(accessibleName(b), b.outerHTML.slice(0, 80)).not.toBe("");
  });

  it("um título só (h1), o painel é uma região nomeada pelo seu título (h2), e Fechar tem nome", () => {
    deliver([]);
    const { root } = mountMap();
    expect(root().querySelectorAll("h1")).toHaveLength(1);
    click(islandButton(root(), "execution"));
    const panel = panelOf(root())!;
    expect(panel.getAttribute("role")).toBe("region");
    const title = document.getElementById(panel.getAttribute("aria-labelledby")!)!;
    expect(title.tagName).toBe("H2");
    expect(title.textContent).toBe("Execução");
    expect(islandButton(root(), "execution").getAttribute("aria-controls")).toBe("island-panel");
    expect(buttonNamed(panel, "Fechar detalhes da ilha")).toBeTruthy();
    expect(textOf(root().querySelector("h1"))).toBe("Mapa da colmeia");
  });

  it("o botão alternado tem aria-pressed (Mapa e Lista, Pausar e Retomar, Noite e Dia)", () => {
    deliver([]);
    const { root } = mountMap();
    expect(buttonNamed(root(), "Mapa").getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed(root(), "Lista").getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed(root(), "Pausar").getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed(root(), "Noite").getAttribute("aria-pressed")).toBe("false");
  });

  it("o anúncio ao leitor de tela é uma região educada, e o feed (um log) não anuncia por conta própria", () => {
    deliver([started("@migration-agent", "epic-0/task-0.2")]);
    const { root } = mountMap();
    const region = root().querySelector("[data-announcer]")!;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    const log = root().querySelector("[data-feed] [role='log']")!;
    expect(log.getAttribute("aria-live")).toBe("off");
    expect(log.getAttribute("aria-relevant")).toBe("additions");
  });

  it("o foco vem do anel de duas cores em SVG (halo e anel de foco), nunca outline: none sem substituto, e forced-colors mantém o anel", () => {
    const css = source("apps/cockpit/map/Stage.module.css");
    expect(rulesMatching(css, ".isle ")).toContain("outline: none");
    expect(rulesMatching(css, ".isle:focus-visible .focus")).toContain("opacity: 1");
    expect(rulesMatching(css, ".isle:focus-visible .halo")).toContain("opacity: 1");
    expect(rulesMatching(css, ".halo")).toContain("var(--jt-scene-halo)");
    expect(rulesMatching(css, ".focus")).toContain("var(--jt-focus)");
    expect(css).toContain("@media (forced-colors: active)");
    // A seleção é o tracejado de 10/7 sobre o halo (DS v2 §4.8).
    expect(rulesMatching(css, ".select")).toContain("stroke-dasharray: 10 7");
  });

  it("o movimento nunca anima propriedade de layout: só `transform` e opacidade (as abelhas, o favo, o painel, o brilho da guarda)", () => {
    for (const file of ["apps/cockpit/map/BeeLayer.module.css", "apps/cockpit/map/SceneArt.module.css", "apps/cockpit/map/HiveMapView.module.css", "apps/cockpit/map/Stage.module.css"]) {
      const css = source(file).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const block of css.matchAll(/@keyframes [a-z-]+ \{([\s\S]*?)\n\}/g)) {
        const props = [...block[1]!.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
        for (const p of props) expect(["transform", "opacity"], `${file}: ${p}`).toContain(p);
      }
      expect(css).not.toMatch(/transition:[^;]*\b(left|top|width|height)\b/);
    }
    // E o movimento reduzido apaga as animações da cena.
    expect(source("apps/cockpit/map/BeeLayer.module.css")).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
