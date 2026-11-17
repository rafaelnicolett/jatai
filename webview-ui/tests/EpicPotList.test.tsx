import { describe, it, expect, afterEach, vi } from "vitest";
import { EpicPotList, type PotView } from "../src/design-system/patterns/EpicPot/EpicPotList";
import { accessibleName, cleanup, click, key, mount, rulesMatching, source } from "./support/component";

/** Lista de potes do DS v2 (§4.4): nav com lista de botões, seleção em azul, setas só movem o foco. */

afterEach(cleanup);

const css = source("design-system/patterns/EpicPot/EpicPotList.module.css");

const pots: PotView[] = [
  { key: "epic-0", n: 0, label: "Fundação", progress: 18, tag: "18% · em andamento", status: "working", unit: "Epic" },
  { key: "epic-1", n: 1, label: "Marca", progress: 100, tag: "100% · concluído", status: "done", unit: "Epic" },
  { key: "epic-2", n: 2, label: "Saneamento", progress: 0, tag: "0% · na fila", status: "queue", unit: "Epic" },
  { key: "epic-3", n: 3, label: "Kit", progress: null, tag: "decisão espera você", status: "you", unit: "Epic" },
];

function list(over: Partial<React.ComponentProps<typeof EpicPotList>> = {}) {
  const onSelect = vi.fn();
  const c = mount(<EpicPotList pots={pots} selectedKey="epic-0" onSelect={onSelect} ariaLabel="Épicos" heading="Potes · 4 épicos" controls="epic-board" {...over} />);
  return { c, onSelect };
}

describe("EpicPotList — leitura", () => {
  it("é uma nav 'Épicos' com uma lista de botões, o pote é decorativo e o nome é completo", () => {
    const { c } = list();
    expect(c.querySelector("nav")?.getAttribute("aria-label")).toBe("Épicos");
    const buttons = [...c.querySelectorAll<HTMLElement>("ul li button")];
    expect(buttons).toHaveLength(4);
    expect(buttons.map(accessibleName)).toEqual([
      "Epic 0 · Fundação, 18% concluído, em andamento",
      "Epic 1 · Marca, 100% concluído, concluído",
      "Epic 2 · Saneamento, 0% concluído",
      "Epic 3 · Kit, decisão esperando você",
    ]);
    expect(buttons.every((b) => b.getAttribute("aria-controls") === "epic-board")).toBe(true);
    expect(c.querySelectorAll("span[class*='glyph'][aria-hidden='true']")).toHaveLength(4);
  });

  it("marcas de estado em forma, nunca só cor: ✓ concluído, ■ espera você", () => {
    const { c } = list();
    const marks = [...c.querySelectorAll("ul li button > svg")].map((s) => s.getAttribute("data-status"));
    expect(marks).toEqual(["done", "you"]);
  });

  it("o pote enche na altura do progresso e mostra o menisco só entre 0 e 100", () => {
    const { c } = list();
    const honey = [...c.querySelectorAll<HTMLElement>("[class*='honey']")];
    expect(honey.map((h) => h.style.height)).toEqual(["18%", "100%", "0%", "0%"]);
    expect(honey.map((h) => h.getAttribute("data-meniscus"))).toEqual(["true", null, null, null]);
    expect(rulesMatching(css, ".honey")).toContain("var(--jt-dur-fill)");
  });
});

describe("EpicPotList — seleção em azul", () => {
  it("o selecionado leva aria-current e a borda --jt-selected; o mel fica para 'trabalhando'", () => {
    const { c } = list();
    const buttons = [...c.querySelectorAll("ul li button")];
    expect(buttons.map((b) => b.getAttribute("aria-current"))).toEqual(["true", null, null, null]);
    expect(rulesMatching(css, '.pot[data-selected="true"]')).toContain("var(--jt-selected)");
    expect(rulesMatching(css, '.pot[data-selected="true"]')).not.toContain("var(--jt-mel");
  });

  it("selecionar não desloca nada: a borda de 2px existe sempre, transparente", () => {
    expect(rulesMatching(css, ".pot")).toContain("2px solid transparent");
  });
});

describe("EpicPotList — teclado", () => {
  it("só um item fica na tabulação; ↑/↓ movem o foco sem selecionar, e Enter (clique) seleciona", () => {
    const { c, onSelect } = list();
    const buttons = [...c.querySelectorAll<HTMLButtonElement>("ul li button")];
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    key(buttons[0], "ArrowDown");
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1]);
    key(buttons[1], "End");
    expect(document.activeElement).toBe(buttons[3]);
    key(buttons[3], "ArrowDown");
    expect(document.activeElement).toBe(buttons[0]);
    click(buttons[2]);
    expect(onSelect).toHaveBeenCalledWith("epic-2");
  });

  it("na prateleira (painel dividido) as setas são ←/→", () => {
    const { c } = list({ layout: "shelf" });
    const buttons = [...c.querySelectorAll<HTMLButtonElement>("ul li button")];
    key(buttons[0], "ArrowRight");
    expect(document.activeElement).toBe(buttons[1]);
    expect(rulesMatching(css, '.nav[data-layout="shelf"] .list')).toContain("overflow-x: auto");
  });
});
