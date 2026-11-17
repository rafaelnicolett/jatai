import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "@data";
import { JataiMark } from "../src/design-system/brand/JataiMark";
import { GLYPH_PATHS, WORDMARK_PATHS } from "../src/design-system/brand/brandArt";
import { accessibleName, cleanup, mount, source } from "./support/component";

/**
 * Símbolo da marca (ADR-0013, DS v2 §4.13): o glifo Guarda, com o mesmo
 * desenho dos arquivos de `media/`, e o nome lido do BRAND.
 */

afterEach(cleanup);

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function svgPaths(rel: string): string[] {
  const svg = fs.readFileSync(path.join(PKG, rel), "utf-8");
  return [...svg.matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1]);
}

describe("JataiMark", () => {
  it("o glifo é o mesmo desenho de media/jatai-icon.svg, e o wordmark o de media/brand/jatai-wordmark.svg", () => {
    expect(GLYPH_PATHS).toEqual(svgPaths("media/jatai-icon.svg"));
    expect(WORDMARK_PATHS).toEqual(svgPaths("media/brand/jatai-wordmark.svg"));
  });

  it("é uma imagem com o nome do BRAND (nunca um literal)", () => {
    const mark = mount(<JataiMark />).firstElementChild!;
    expect(mark.getAttribute("role")).toBe("img");
    expect(accessibleName(mark)).toBe(BRAND.displayName);
    expect(mark.querySelectorAll("svg")).toHaveLength(1);
  });

  it("decorativo: aria-hidden e sem papel, para quando o nome já está escrito ao lado", () => {
    const mark = mount(<JataiMark decorative />).firstElementChild!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.hasAttribute("role")).toBe(false);
  });

  it("com wordmark: glifo + wordmark em contorno (nenhuma fonte precisa ir no pacote)", () => {
    const svgs = mount(<JataiMark wordmark size={26} />).querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    expect(svgs[0].getAttribute("height")).toBe("26");
    expect(svgs[1].querySelectorAll("path")).toHaveLength(WORDMARK_PATHS.length);
  });

  it("glifo em --jt-mel, wordmark em --jt-fg; forced-colors em CanvasText; nenhum hex da marca antiga", () => {
    const css = source("design-system/brand/JataiMark.module.css");
    expect(css).toContain("var(--jt-mel)");
    expect(css).toContain("var(--jt-fg)");
    expect(css).toContain("CanvasText");
    expect(source("design-system/brand/JataiMark.tsx")).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
