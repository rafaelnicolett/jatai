import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokensCss, readTokens, TOKENS_CSS } from "../scripts/build-tokens.mjs";
import { markVsCodeHost } from "../src/design-system/tokens/host";

/**
 * Tokens do design system v2 (F4.2): `tokens.json` é a fonte, `tokens.css` é
 * gerado por `scripts/build-tokens.mjs`. Estes testes garantem que ninguém
 * edita o CSS à mão (ou esquece de regerar) e fixam as regras do DS v2 que
 * cabem num teste: quatro temas por cor, fallback em toda variável do VS
 * Code, piso de 11px e nenhuma fonte embutida.
 */

const tokens = readTokens();
const css = buildTokensCss(tokens);

interface Token {
  css: string;
  value: unknown;
}

function colorTokens(node: unknown): Token[] {
  if (!node || typeof node !== "object") return [];
  const t = node as Record<string, unknown>;
  if (typeof t.css === "string" && "value" in t) return [t as unknown as Token];
  return Object.values(t).flatMap(colorTokens);
}

describe("tokens do DS v2 (tokens.json → tokens.css)", () => {
  it("o tokens.css gravado é exatamente o que o gerador produz (rode `npm run tokens` depois de mudar o JSON)", () => {
    expect(fs.readFileSync(TOKENS_CSS, "utf-8")).toBe(css);
  });

  it("toda cor de marca, neutro, status e feedback tem valor nos quatro temas (escuro, claro, AC escuro, AC claro)", () => {
    const groups = [tokens.color.brand, tokens.color.neutral, tokens.color.status, tokens.color.feedback];
    const themed = groups.flatMap(colorTokens).filter((t) => typeof t.value === "object");
    expect(themed.length).toBeGreaterThan(40);
    for (const t of themed) {
      expect(Object.keys(t.value as object).sort(), t.css).toEqual(["dark", "hcDark", "hcLight", "light"]);
    }
  });

  it("toda var(--vscode-*) do CSS gerado tem fallback: fora do VS Code, ou se uma variável faltar, a cor nunca some", () => {
    const semFallback = css.match(/var\(--vscode-[A-Za-z0-9-]+\)/g) ?? [];
    expect(semFallback).toEqual([]);
  });

  it("os neutros seguem o tema do VS Code só dentro de html[data-host=\"vscode\"]; fora dele, valem os neutros dos protótipos", () => {
    const root = css.split("/* ---------- 3.")[0];
    expect(root).toContain("--jt-bg: #14100A;");
    expect(root).not.toMatch(/--jt-bg: var\(--vscode/);
    expect(css).toContain('html[data-host="vscode"] body {');
    expect(css).toContain("--jt-bg: var(--vscode-editor-background, #14100A);");
    expect(css).toContain("--jt-line: var(--vscode-contrastBorder, #F6EEDC);");
  });

  it("piso de 11px: nenhum tamanho de texto da escala fica abaixo", () => {
    const sizes = [...css.matchAll(/--jt-text-[a-z0-9]+: (\d+(?:\.\d+)?)px;/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(8);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  it("nenhuma fonte embutida: o webview usa a fonte de interface e a de código do VS Code (decisão de 2026-11-16)", () => {
    expect(css).not.toContain("@font-face");
    expect(css).not.toMatch(/Gabarito|Hanken|JetBrains/);
    expect(css).toContain("--jt-font-body: var(--vscode-font-family, system-ui)");
    expect(css).toContain("--jt-font-mono: var(--vscode-editor-font-family, ui-monospace)");
  });

  it("movimento reduzido zera repetições, voo e deslocamento (prefers-reduced-motion, vscode-reduce-motion e data-motion)", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("body.vscode-reduce-motion");
    for (const name of ["--jt-iterations-burst", "--jt-iterations-ambient", "--jt-iterations-light-up"]) {
      expect(css).toContain(`${name}: 0;`);
    }
    expect(css).toContain("--jt-motion-distance-sm: 0px;");
  });

  it("forced-colors aponta os tokens para as cores do sistema (status continua por glifo e texto)", () => {
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(fc).toContain("--jt-focus: Highlight;");
    expect(fc).toContain("--jt-status-working-line: CanvasText;");
    expect(fc).toContain("--jt-fg: CanvasText;");
  });
});

describe("host do webview (data-host)", () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
  function source(rel: string): string {
    return fs.readFileSync(path.join(SRC, rel), "utf-8");
  }

  it("markVsCodeHost põe data-host=\"vscode\" no <html>, o sinal que liga o bloco do VS Code no tokens.css", () => {
    const doc = document.implementation.createHTMLDocument("t");
    expect(doc.documentElement.hasAttribute("data-host")).toBe(false);
    markVsCodeHost(doc);
    expect(doc.documentElement.getAttribute("data-host")).toBe("vscode");
  });

  it("só as entradas de produção (Cockpit e Wizard) marcam o host; o mock fica com os neutros dos protótipos", () => {
    expect(source("main.tsx")).toContain("markVsCodeHost();");
    expect(source("apps/wizard/main.tsx")).toContain("markVsCodeHost();");
    expect(source("mock-main.tsx")).not.toContain("markVsCodeHost");
  });

  it("o index.css (Cockpit e Wizard) importa o tokens.css gerado", () => {
    expect(source("index.css")).toContain('@import "./design-system/tokens/tokens.css";');
  });
});
