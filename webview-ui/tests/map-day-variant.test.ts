import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Variante de dia da cena do Mapa (F5.3, questão aberta 1 do DS v2 §7).
 * Os valores vêm do tokens.json e o CSS é gerado; este teste confere o que
 * o gerador escreveu e calcula os contrastes no método da §6.1 (razão da
 * WCAG 2.x, truncada em duas casas, cores com transparência compostas sobre
 * o pior fundo que pode ficar atrás).
 */

const TOKENS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/design-system/tokens");
const json = JSON.parse(fs.readFileSync(path.join(TOKENS, "tokens.json"), "utf-8"));
const css = fs.readFileSync(path.join(TOKENS, "tokens.css"), "utf-8");
const scene = json.color.scene as Record<string, { css: string; value: string; day?: string }>;
const neutral = json.color.neutral;
const status = json.color.status;

type RGB = [number, number, number];

function parse(color: string): { rgb: RGB; alpha: number } {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const m = color.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (!m) throw new Error(`cor não reconhecida: ${color}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) };
}

function over(top: string, bottom: string): RGB {
  const { rgb: t, alpha } = parse(top);
  const { rgb: b } = parse(bottom);
  return [0, 1, 2].map((i) => Math.round(t[i]! * alpha + b[i]! * (1 - alpha))) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razão de contraste truncada em duas casas, para nunca arredondar uma falha para cima. */
function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const day = (key: string): string => {
  const v = scene[key]?.day;
  if (!v) throw new Error(`token de dia ausente: ${key}`);
  return v;
};
const solid = (c: string): RGB => parse(c).rgb;

/** Fundos que podem ficar atrás do HUD, do pior para o melhor: terra, grama, céu. */
const BEHIND = ["soilR", "soilL", "grass1", "grass0", "sky0", "sky2"].map((k) => (k.startsWith("soil") ? scene[k]!.value : day(k)));

describe("variante de dia da cena (tokens)", () => {
  const block = css.match(/@media \(forced-colors: none\) \{\s*\[data-scene\]\[data-scene-variant="day"\] \{([\s\S]*?)\n  \}\n\}/);

  it("o CSS gerado tem o bloco de dia dentro de forced-colors: none, com esquema de cor claro", () => {
    expect(block, "bloco [data-scene][data-scene-variant=\"day\"]").not.toBeNull();
    expect(block![1]).toContain("color-scheme: light;");
  });

  it("o bloco redeclara os neutros e os status do tema claro, para o HUD do dia ler como o tema claro", () => {
    expect(block![1]).toContain(`${neutral.fg.css}: ${neutral.fg.value.light};`);
    expect(block![1]).toContain(`${status.working.fg.css}: ${status.working.fg.value.light};`);
    expect(block![1]).toContain(`${neutral.surface.css}: ${neutral.surface.value.light};`);
  });

  it("só os tokens da cena que têm valor de dia são redeclarados; madeira, ipês e abelha ficam como no crepúsculo", () => {
    const declared = new Set([...block![1].matchAll(/(--jt-scene-[a-z0-9-]+):/g)].map((m) => m[1]));
    const withDay = Object.values(scene).filter((t) => t.day !== undefined).map((t) => t.css);
    expect([...declared].sort()).toEqual(withDay.sort());
    for (const keep of ["--jt-scene-wood-l", "--jt-scene-ipe-roxo", "--jt-scene-bee-body", "--jt-scene-soil-l"]) expect(declared.has(keep), keep).toBe(false);
  });

  it("o alto contraste e forced-colors não ganham a variante de dia (seu bloco só vale com forced-colors: none)", () => {
    const withoutBlock = css.replace(block![0], "");
    expect(withoutBlock).not.toContain('data-scene-variant="day"');
  });
});

describe("variante de dia da cena (contraste, DS v2 §6.1)", () => {
  const hud = day("hudBg");
  const pill = day("hudPill");

  it("texto sobre o HUD, o rótulo da ilha e o painel passa de 4,5:1 sobre o pior fundo possível", () => {
    const texts: Array<[string, string]> = [
      ["fg", neutral.fg.value.light],
      ["fg-2", neutral.fg2.value.light],
      ["fg-3", neutral.fg3.value.light],
      ...(["done", "working", "you", "queue", "blocked", "future"] as const).map((s): [string, string] => [`status ${s}`, status[s].fg.value.light]),
    ];
    for (const behind of BEHIND) {
      for (const [surface, name] of [[hud, "HUD"], [pill, "rótulo"]] as const) {
        const bg = over(surface, behind);
        for (const [label, color] of texts) expect(ratio(solid(color), bg), `${label} sobre ${name} (atrás ${behind})`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const [label, color] of [["fg", neutral.fg.value.light], ["fg-3", neutral.fg3.value.light]] as const) {
      expect(ratio(solid(color), solid(day("panel"))), `${label} sobre o painel`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o foco de duas cores e a seleção da ilha passam de 3:1 sobre a grama e sobre o halo (WCAG 1.4.11)", () => {
    const focus = solid(neutral.focus.value.light);
    const select = solid(day("select"));
    const halo = over(day("halo"), day("grass1"));
    for (const grass of [day("grass0"), day("grass1")]) {
      expect(ratio(focus, solid(grass)), "foco × grama").toBeGreaterThanOrEqual(3);
      expect(ratio(select, solid(grass)), "seleção × grama").toBeGreaterThanOrEqual(3);
    }
    expect(ratio(focus, halo), "foco × halo").toBeGreaterThanOrEqual(3);
    expect(ratio(select, halo), "seleção × halo").toBeGreaterThanOrEqual(3);
  });

  it("a borda do rótulo da ilha atual (mel) e o contorno do favo vazio aparecem sobre a grama", () => {
    const melLine = solid(json.color.brand.melLine.value.light);
    expect(ratio(melLine, over(pill, day("grass1")))).toBeGreaterThanOrEqual(3);
    const empty = over(day("combEmpty"), day("grass1"));
    expect(ratio(empty, solid(day("grass1")))).toBeGreaterThanOrEqual(3);
  });
});
