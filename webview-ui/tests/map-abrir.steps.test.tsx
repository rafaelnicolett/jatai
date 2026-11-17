import "./support/recordingVsCodeApi";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarioTitles } from "../../tests/features/gherkin";
import { ShellRoot } from "../src/apps/cockpit/ShellRoot";
import { fitStage } from "../src/apps/cockpit/map/stageFit";
import { STAGE } from "../src/apps/cockpit/map/layout";
import { cockpitStore } from "../src/store/CockpitStore";
import { HOTFIX_ID, MISSAO_ID, hotfixInitiative, missaoInitiative } from "../src/mock/colmeiaScenarios";
import { click, cleanup, key, mount, rulesMatching, source } from "./support/component";
import { buttonNamed, bees, deliver, installBrowserStubs, islandButton, islandButtons, mountMap, textOf, untilDom, type BrowserStubs } from "./support/mapDom";
import { persisted, resetVsCodeApi, sent } from "./support/recordingVsCodeApi";
import { started } from "./support/colmeiaWorld";

/**
 * Step definitions de `abrir-o-mapa-da-colmeia.feature` (F5.3). Cada cenário
 * do .feature tem um teste com o mesmo título; cenário sem teste reprova.
 */
const FEATURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/features/abrir-o-mapa-da-colmeia.feature");

let stubs: BrowserStubs;
beforeEach(() => {
  resetVsCodeApi();
  document.body.className = "";
  document.documentElement.removeAttribute("data-view");
  stubs = installBrowserStubs();
  stubs.resize(1440, 900);
});
afterEach(() => {
  cleanup();
  stubs.restore();
  vi.restoreAllMocks();
});

const label = (root: ParentNode, id: string): string => root.querySelector(`button[data-island="${id}"]`)?.getAttribute("aria-label") ?? "";

