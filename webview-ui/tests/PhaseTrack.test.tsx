import { describe, it, expect, afterEach, vi } from "vitest";
import { PhaseTrack, type TrackBridgeView, type TrackSegmentView, type TrackStopView } from "../src/design-system/patterns/PhaseTrack/PhaseTrack";
import { accessibleName, cleanup, click, key, mount, rulesMatching, source } from "./support/component";

/** PhaseTrack do DS v2 (§4.2): landmark, lista, abas itinerantes, ponte que vira botão e movimento reduzido. */

afterEach(cleanup);

const css = source("design-system/patterns/PhaseTrack/PhaseTrack.module.css");

const segments: TrackSegmentView[] = [
  { id: "discovery", label: "Descoberta", status: "done", eyebrow: "Concluído" },
  { id: "planning", label: "Planejamento", status: "done", eyebrow: "Concluído" },
  { id: "execution", label: "Execução", status: "current", eyebrow: "Você está aqui · Epic 0" },
  { id: "operation", label: "Operação", status: "future", eyebrow: "Depois" },
];
const bridges: TrackBridgeView[] = [
  { gate: "D1", status: "approved" },
  { gate: "D2", status: "approved" },
  { gate: "D3", status: "future", reason: "2 tarefas abertas" },
];
const stops: TrackStopView[] = [
  { key: "epic-0", n: 0, label: "Fundação", status: "working", progress: 18, here: true, unit: "Epic" },
  { key: "epic-1", n: 1, label: "Marca", status: "future", progress: null, here: false, unit: "Epic" },
  { key: "epic-2", n: 2, label: "Saneamento", status: "queue", progress: 0, here: false, unit: "Epic" },
];

function track(over: Partial<React.ComponentProps<typeof PhaseTrack>> = {}) {
  const onSelectStop = vi.fn();
  const c = mount(<PhaseTrack segments={segments} bridges={bridges} stops={stops} stopsLabel="Épicos da Execução" selectedKey="epic-0" onSelectStop={onSelectStop} controls="epic-board" {...over} />);
  return { c, onSelectStop };
}

describe("PhaseTrack — landmark e leitura", () => {
  it("é um nav 'Trilha da missão' com uma lista, e cada item é lido inteiro", () => {
    const { c } = track();
    const nav = c.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Trilha da missão");
    const items = [...nav.querySelectorAll("ol > li")].map((li) => accessibleName(li).replace(/\s+/g, " "));
    expect(items[0]).toContain("Descoberta");
    expect(items[0]).toContain("concluído");
    expect(items[1]).toBe("gate D1, aprovado");
    expect(items[5]).toBe("gate D3, depois: 2 tarefas abertas");
    expect(items[6]).toContain("Operação");
  });

  it("o segmento atual leva aria-current=step e o 'você está aqui' em texto", () => {
    const { c } = track();
    const current = c.querySelector("li[aria-current='step']")!;
    expect(current.textContent).toContain("Você está aqui · Epic 0");
  });
});

