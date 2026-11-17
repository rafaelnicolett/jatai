import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import axe from "axe-core";
import { ShellRoot } from "../src/apps/cockpit/ShellRoot";
import { cockpitStore } from "../src/store/CockpitStore";
import { modernizationSnapshot } from "./support/cockpitFixtures";
import { cleanup, click, mount } from "./support/component";
import { bootFor, loadSchemas, mountWizard } from "./support/wizardScripts";
import { installBrowserStubs, type BrowserStubs } from "./support/mapDom";

/**
 * F4.4 — axe sem nenhuma violação `critical`/`serious` nos dois temas.
 *
 * O jsdom não calcula layout nem cor de verdade, então `color-contrast` fica
 * desligado aqui: o contraste é medido por cálculo nos testes do design system
 * (`tokens`/`contraste`). O resto das regras de ARIA, estrutura, nome
 * acessível, rótulo e ordem de foco roda de verdade sobre o DOM que a pessoa
 * vê. As regras de página inteira (título, idioma, landmark principal) também
 * saem: o webview é um fragmento dentro do VS Code, que já tem os seus.
 */

const PAGE_RULES = {
  "color-contrast": { enabled: false },
  "document-title": { enabled: false },
  "html-has-lang": { enabled: false },
  "landmark-one-main": { enabled: false },
  "page-has-heading-one": { enabled: false },
  bypass: { enabled: false },
  region: { enabled: false },
};

async function seriousViolations(): Promise<string[]> {
  const results = await axe.run(document.body, { rules: PAGE_RULES });
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(" · ")}`
    );
}

/** O webview lê o tema de `data-theme` e `data-contrast` (tokens.css). */
function theme(name: "dark" | "light"): void {
  document.documentElement.setAttribute("data-theme", name);
  document.documentElement.removeAttribute("data-contrast");
}

let seq = 0;
function deliver(snapshot: ReturnType<typeof modernizationSnapshot>): void {
  act(() =>
    cockpitStore.handleMessage({
      type: "shell/snapshot",
      seq: ++seq,
      generatedAt: new Date().toISOString(),
      payload: snapshot,
    })
  );
}

const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function clickableWith(root: ParentNode, label: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>("button, [role='tab'], [role='option'], a")].find((el) =>
    text(el).startsWith(label)
  );
}

let wizard: { dispose(): void } | null = null;
let stubs: BrowserStubs | null = null;

beforeEach(() => {
  seq = 0;
  loadSchemas();
  stubs = installBrowserStubs();
  stubs.resize(1440, 900);
});
afterEach(() => {
  wizard?.dispose();
  wizard = null;
  stubs?.restore();
  stubs = null;
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-contrast");
  vi.restoreAllMocks();
});

describe("axe — Cockpit", () => {
  for (const name of ["dark", "light"] as const) {
    it(`a tela "Agora" não tem violação critical/serious no tema ${name}`, async () => {
      theme(name);
      deliver(modernizationSnapshot());
      mount(<ShellRoot />);
      expect(await seriousViolations()).toEqual([]);
    });

    it(`o mapa da colmeia não tem violação critical/serious no tema ${name}`, async () => {
      theme(name);
      deliver(modernizationSnapshot());
      const container = mount(<ShellRoot />);
      click(clickableWith(container, "Mapa"));
      expect(container.querySelector("section[aria-label='Mapa da colmeia']")).not.toBeNull();
      expect(await seriousViolations()).toEqual([]);
    });
  }
});

describe("axe — Wizard", () => {
  for (const name of ["dark", "light"] as const) {
    it(`a primeira tela do Wizard não tem violação critical/serious no tema ${name}`, async () => {
      theme(name);
      wizard = mountWizard(bootFor(false));
      expect(await seriousViolations()).toEqual([]);
    });
  }
});
