import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Apoio dos testes de componente do DS v2 (F4.2). Mesmo jeito do
 * `PhaseBoard.test.tsx` e da caracterização do Cockpit: `react-dom/client` +
 * `act`, sem biblioteca de teste nova. Não é fixture de dado: são as
 * consultas de acessibilidade (papel, nome acessível) e a leitura do CSS
 * Module para as regras que o jsdom não calcula (foco visível,
 * forced-colors, movimento reduzido).
 */

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

export function mount(ui: ReactElement): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  mounted.push({ root, container });
  return container;
}

export function rerender(container: HTMLElement, ui: ReactElement): void {
  const entry = mounted.find((m) => m.container === container);
  if (!entry) throw new Error("container não montado por mount()");
  act(() => entry.root.render(ui));
}

/** Desmonta tudo o que `mount` montou (chame no afterEach). */
export function cleanup(): void {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
}

export function click(el: Element | null | undefined): void {
  if (!el) throw new Error("elemento não encontrado para o clique");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export function key(el: Element | null | undefined, k: string): void {
  if (!el) throw new Error("elemento não encontrado para a tecla");
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}

function textOf(node: Node, root: Element): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  if (node.getAttribute("aria-hidden") === "true") return "";
  if (node !== root) {
    const label = node.getAttribute("aria-label");
    if (label) return ` ${label} `;
  }
  return [...node.childNodes].map((c) => textOf(c, root)).join("");
}

/**
 * Nome acessível, no recorte que os componentes usam: aria-labelledby,
 * aria-label e o texto dos filhos (pulando o que é aria-hidden).
 */
export function accessibleName(el: Element): string {
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    return labelledby
      .split(/\s+/)
      .map((id) => {
        const ref = el.ownerDocument.getElementById(id);
        return ref ? textOf(ref, ref) : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const label = el.getAttribute("aria-label");
  if (label) return label.trim();
  return textOf(el, el).replace(/\s+/g, " ").trim();
}

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

/** Fonte de um arquivo de `src/` (para conferir regras de CSS que o jsdom não aplica). */
export function source(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf-8");
}

/** Corpo de cada regra cujo seletor contém `needle` (sem comentários), concatenado. */
export function rulesMatching(css: string, needle: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of clean.matchAll(re)) {
    if (m[1].includes(needle)) out.push(m[2].trim());
  }
  return out.join("\n");
}
