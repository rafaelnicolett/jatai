import { describe, it, expect, afterEach, vi } from "vitest";
import { X } from "lucide-react";
import { Button, type ButtonVariant } from "../src/design-system/primitives/Button/Button";
import { accessibleName, cleanup, click, mount, rulesMatching, source } from "./support/component";

/**
 * Button do DS v2 (§4.9, D22): 8 variantes, 4 tamanhos, estados de
 * alternância, desabilitado focável e carregando. Acessibilidade: botão
 * nativo `type="button"`, nome acessível, foco visível e forced-colors.
 */

afterEach(cleanup);

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "tertiary", "accent", "you", "icon", "command", "danger"];
const css = source("design-system/primitives/Button/Button.module.css");

function button(c: HTMLElement): HTMLButtonElement {
  return c.querySelector("button")!;
}

describe("Button v2 — papel, nome e variantes", () => {
  it("é um <button type=\"button\"> nativo com o rótulo como nome acessível", () => {
    const b = button(mount(<Button>Decidir</Button>));
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
    expect(accessibleName(b)).toBe("Decidir");
  });

  it("as 8 variantes e os 4 tamanhos da §4.9 viram classes distintas", () => {
    const classes = VARIANTS.map((v) => button(mount(<Button variant={v}>x</Button>)).className);
    expect(new Set(classes).size).toBe(8);
    for (const v of VARIANTS) expect(rulesMatching(css, `.btn--${v}`), v).not.toBe("");
    for (const size of ["sm", "md", "lg", "xl"]) expect(rulesMatching(css, `.btn--${size}`), size).toContain("--jt-size-control-");
  });

  it("variante icon: só o ícone na tela, nome pelo aria-label", () => {
    const b = button(mount(<Button variant="icon" aria-label="Fechar"><X aria-hidden="true" /></Button>));
    expect(accessibleName(b)).toBe("Fechar");
  });

  it("variante command mostra o atalho num <kbd>", () => {
    const b = button(mount(<Button variant="command" kbd="⌘K" aria-label="Buscar e comandos" />));
    expect(b.querySelector("kbd")?.textContent).toBe("⌘K");
    expect(accessibleName(b)).toBe("Buscar e comandos");
  });
});

describe("Button v2 — estados", () => {
  it("alternância: pressed vira aria-pressed; sem a prop, o atributo não aparece", () => {
    expect(button(mount(<Button pressed>Pausar</Button>)).getAttribute("aria-pressed")).toBe("true");
    expect(button(mount(<Button pressed={false}>Pausar</Button>)).getAttribute("aria-pressed")).toBe("false");
    expect(button(mount(<Button>Pausar</Button>)).hasAttribute("aria-pressed")).toBe(false);
    expect(rulesMatching(css, '.btn[aria-pressed="true"]')).toContain("var(--jt-selected)");
  });

  it("disabledReason: aria-disabled, continua focável, motivo na dica e o clique não chega", () => {
    const onClick = vi.fn();
    const b = button(mount(<Button disabledReason="Configure o projeto primeiro" onClick={onClick}>Mapa</Button>));
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.disabled).toBe(false);
    expect(b.tabIndex).toBe(0);
    expect(b.getAttribute("title")).toBe("Configure o projeto primeiro");
    click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled nativo continua funcionando (o Wizard depende dele)", () => {
    const b = button(mount(<Button disabled>Continuar</Button>));
    expect(b.disabled).toBe(true);
  });

  it("carregando: aria-busy, glifo aria-hidden, rótulo de carregamento e o clique não chega", () => {
    const onClick = vi.fn();
    const b = button(mount(<Button loading loadingLabel="Registrando…" onClick={onClick}>Sou o titular</Button>));
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(accessibleName(b)).toBe("Registrando…");
    click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("o clique chega quando o botão está ativo", () => {
    const onClick = vi.fn();
    click(button(mount(<Button onClick={onClick}>Decidir</Button>)));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Button v2 — CSS: foco, hover, desabilitado, movimento e forced-colors", () => {
  it("foco visível: contorno de 3px (--jt-focus) afastado 2px", () => {
    const focus = rulesMatching(css, ".btn:focus-visible");
    expect(focus).toContain("var(--jt-size-focus-width) solid var(--jt-focus)");
    expect(focus).toContain("var(--jt-size-focus-offset)");
  });

  it("hover só com ponteiro que paira; desabilitado sem opacidade (texto fg-3, ≥ 4,5:1)", () => {
    expect(css).toContain("@media (hover: hover)");
    expect(rulesMatching(css, '.btn[aria-disabled="true"]')).toContain("var(--jt-fg-3)");
    expect(css).not.toMatch(/opacity:\s*0\.\d/);
  });

  it("o glifo de carregamento para com movimento reduzido", () => {
    expect(rulesMatching(css, ".spinner")).toContain("var(--jt-iterations-ambient)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("forced-colors: borda de botão do sistema e foco em Highlight", () => {
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(fc).toContain("ButtonText");
    expect(fc).toContain("Highlight");
  });

  it("forced-colors: o botão primário (preenchido) fica fora do ajuste, ou o rótulo some atrás do Canvas", () => {
    // Com o ajuste ligado, o Chromium pinta um Canvas atrás do texto e o ButtonFace do token vira um retângulo preto.
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(rulesMatching(fc, ".btn--primary")).toContain("forced-color-adjust: none");
    expect(rulesMatching(css, ".btn--primary")).toContain("var(--jt-fg-on-mel)");
  });
});
