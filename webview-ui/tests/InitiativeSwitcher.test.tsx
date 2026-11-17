import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { Compass, Hammer, Wrench } from "lucide-react";
import { InitiativeSwitcher, type SwitcherOption } from "../src/apps/cockpit/shell/ContextBar/InitiativeSwitcher";
import { accessibleName, cleanup, click, key, mount } from "./support/component";

/**
 * Seletor de iniciativa (DS v2 §4.1): pílula que abre um listbox. Escolher é só
 * visão (G15): o componente só avisa qual opção foi escolhida. Teclado completo:
 * ↓ abre, ↑/↓ movem com volta, Home/End vão às pontas, digitar busca pelo nome,
 * Esc fecha e devolve o foco ao botão.
 */
afterEach(cleanup);

const OPTIONS: SwitcherOption[] = [
  { key: "discovery", label: "Descoberta", meta: "Foundation · workspace inteiro", icon: Compass, section: "Workspace" },
  { key: "initiative:mod-x", label: "Modernização de pagamentos", meta: "Modernização · epic 1/2", icon: Hammer, section: "Iniciativas" },
  { key: "initiative:hotfix-y", label: "Hotfix de juros", meta: "Hotfix · onda 0/2", icon: Wrench, section: "Iniciativas" },
];

function setup(over: Partial<React.ComponentProps<typeof InitiativeSwitcher>> = {}) {
  const onSelect = vi.fn();
  const onNew = vi.fn();
  const c = mount(
    <InitiativeSwitcher label="Modernização de pagamentos" meta="Modernização · epic 1/2" icon={Hammer} accessibleName="Iniciativa: Modernização de pagamentos, modernização, ativa" options={OPTIONS} activeKey="initiative:mod-x" onSelect={onSelect} onNew={onNew} {...over} />
  );
  const trigger = (): HTMLButtonElement => c.querySelector("button[aria-haspopup='listbox']")!;
  const options = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>("[role='option']")];
  return { c, onSelect, onNew, trigger, options };
}

describe("InitiativeSwitcher — leitura", () => {
  it("fechado: um botão com aria-haspopup=listbox, aria-expanded=false e o nome acessível completo", () => {
    const { trigger } = setup();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(accessibleName(trigger())).toBe("Iniciativa: Modernização de pagamentos, modernização, ativa");
    expect(document.querySelector("[role='listbox']")).toBeNull();
  });

  it("aberto: um listbox com os grupos Workspace e Iniciativas, a opção marcada com aria-selected, e '+ Nova iniciativa'", () => {
    const { trigger, options } = setup();
    click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(document.querySelector("[role='listbox']")!.id);
    expect([...document.querySelectorAll("[role='group']")].map((g) => g.getAttribute("aria-label"))).toEqual(["Workspace", "Iniciativas"]);
    expect(options().map((o) => [o.textContent, o.getAttribute("aria-selected")])).toEqual([
      ["DescobertaFoundation · workspace inteiro", "false"],
      ["Modernização de pagamentosModernização · epic 1/2", "true"],
      ["Hotfix de jurosHotfix · onda 0/2", "false"],
    ]);
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Nova iniciativa"))).toBe(true);
  });
});

describe("InitiativeSwitcher — teclado", () => {
  it("↓ no botão abre, e o foco vai para a opção marcada", () => {
    const { trigger, options } = setup();
    key(trigger(), "ArrowDown");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(options()[1]);
  });

  it("↑ e ↓ movem o foco com volta nas pontas; Home e End vão às pontas", () => {
    const { trigger, options } = setup();
    click(trigger());
    key(document.activeElement, "ArrowDown");
    expect(document.activeElement).toBe(options()[2]);
    key(document.activeElement, "ArrowDown");
    expect(document.activeElement).toBe(options()[0]); // volta ao começo
    key(document.activeElement, "ArrowUp");
    expect(document.activeElement).toBe(options()[2]); // e ao fim
    key(document.activeElement, "Home");
    expect(document.activeElement).toBe(options()[0]);
    key(document.activeElement, "End");
    expect(document.activeElement).toBe(options()[2]);
  });

  it("digitar busca pelo começo do nome, e as letras seguidas formam o prefixo", () => {
    const { trigger, options } = setup();
    click(trigger());
    key(document.activeElement, "h");
    expect(document.activeElement).toBe(options()[2]);
    key(document.activeElement, "o"); // "ho" ainda é o Hotfix
    expect(document.activeElement).toBe(options()[2]);
    key(document.activeElement, "z"); // "hoz" não existe: o foco fica onde está
    expect(document.activeElement).toBe(options()[2]);
  });

  it("outra busca, numa nova abertura, chega a outra opção", () => {
    const { trigger, options } = setup();
    click(trigger());
    key(document.activeElement, "Escape");
    click(trigger());
    key(document.activeElement, "d");
    expect(document.activeElement).toBe(options()[0]);
  });

  it("Esc fecha e devolve o foco ao botão, sem escolher nada", () => {
    const { trigger, onSelect } = setup();
    click(trigger());
    key(document.activeElement, "Escape");
    expect(document.querySelector("[role='listbox']")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("só o botão e as opções entram na ordem de tabulação: as opções são alcançadas pelas setas (tabindex=-1)", () => {
    const { trigger, options } = setup();
    click(trigger());
    expect(options().every((o) => o.tabIndex === -1)).toBe(true);
    expect(trigger().tabIndex).toBe(0);
  });
});

describe("InitiativeSwitcher — escolher", () => {
  it("escolher uma opção avisa a chave e fecha, com o foco de volta no botão", () => {
    const { trigger, options, onSelect } = setup();
    click(trigger());
    click(options()[2]);
    expect(onSelect).toHaveBeenCalledWith("initiative:hotfix-y");
    expect(document.querySelector("[role='listbox']")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("'+ Nova iniciativa' pede uma iniciativa nova e fecha", () => {
    const { trigger, onNew } = setup();
    click(trigger());
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Nova iniciativa")));
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[role='listbox']")).toBeNull();
  });

  it("um clique fora fecha", () => {
    const { trigger } = setup();
    click(trigger());
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.querySelector("[role='listbox']")).toBeNull();
  });
});
