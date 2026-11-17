import "./support/recordingVsCodeApi";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { act } from "react";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarioTitles } from "../../tests/features/gherkin";
import { cockpitStore } from "../src/store/CockpitStore";
import { ShellRoot } from "../src/apps/cockpit/ShellRoot";
import { colmeiaEvent } from "../src/mock/colmeiaScenarios";
import { click, cleanup, key, mount } from "./support/component";
import { beeOf, buttonNamed, deliver, installBrowserStubs, islandButton, islandButtons, mountMap, nextFrame, panelOf, textOf, untilDom, type BrowserStubs } from "./support/mapDom";
import { persisted, resetVsCodeApi, sent } from "./support/recordingVsCodeApi";
import { started } from "./support/colmeiaWorld";

/**
 * Step definitions de `ver-detalhes-da-ilha.feature` (F5.3). Cada cenário do
 * .feature tem um teste com o mesmo título; cenário sem teste reprova.
 */
const FEATURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/features/ver-detalhes-da-ilha.feature");

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

const open = (root: ParentNode, id: string): HTMLElement => {
  click(islandButton(root, id));
  return panelOf(root)!;
};
const bodyText = (el: ParentNode | null): string => textOf(el?.querySelector("[data-island-detail]") ?? null);

const CATALOG = [{ id: "migration-agent", role: "Semear repos/jatai" }];
const WORKING = [started("@migration-agent", "epic-0/task-0.2", "semeando repos/jatai")];

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "A ilha mostra quem trabalha ali": () => {
    deliver({ events: WORKING, agents: CATALOG.map((c) => ({ ...c, id: `@${c.id}` })) });
    const { root } = mountMap();
    const panel = open(root(), "execution");
    const row = (agent: string) => panel.querySelector<HTMLElement>(`[data-agent="${agent}"]`)!;
    expect(textOf(row("@migration-agent"))).toContain("Semear repos/jatai");
    expect(textOf(row("@migration-agent"))).toContain("trabalhando agora");
    expect(row("@migration-agent").getAttribute("data-status")).toBe("working");
    expect(textOf(row("@test-backfill-agent"))).toContain("na fila");
  },

  "Cada entrega leva à sua evidência": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const panel = open(root(), "planning");
    const links = [...panel.querySelectorAll<HTMLElement>("button[data-pot]")];
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual(["Abrir roadmap.md", "Abrir risk-matrix.md", "Abrir 0012-repositorio-isolado.md"]);
    for (const link of links) click(link);
    expect(sent.filter((m) => m["type"] === "openFile").map((m) => m["relPath"])).toEqual([
      ".github/artifacts/planning/mod-missao-open-source/roadmap.md",
      ".github/artifacts/planning/mod-missao-open-source/risk-matrix.md",
      "docs/adr/0012-repositorio-isolado.md",
    ]);
  },

  "A guarda acesa leva à decisão no Cockpit": () => {
    const ask = colmeiaEvent({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" });
    persisted.state = { activeTab: "live-progress", collapsedSections: {} };
    deliver({ events: [ask] });
    // O Cockpit de verdade, com o mapa aberto pelo botão da barra superior.
    const container = mount(<ShellRoot />);
    click(buttonNamed(container, "Mapa"));
    const panel = open(container, "execution");
    click(buttonNamed(panel, "Abrir a decisão"));
    // O Cockpit volta à frente e o diálogo de decisão abre com o contexto da decisão (F0.1).
    expect(cockpitStore.getSnapshot().view).toBe("cockpit");
    expect(container.querySelector("section[aria-label='Mapa da colmeia']")).toBeNull();
    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(textOf(dialog)).toContain("Titularidade do código");
    // O pedido foi consumido: não abre de novo sozinho.
    expect(cockpitStore.getSnapshot().pendingDecision).toBeNull();
    // O mapa não registra nada: nenhuma mensagem de aprovação, decisão ou gravação foi ao host.
    expect(sent).toEqual([]);
  },

  "Uma ilha adormecida explica quando acorda": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const panel = open(root(), "operation");
    expect(textOf(panel)).toContain("A ilha acorda depois do gate D3.");
    expect(textOf(panel.querySelector("[data-panel-status]"))).toBe("Ainda não começou");
    const agents = [...panel.querySelectorAll<HTMLElement>("[data-agent]")];
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent.getAttribute("data-status")).toBe("sleeping");
      expect(textOf(agent)).toContain("adormecido");
    }
  },

  "O operador acompanha a iniciativa pelo modo lista": () => {
    const events = [...WORKING, colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: ".github/artifacts/execution/relatorio.md" })];
    // A mesma iniciativa na cena, com cada painel aberto: o que a cena mostra.
    deliver({ events });
    const scene = mountMap();
    const panels = new Map<string, string>();
    for (const id of ["discovery", "planning", "execution", "operation"]) {
      click(islandButton(scene.root(), id));
      panels.set(id, bodyText(panelOf(scene.root())));
    }
    cleanup();
    // O modo lista, lembrado: uma lista de streams com agentes, estado e entregas.
    persisted.state = { activeTab: "live-progress", collapsedSections: {}, mapMode: "list" };
    const list = mountMap();
    const items = [...list.root().querySelectorAll<HTMLElement>("[data-list-island]")];
    expect(items.map((i) => i.getAttribute("data-list-island"))).toEqual(["discovery", "planning", "execution", "operation"]);
    expect(list.root().querySelector("[data-stage-scale]")).toBeNull();
    // As mesmas informações das ilhas: o texto de cada seção da lista é igual ao do painel da ilha.
    for (const item of items) expect(bodyText(item), item.getAttribute("data-list-island")!).toBe(panels.get(item.getAttribute("data-list-island")!));
    expect(textOf(items[2])).toContain("@migration-agent");
    expect(textOf(items[2])).toContain("trabalhando agora");
    expect(textOf(items[2])).toContain(".github/artifacts/execution/relatorio.md");
    // E a atividade recente completa, abaixo.
    expect(textOf(list.root().querySelector("[data-feed]"))).toContain("Atividade recente");
  },

  "Com movimento reduzido o estado continua visível": () => {
    stubs.setReducedMotion(true);
    deliver({ events: [] });
    const { root } = mountMap();
    expect(root().getAttribute("data-motion")).toBe("reduced");
    const event = started("@migration-agent", "epic-0/task-0.2", "semeando");
    deliver({ events: [event] }, [event]);
    return untilDom(() => beeOf(root(), "@migration-agent") !== null).then(() => {
      // Nenhuma abelha se move: sem animação nenhuma e a abelha no ponto de pouso.
      expect(beeOf(root(), "@migration-agent")?.getAttribute("data-flying")).toBe("false");
      expect(stubs.animations).toEqual([]);
      // E a ilha da Execução continua mostrando o agente trabalhando agora.
      expect(textOf(open(root(), "execution").querySelector("[data-agent='@migration-agent']"))).toContain("trabalhando agora");
    });
  },

  "A ilha mostra o passo atual e o que falta para o gate": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const panel = open(root(), "execution");
    expect(textOf(panel.querySelector("[data-step]"))).toBe("Epic 0 · Fundação");
    const section = panel.querySelector("section[aria-label='Para o gate D3']")!;
    expect(section).not.toBeNull();
    const rows = [...section.querySelectorAll<HTMLElement>("[data-check]")];
    expect(rows.map((r) => [r.getAttribute("data-check"), r.getAttribute("data-status")])).toEqual([
      ["epic-0/task-0.1", "open"],
      ["epic-0/task-0.2", "in-progress"],
      ["epic-0/task-0.3", "open"],
      ["epic-0/task-0.4", "open"],
    ]);
    expect(textOf(rows[1])).toContain("em andamento");
  },

  "As ilhas se navegam pelo teclado": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const group = root().querySelector("[role='group'][aria-label='Ilhas']")!;
    const buttons = islandButtons(root());
    // Roving tabindex: só uma ilha entra na ordem de tabulação, a atual.
    expect(buttons.filter((b) => b.tabIndex === 0).map((b) => b.getAttribute("data-island"))).toEqual(["execution"]);
    expect(buttons.every((b) => b.tagName === "BUTTON" && b.type === "button")).toBe(true);
    act(() => buttons[0]!.focus());
    const focused = () => document.activeElement?.getAttribute("data-island");
    expect(focused()).toBe("discovery");
    // As setas andam de ilha em ilha, na ordem do fluxo, e Home e End vão às pontas.
    const order: Array<string | null | undefined> = [];
    for (let i = 0; i < 3; i++) {
      key(document.activeElement, "ArrowRight");
      order.push(focused());
    }
    expect(order).toEqual(["planning", "execution", "operation"]);
    key(document.activeElement, "ArrowRight");
    expect(focused()).toBe("operation");
    key(document.activeElement, "ArrowLeft");
    expect(focused()).toBe("execution");
    key(document.activeElement, "Home");
    expect(focused()).toBe("discovery");
    key(document.activeElement, "End");
    expect(focused()).toBe("operation");
    expect(islandButtons(root()).filter((b) => b.tabIndex === 0).map((b) => b.getAttribute("data-island"))).toEqual(["operation"]);
    // Enter e Espaço ativam o botão (o padrão do navegador para um <button>): abre os detalhes da ilha com o foco.
    expect(group.contains(document.activeElement)).toBe(true);
    click(document.activeElement);
    expect(islandButton(root(), "operation").getAttribute("aria-expanded")).toBe("true");
    expect(panelOf(root())?.getAttribute("data-panel")).toBe("operation");
  },

  "Esc fecha os detalhes e devolve o foco à ilha": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const panel = open(root(), "execution");
    // Ao abrir, o foco vai para o título do painel.
    expect(document.activeElement?.id).toBe("island-panel-title");
    key(panel, "Escape");
    expect(panelOf(root())).toBeNull();
    expect(islandButton(root(), "execution").getAttribute("aria-expanded")).toBe("false");
    await nextFrame();
    expect(document.activeElement).toBe(islandButton(root(), "execution"));
    // Com os detalhes fechados, Esc volta ao Cockpit (cenário próprio); aqui a vista segue aberta.
    expect(cockpitStore.getSnapshot().view).toBe("cockpit");
  },

  "A escolha entre mapa e lista é lembrada": () => {
    deliver({ events: [] });
    const first = mountMap();
    expect(first.root().getAttribute("data-mode")).toBe("scene");
    click(buttonNamed(first.root(), "Lista"));
    expect(first.root().getAttribute("data-mode")).toBe("list");
    expect((persisted.state as { mapMode?: string }).mapMode).toBe("list");
    // Fecha o mapa e abre de novo: a escolha vale.
    cleanup();
    const again = mountMap();
    expect(again.root().getAttribute("data-mode")).toBe("list");
    expect(again.root().querySelectorAll("[data-list-island]")).toHaveLength(4);
    // E a pessoa pode voltar para a cena.
    click(buttonNamed(again.root(), "Mapa"));
    expect(again.root().getAttribute("data-mode")).toBe("scene");
    expect((persisted.state as { mapMode?: string }).mapMode).toBe("scene");
  },

  "Com leitor de tela o mapa abre em modo lista": () => {
    document.body.classList.add("vscode-using-screen-reader");
    deliver({ events: [] });
    expect(persisted.state).toBeUndefined();
    const { root } = mountMap();
    expect(root().getAttribute("data-mode")).toBe("list");
    expect(root().querySelectorAll("[data-list-island]")).toHaveLength(4);
    // A pessoa troca quando quiser, e a escolha dela passa a valer.
    click(buttonNamed(root(), "Mapa"));
    expect(root().getAttribute("data-mode")).toBe("scene");
  },

  "A escolha entre cena de dia e de noite é lembrada": () => {
    deliver({ events: [] });
    const first = mountMap();
    // O padrão é a noite (o crepúsculo do DS v2).
    expect(first.root().getAttribute("data-scene-variant")).toBe("night");
    click(buttonNamed(first.root(), "Noite"));
    expect(first.root().getAttribute("data-scene-variant")).toBe("day");
    expect((persisted.state as { mapScene?: string }).mapScene).toBe("day");
    cleanup();
    const again = mountMap();
    expect(again.root().getAttribute("data-scene-variant")).toBe("day");
    click(buttonNamed(again.root(), "Dia"));
    expect(again.root().getAttribute("data-scene-variant")).toBe("night");
  },

  "A cena de dia mostra o mesmo estado que a de noite": () => {
    const events = [...WORKING, colmeiaEvent({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" })];
    deliver({ events });
    const { root } = mountMap();
    const structure = () => ({
      islands: islandButtons(root()).map((b) => [b.getAttribute("data-island"), b.getAttribute("data-state"), b.getAttribute("aria-label")]),
      bridges: [...root().querySelectorAll("[data-bridge]")].map((b) => [b.getAttribute("data-bridge"), b.getAttribute("data-state")]),
      bees: [...root().querySelectorAll("[data-bee]")].map((b) => [b.getAttribute("data-bee"), b.getAttribute("data-condition")]),
      guards: [...root().querySelectorAll("[data-guard-lit]")].map((g) => g.getAttribute("data-guard-lit")),
      feed: [...root().querySelectorAll("[data-feed-line]")].map((l) => textOf(l)),
    });
    const night = structure();
    click(buttonNamed(root(), "Noite"));
    expect(root().getAttribute("data-scene-variant")).toBe("day");
    expect(structure()).toEqual(night);
  },
};

describe("Funcionalidade: Ver os detalhes de uma ilha", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