/** O Cockpit de verdade, com o snapshot da Missão (ativa) e do hotfix; `persist` acrescenta ao estado do painel (ex.: a visão). */
function mountCockpit(events: Parameters<typeof deliver>[0]["events"] = [], persist: Record<string, unknown> = {}): HTMLElement {
  persisted.state = { activeTab: "live-progress", collapsedSections: {}, ...persist };
  deliver({ events });
  return mount(<ShellRoot />);
}

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "O mapa desenha os streams como ilhas ligadas pelos gates": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    expect(islandButtons(root()).map((b) => b.getAttribute("data-island"))).toEqual(["discovery", "planning", "execution", "operation"]);
    expect(islandButtons(root()).map((b) => b.getAttribute("aria-label")!.split(":")[0])).toEqual(["Ilha Descoberta", "Ilha Planejamento", "Ilha Execução", "Ilha Operação"]);
    const bridge = (gate: string) => root().querySelector(`[data-bridge][data-gate="${gate}"]`)!;
    expect(bridge("D1").getAttribute("data-state")).toBe("approved");
    expect(bridge("D2").getAttribute("data-state")).toBe("approved");
    expect(bridge("D3").getAttribute("data-state")).toBe("unbuilt");
    // A ilha da Execução é o lugar onde a iniciativa está agora.
    expect(islandButton(root(), "execution").getAttribute("data-state")).toBe("current");
    expect(label(root(), "execution")).toContain("Epic 0 · Fundação em andamento");
    expect(textOf(root().querySelector("nav[aria-label='Onde a iniciativa está']"))).toContain("Execução · Epic 0 · Fundação");
  },

  "O operador volta ao Cockpit no mesmo ponto": () => {
    const container = mountCockpit();
    const cockpit = container.firstElementChild as HTMLElement;
    // Um estado local do Cockpit: a parada "Epic 1" escolhida no quadro (fica no estado da visão, não no mapa).
    const stop = (): Element | undefined => [...container.querySelectorAll("[role='tab']")].find((t) => (t.getAttribute("aria-label") ?? textOf(t)).startsWith("Epic 1"));
    click(stop());
    expect(stop()?.getAttribute("aria-selected")).toBe("true");
    const before = container.innerHTML;
    act(() => cockpitStore.setView("map"));
    expect(container.querySelector("section[aria-label='Mapa da colmeia']")).not.toBeNull();
    // Com o mapa à frente, o Cockpit continua montado (o CSS só o esconde): o mesmo elemento, com o mesmo estado.
    expect(document.documentElement.getAttribute("data-view")).toBe("map");
    expect(container.firstElementChild).toBe(cockpit);
    click(buttonNamed(container, "Voltar ao Cockpit"));
    expect(cockpitStore.getSnapshot().view).toBe("cockpit");
    expect(document.documentElement.getAttribute("data-view")).toBe("cockpit");
    expect(container.querySelector("section[aria-label='Mapa da colmeia']")).toBeNull();
    expect(container.firstElementChild).toBe(cockpit);
    // O Cockpit volta exatamente como estava: a mesma árvore, a mesma parada escolhida e a iniciativa da Missão na barra superior.
    expect(container.innerHTML).toBe(before);
    expect(stop()?.getAttribute("aria-selected")).toBe("true");
    expect(textOf(container)).toContain("Missão Open Source");
  },

  "Um stream que ainda não começou aparece adormecido": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    expect(islandButton(root(), "operation").getAttribute("data-state")).toBe("sleeping");
    expect(label(root(), "operation")).toBe("Ilha Operação: ainda não começou, acorda depois do gate D3");
    expect(textOf(root().querySelector("[data-label='operation']"))).toContain("depois do D3");
  },

  "As ilhas seguem o fluxo do tipo de iniciativa": () => {
    deliver({ initiatives: [hotfixInitiative()], active: HOTFIX_ID, events: [] });
    const { root } = mountMap();
    expect(islandButtons(root()).map((b) => label(root(), b.getAttribute("data-island")!).split(":")[0])).toEqual(["Ilha Diagnóstico", "Ilha Correção", "Ilha Validação"]);
    const all = textOf(root());
    for (const name of ["Descoberta", "Planejamento", "Execução", "Operação"]) expect(all).not.toContain(`Ilha ${name}`);
  },

  "Trocar de iniciativa troca o mapa inteiro": async () => {
    // O Cockpit de verdade, com a Missão e o hotfix no registro e um agente trabalhando na Missão.
    const container = mountCockpit([started("@migration-agent", "epic-0/task-0.2", "semeando")]);
    click(buttonNamed(container, "Mapa"));
    const root = (): HTMLElement => container.querySelector<HTMLElement>("section[aria-label='Mapa da colmeia']")!;
    expect(bees(root()).map((b) => b.getAttribute("data-bee"))).toEqual(["@migration-agent"]);
    // A pessoa escolhe a outra iniciativa no seletor do mapa.
    click(buttonNamed(root(), "Iniciativa: Missão Open Source"));
    click(root().querySelector("[role='option'][data-initiative='" + HOTFIX_ID + "']"));
    // O desenho acompanha no quadro seguinte (frameThrottle): espera o DOM mudar, sem dormir.
    await untilDom(() => islandButtons(root()).length === 3);
    expect(islandButtons(root()).map((b) => b.getAttribute("data-island"))).toEqual(["wave-1", "wave-2", "wave-3"]);
    expect(bees(root()).map((b) => b.getAttribute("data-bee"))).not.toContain("@migration-agent");
    expect(textOf(root())).toContain("Hotfix: tela 1 do Wizard em branco");
  },

  "O mapa abre na iniciativa que o Cockpit está vendo": () => {
    // A iniciativa ativa do registro é a Missão, mas o Cockpit está vendo o hotfix (visão do cliente, G15).
    const container = mountCockpit([], { viewTarget: { kind: "initiative", id: HOTFIX_ID } });
    click(buttonNamed(container, "Mapa"));
    const root = container.querySelector<HTMLElement>("section[aria-label='Mapa da colmeia']")!;
    expect(islandButtons(root).map((b) => b.getAttribute("data-island"))).toEqual(["wave-1", "wave-2", "wave-3"]);
    expect(textOf(root)).toContain("Hotfix: tela 1 do Wizard em branco");
    // O registro segue com a Missão ativa: abrir o mapa nunca troca a ativa.
    expect(cockpitStore.getSnapshot().snapshot?.initiatives?.active).toBe(MISSAO_ID);
  },

  "Escolher outra iniciativa no mapa é só olhar, como no Cockpit": async () => {
    const container = mountCockpit();
    click(buttonNamed(container, "Mapa"));
    const root = (): HTMLElement => container.querySelector<HTMLElement>("section[aria-label='Mapa da colmeia']")!;
    click(buttonNamed(root(), "Iniciativa: Missão Open Source"));
    click(root().querySelector("[role='option'][data-initiative='" + HOTFIX_ID + "']"));
    await untilDom(() => islandButtons(root()).length === 3);
    // O mapa e o Cockpit passam a ver a mesma iniciativa: a visão do cliente, que o painel guarda.
    expect((persisted.state as { viewTarget?: unknown }).viewTarget).toEqual({ kind: "initiative", id: HOTFIX_ID });
    // O registro não muda: o snapshot segue com a Missão ativa e nada foi ao host para trocar a ativa.
    expect(cockpitStore.getSnapshot().snapshot?.initiatives?.active).toBe(MISSAO_ID);
    expect(sent.filter((m) => m["type"] === "switchInitiative")).toEqual([]);
  },

  "Sem iniciativa ativa o mapa explica o que falta": () => {
    deliver({ active: null, events: [] });
    const { root } = mountMap();
    const empty = root().querySelector("[data-map-empty]");
    expect(empty).not.toBeNull();
    expect(textOf(empty)).toContain("Não há iniciativa ativa");
    expect(textOf(empty)).toContain("Abra uma iniciativa com o @jatai");
    expect(islandButtons(root())).toEqual([]);
    click(buttonNamed(root(), "Abrir o chat"));
    expect(sent).toContainEqual({ type: "openChat" });
  },

  "Uma falha ao desenhar o mapa não apaga o painel": () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // o React registra a exceção que o ErrorBoundary segura
    // Um item nulo no registro: nenhum leitor real o produz, e a derivação do mapa lança ao lê-lo.
    const corrupted = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.1": null as never } } } });
    persisted.state = { activeTab: "live-progress", collapsedSections: {} };
    deliver({ initiatives: [corrupted], events: [] });
    const container = mount(<ShellRoot />);
    click(buttonNamed(container, "Mapa"));
    const alert = container.querySelector("section[data-scene] [role='alert']");
    expect(alert).not.toBeNull();
    // O Cockpit ficou escondido: o foco sai do botão "Mapa" e vai para o aviso, para o teclado e o Esc seguirem valendo.
    expect(alert!.contains(document.activeElement)).toBe(true);
    expect(textOf(alert)).toContain("O mapa da colmeia falhou ao desenhar");
    expect(textOf(alert)).toContain("Nada foi gravado");
    expect(textOf(alert)).toContain("Motivo:");
    // Nada foi ao host, e a barra do Cockpit segue viva por baixo.
    expect(sent).toEqual([]);
    expect(document.documentElement.getAttribute("data-view")).toBe("map");
    click(buttonNamed(container, "Voltar ao Cockpit"));
    expect(cockpitStore.getSnapshot().view).toBe("cockpit");
    expect(container.querySelector("section[data-scene]")).toBeNull();
    // Esc também volta, como no mapa que desenhou.
    click(buttonNamed(container, "Mapa"));
    key(container.querySelector("section[data-scene]"), "Escape");
    expect(cockpitStore.getSnapshot().view).toBe("cockpit");
    expect(container.querySelector("section[data-scene]")).toBeNull();
  },

  "O botão Mapa da barra superior abre o mapa": () => {
    const container = mountCockpit();
    expect(cockpitStore.getSnapshot().view).toBe("cockpit");
    expect(container.querySelector("section[aria-label='Mapa da colmeia']")).toBeNull();
    click(buttonNamed(container, "Mapa"));
    expect(cockpitStore.getSnapshot().view).toBe("map");
    expect(container.querySelector("section[aria-label='Mapa da colmeia']")).not.toBeNull();
    // O foco vai para o título do mapa, para quem navega pelo teclado começar por ele.
    expect(document.activeElement?.hasAttribute("data-map-title")).toBe(true);
  },

  "Esc volta ao Cockpit": () => {
    const container = mountCockpit();
    click(buttonNamed(container, "Mapa"));
    const map = container.querySelector("section[aria-label='Mapa da colmeia']")!;
    key(map, "Escape");
    expect(cockpitStore.getSnapshot().view).toBe("cockpit");
    expect(container.querySelector("section[aria-label='Mapa da colmeia']")).toBeNull();
  },

  "A cena do mapa cabe em qualquer largura sem encolher o texto": () => {
    // Em painel estreito o padrão é a lista; quem escolheu a cena a mantém em qualquer largura.
    persisted.state = { activeTab: "live-progress", collapsedSections: {}, mapMode: "scene" };
    deliver({ events: [] });
    const { root } = mountMap();
    const stage = (): HTMLElement => root().querySelector<HTMLElement>("[data-stage-scale]")!;
    for (const [width, height] of [[1440, 900], [1080, 720], [720, 640], [420, 640]] as const) {
      stubs.resize(width, height);
      const fit = fitStage(width, height);
      // A cena inteira cabe, escalada, e centrada.
      expect(Number(stage().getAttribute("data-stage-scale"))).toBeCloseTo(fit.k, 3);
      expect(STAGE.w * fit.k).toBeLessThanOrEqual(width + 0.5);
      expect(STAGE.h * fit.k).toBeLessThanOrEqual(height + 0.5);
      expect(stage().style.transform).toBe(`translate(${fit.x}px, ${fit.y}px) scale(${fit.k})`);
      // A escala inteira entra como --k, e os rótulos a invertem: o texto mantém o tamanho.
      expect(stage().style.getPropertyValue("--k")).toBe(String(fit.k));
    }
    const css = source("apps/cockpit/map/Stage.module.css");
    expect(rulesMatching(css, ".label")).toContain("scale(calc(1 / var(--k)))");
    expect(rulesMatching(css, ".gate")).toContain("scale(calc(1 / var(--k)))");
  },
};

describe("Funcionalidade: Abrir o mapa da colmeia", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
