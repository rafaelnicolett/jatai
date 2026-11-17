import { describe, it, expect, afterEach } from "vitest";
import { CatalogApp } from "../src/mock/catalog/CatalogApp";
import { applyCatalogTheme, VSCODE_THEME_VARS } from "../src/mock/catalog/catalogTheme";
import { accessibleName, cleanup, click, mount } from "./support/component";

/**
 * Catálogo vivo do DS v2 (documentação viva da F4.2): monta todos os
 * componentes e troca os sinais de tema que o tokens.css lê.
 */

function reset(): void {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-contrast");
  document.documentElement.removeAttribute("data-host");
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("style");
  document.body.className = "";
}

afterEach(() => {
  cleanup();
  reset();
});

describe("catalogTheme (sinais de tema)", () => {
  it("fora do VS Code: data-theme e data-contrast no <html>, sem data-host", () => {
    applyCatalogTheme(document, { theme: "hcLight", vscode: false, reduceMotion: false });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-contrast")).toBe("more");
    expect(document.documentElement.hasAttribute("data-host")).toBe(false);
  });

  it("como no VS Code: data-host, classes de tema no <body> (as duas no AC claro) e as --vscode-* do tema", () => {
    applyCatalogTheme(document, { theme: "hcLight", vscode: true, reduceMotion: true });
    expect(document.documentElement.getAttribute("data-host")).toBe("vscode");
    expect([...document.body.classList].sort()).toEqual(["vscode-high-contrast", "vscode-high-contrast-light"]);
    expect(document.documentElement.style.getPropertyValue("--vscode-contrastBorder")).toBe(VSCODE_THEME_VARS.hcLight["--vscode-contrastBorder"]);
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
  });

  it("trocar de volta limpa os sinais do tema anterior", () => {
    applyCatalogTheme(document, { theme: "dark", vscode: true, reduceMotion: false });
    applyCatalogTheme(document, { theme: "light", vscode: false, reduceMotion: false });
    expect(document.documentElement.hasAttribute("data-host")).toBe(false);
    expect(document.body.className).toBe("");
    expect(document.documentElement.style.getPropertyValue("--vscode-editor-background")).toBe("");
  });
});

describe("CatalogApp", () => {
  it("monta todas as seções do catálogo", () => {
    const c = mount(<CatalogApp />);
    const titles = [...c.querySelectorAll("h2")].map((h) => h.textContent);
    for (const t of ["Cor", "Tipografia", "Button", "ChoiceCard", "GateBadge", "EpicStop", "StatusColumn e TaskCard"]) {
      expect(titles.some((x) => x?.startsWith(t)), t).toBe(true);
    }
  });

  it("o botão de tema liga o alto contraste no documento", () => {
    const c = mount(<CatalogApp />);
    const hc = [...c.querySelectorAll("button")].find((b) => accessibleName(b) === "Alto contraste escuro")!;
    click(hc);
    expect(hc.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.getAttribute("data-contrast")).toBe("more");
  });
});
