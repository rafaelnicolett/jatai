import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fitness function do DS v2 (F4.2): componente só usa --jt-*. O mapeamento
 * para o tema do VS Code vive só no tokens.css gerado; cor, tipografia,
 * espaço e raio crus não voltam (D24). Varre todo CSS de `src/` (menos o
 * tokens.css) e as custom properties citadas em .ts/.tsx.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const TOKENS_CSS = path.join("design-system", "tokens", "tokens.css");

function files(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p, ext);
    return ext.test(e.name) ? [p] : [];
  });
}

const cssFiles = files(SRC, /\.css$/).filter((p) => !p.endsWith(TOKENS_CSS));
const codeFiles = files(SRC, /\.tsx?$/);

/** CSS sem comentários, com o número da linha de cada declaração problemática. */
function offenders(re: RegExp, sources: string[] = cssFiles): string[] {
  const out: string[] = [];
  for (const file of sources) {
    const text = fs.readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    text.split("\n").forEach((line, i) => {
      if (re.test(line)) out.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}

describe("fitness — componentes só usam tokens --jt-* (DS v2)", () => {
  it("nenhum CSS de componente lê var(--vscode-*): o mapeamento do tema vive só no tokens.css", () => {
    expect(offenders(/var\(--vscode-/)).toEqual([]);
    expect(offenders(/var\(--vscode-/, codeFiles)).toEqual([]);
  });

  it("nenhuma cor crua (hex, rgb/rgba, white/black) em CSS de componente", () => {
    expect(offenders(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|:\s*(white|black)\s*;/)).toEqual([]);
  });

  it("nenhum font-size cru: a escala é --jt-text-* (piso de 11px)", () => {
    expect(offenders(/font-size\s*:\s*[0-9.]+(px|rem|em)/)).toEqual([]);
  });

  it("nenhum px cru em padding, margin, gap ou raio (D24): a escala é --jt-space-* e --jt-radius-*", () => {
    expect(offenders(/(padding|margin|gap|border-radius)[a-z-]*\s*:[^;]*\b[1-9][0-9.]*px/)).toEqual([]);
  });

  it("toda custom property citada é --jt-* ou local ao próprio arquivo (ex.: --tile-accent)", () => {
    const bad: string[] = [];
    for (const file of [...cssFiles, ...codeFiles]) {
      const text = fs.readFileSync(file, "utf-8");
      const local = new Set([...text.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map((m) => m[1]));
      for (const m of text.matchAll(/var\((--[a-z][a-z0-9-]*)/g)) {
        const name = m[1];
        if (!name.startsWith("--jt-") && !local.has(name)) bad.push(`${path.relative(SRC, file)}: ${name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("todo --jt-* citado existe no tokens.css gerado", () => {
    const defined = new Set(
      [...fs.readFileSync(path.join(SRC, TOKENS_CSS), "utf-8").matchAll(/(--jt-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    const missing: string[] = [];
    for (const file of [...cssFiles, ...codeFiles]) {
      for (const m of fs.readFileSync(file, "utf-8").matchAll(/var\((--jt-[a-z0-9-]+)/g)) {
        if (!defined.has(m[1])) missing.push(`${path.relative(SRC, file)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