describe("PhaseTrack — paradas como abas (tabindex itinerante)", () => {
  it("o tablist tem nome, cada parada é uma aba com aria-selected e aria-controls, e a da missão leva aria-current", () => {
    const { c } = track();
    const tablist = c.querySelector("[role='tablist']")!;
    expect(tablist.getAttribute("aria-label")).toBe("Épicos da Execução");
    const tabs = [...tablist.querySelectorAll<HTMLElement>("[role='tab']")];
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.every((t) => t.getAttribute("aria-controls") === "epic-board")).toBe(true);
    expect(tabs[0]!.getAttribute("aria-current")).toBe("step");
    expect(accessibleName(tabs[0]!)).toBe("Epic 0 · Fundação · 18% · em andamento · a missão está aqui");
  });

  it("só a parada selecionada fica na ordem de tabulação", () => {
    const { c } = track({ selectedKey: "epic-1" });
    const tabs = [...c.querySelectorAll<HTMLElement>("[role='tab']")];
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("← e → movem e selecionam (com volta nas pontas); Home e End vão às pontas", () => {
    const { c, onSelectStop } = track();
    const tabs = [...c.querySelectorAll<HTMLElement>("[role='tab']")];
    key(tabs[0], "ArrowRight");
    expect(onSelectStop).toHaveBeenLastCalledWith("epic-1");
    key(tabs[0], "ArrowLeft");
    expect(onSelectStop).toHaveBeenLastCalledWith("epic-2");
    key(tabs[1], "End");
    expect(onSelectStop).toHaveBeenLastCalledWith("epic-2");
    key(tabs[2], "Home");
    expect(onSelectStop).toHaveBeenLastCalledWith("epic-0");
  });

  it("o clique seleciona a parada", () => {
    const { c, onSelectStop } = track();
    click(c.querySelectorAll("[role='tab']")[2]);
    expect(onSelectStop).toHaveBeenCalledWith("epic-2");
  });

  it("sem paradas, a trilha diz quando elas aparecem", () => {
    const { c } = track({ stops: [], stopsEmpty: "Os épicos aparecem quando o Planejamento terminar." });
    expect(c.querySelector("[role='tablist']")).toBeNull();
    expect(c.textContent).toContain("Os épicos aparecem quando o Planejamento terminar.");
  });
});

describe("PhaseTrack — gate que espera você", () => {
  it("a ponte vira o botão que abre a decisão, com o nome completo", () => {
    const onDecide = vi.fn();
    const { c } = track({ bridges: [bridges[0]!, bridges[1]!, { gate: "D3", status: "waiting", onDecide }] });
    const button = c.querySelector<HTMLButtonElement>("li button[aria-label^='Gate D3']")!;
    expect(button.getAttribute("aria-label")).toBe("Gate D3 espera você. Abrir a decisão.");
    click(button);
    expect(onDecide).toHaveBeenCalledTimes(1);
  });

  it("estado nunca só por cor: o bloqueado diz o motivo em texto", () => {
    const { c } = track({ bridges: [bridges[0]!, bridges[1]!, { gate: "D3", status: "blocked", reason: "epic-0/task-2 bloqueada: espera o dono" }] });
    expect(c.querySelector("li[data-status='blocked']")?.textContent).toContain("gate D3, bloqueado: epic-0/task-2 bloqueada: espera o dono");
  });
});

describe("PhaseTrack — hotfix e vista própria", () => {
  const waves: TrackSegmentView[] = [
    { id: "wave-1", label: "Diagnóstico", status: "done", eyebrow: "Concluído" },
    { id: "wave-2", label: "Correção", status: "current", eyebrow: "Você está aqui" },
  ];

  it("no hotfix cada onda é uma aba que abre o quadro dela", () => {
    const { c, onSelectStop } = track({ segments: waves, bridges: [], stops: [], segmentsSelectable: true, selectedKey: "wave-2", stopsLabel: "Ondas do hotfix" });
    const tabs = [...c.querySelectorAll<HTMLElement>("[role='tab']")];
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    key(tabs[1], "ArrowLeft");
    expect(onSelectStop).toHaveBeenLastCalledWith("wave-1");
  });

  it("o segmento que abre uma vista própria (Operação) vira botão", () => {
    const onOpenSegment = vi.fn();
    const { c } = track({ openableSegmentId: "operation", onOpenSegment });
    const button = [...c.querySelectorAll("button")].find((b) => b.textContent?.includes("Operação"))!;
    click(button);
    expect(onOpenSegment).toHaveBeenCalledWith("operation");
  });
});

describe("PhaseTrack — movimento e cores forçadas", () => {
  it("a abelha só se move numa rajada (iterações do token), que o movimento reduzido zera", () => {
    const bee = rulesMatching(css, ".bee");
    expect(bee).toContain("var(--jt-iterations-burst)");
    expect(bee).not.toContain("infinite");
  });

  it("cores forçadas: o traçado das pontes e o foco usam cores do sistema", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain("CanvasText");
    expect(forced).toContain("Highlight");
  });

  it("o divisor responde à largura do próprio painel (container query)", () => {
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("@container (max-width: 599px)");
  });
});
