import { describe, it, expect, afterEach, vi } from "vitest";
import { Rocket } from "lucide-react";
import { ChoiceCard } from "../src/design-system/primitives/ChoiceCard/ChoiceCard";
import { accessibleName, cleanup, click, mount, rulesMatching, source } from "./support/component";

/**
 * ChoiceCard (novo, F4.2): os cartões de escolha do Wizard. Dois modos:
 * alternância (`aria-pressed`, o de hoje) e rádio (`role="radio"` +
 * `aria-checked`). Seleção não depende só de cor: borda, peso e ✓.
 */

afterEach(cleanup);

const css = source("design-system/primitives/ChoiceCard/ChoiceCard.module.css");

function card(c: HTMLElement): HTMLButtonElement {
  return c.querySelector("button")!;
}

describe("ChoiceCard — papel e nome", () => {
  it("alternância: <button type=button> com aria-pressed e sem role extra", () => {
    const b = card(mount(<ChoiceCard selected={false} title="Novo Projeto" />));
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(b.hasAttribute("role")).toBe(false);
    expect(b.hasAttribute("aria-checked")).toBe(false);
  });

  it("rádio: role=radio com aria-checked e sem aria-pressed", () => {
    const b = card(mount(<ChoiceCard mode="radio" selected title="Claude Code" />));
    expect(b.getAttribute("role")).toBe("radio");
    expect(b.getAttribute("aria-checked")).toBe("true");
    expect(b.hasAttribute("aria-pressed")).toBe(false);
  });

  it("o nome acessível é o título; a descrição vem por aria-describedby; o ícone é decorativo", () => {
    const c = mount(
      <ChoiceCard selected={false} title="Novo Projeto" description="Greenfield, do zero ao deploy." icon={<Rocket size={22} />} />,
    );
    const b = card(c);
    expect(accessibleName(b)).toBe("Novo Projeto");
    const desc = document.getElementById(b.getAttribute("aria-describedby")!);
    expect(c.contains(desc)).toBe(true);
    expect(desc?.textContent).toBe("Greenfield, do zero ao deploy.");
    expect(b.querySelector("svg.lucide")?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("repassa data-* (o Wizard e a paridade usam data-wizard-option)", () => {
    const b = card(mount(<ChoiceCard selected={false} title="Python" data-wizard-option="python" />));
    expect(b.getAttribute("data-wizard-option")).toBe("python");
  });
});

describe("ChoiceCard — interação e estados", () => {
  it("o clique escolhe", () => {
    const onClick = vi.fn();
    click(card(mount(<ChoiceCard selected={false} title="Python" onClick={onClick} />)));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("indisponível com motivo: aria-disabled, focável, dica e o clique não escolhe", () => {
    const onClick = vi.fn();
    const b = card(mount(<ChoiceCard selected={false} title="Copilot" disabledReason="Em breve" onClick={onClick} />));
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("title")).toBe("Em breve");
    click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("selecionado não depende só da cor: borda --jt-selected de 2px, título em 700 e ✓ aria-hidden", () => {
    const b = card(mount(<ChoiceCard selected title="Python" />));
    expect(b.querySelector("svg:last-child")?.getAttribute("aria-hidden")).toBe("true");
    const sel = rulesMatching(css, '.card[aria-pressed="true"]');
    expect(sel).toContain("var(--jt-selected)");
    expect(sel).toContain("inset 0 0 0 1px");
    expect(sel).toContain("var(--jt-weight-bold)");
    expect(sel).toContain("visibility: visible");
  });
});

describe("ChoiceCard — CSS de acessibilidade", () => {
  it("foco visível de 3px afastado 2px", () => {
    expect(rulesMatching(css, ".card:focus-visible")).toContain("var(--jt-size-focus-width) solid var(--jt-focus)");
  });

  it("hover só com ponteiro que paira; forced-colors com ButtonText e Highlight", () => {
    expect(css).toContain("@media (hover: hover)");
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(fc).toContain("ButtonText");
    expect(fc).toContain("Highlight");
  });
});
