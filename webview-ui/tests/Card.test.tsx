import { describe, it, expect, afterEach } from "vitest";
import { Card } from "../src/design-system/primitives/Card/Card";
import { accessibleName, cleanup, mount, rulesMatching, source } from "./support/component";

/** Panel (Card) do DS v2 (§4.13, D23). */

afterEach(cleanup);

const css = source("design-system/primitives/Card/Card.module.css");

describe("Card v2 (Panel)", () => {
  it("é um <div> por padrão e repassa atributos (data-*, aria-*)", () => {
    const card = mount(<Card data-x="1" aria-label="Fatos">conteúdo</Card>).firstElementChild!;
    expect(card.tagName).toBe("DIV");
    expect(card.getAttribute("data-x")).toBe("1");
    expect(accessibleName(card)).toBe("Fatos");
  });

  it("vira região semântica com `as` (section com título ligado por aria-labelledby)", () => {
    const c = mount(
      <Card as="section" aria-labelledby="t">
        <h2 id="t">Gates</h2>
      </Card>,
    );
    const section = c.querySelector("section")!;
    expect(section).not.toBeNull();
    expect(accessibleName(section)).toBe("Gates");
  });

  it("raised acrescenta a classe de elevação; o padrão não tem sombra", () => {
    const plain = mount(<Card>a</Card>).firstElementChild!;
    const raised = mount(<Card raised>b</Card>).firstElementChild!;
    expect(raised.className).not.toBe(plain.className);
    expect(rulesMatching(css, ".card--raised")).toContain("var(--jt-elevation-2)");
    expect(rulesMatching(css, ".card ")).toContain("var(--jt-elevation-1)");
  });

  it("anatomia da §4.13: surface, borda line, raio 16 e padding 16", () => {
    const body = rulesMatching(css, ".card ");
    expect(body).toContain("var(--jt-surface)");
    expect(body).toContain("var(--jt-line)");
    expect(body).toContain("var(--jt-radius-xl)");
    expect(body).toContain("var(--jt-space-4)");
  });

  it("forced-colors: a borda continua visível (CanvasText)", () => {
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("CanvasText");
  });
});
