#!/usr/bin/env node
/**
 * brand-assets.mjs: gera os PNGs e a fonte de ícones a partir dos SVGs-fonte (F1.1)
 *
 * Os SVGs de `media/` são a fonte da identidade visual. Nenhum PNG e nenhuma
 * fonte são feitos à mão: saem daqui, sempre do mesmo jeito. Com a marca do
 * `src/data/brand.json` (`<name>` = jatai):
 *
 *   media/brand/<name>-guarda.svg  → media/brand/<name>-guarda-512.png
 *                                  → media/brand/<name>-guarda-256.png
 *                                  → <assets.icon>, 128 × 128: o ícone do Marketplace
 *                                    (PNG, porque o vsce recusa SVG no `icon`)
 *   media/fonts/<name>-mark.svg    → <assets.iconFont>: glifo `<name>-mark` em U+E900,
 *                                    o `$(<name>-mark)` da status bar
 *
 * O glifo da activity bar e das views (`assets.activityBarIcon`) já é SVG e vai
 * direto. O wordmark e a versão horizontal também são só SVG.
 *
 * Uso:
 *   node scripts/brand-assets.mjs           gera e sobrescreve os derivados
 *   node scripts/brand-assets.mjs --check   gera numa pasta temporária e compara
 *                                           byte a byte com os arquivos versionados
 *
 * Requisitos, fora do npm de propósito (nada disto roda no build nem no CI):
 *   - `rsvg-convert` (librsvg): `brew install librsvg` ou `apt install librsvg2-bin`;
 *   - Python 3 com fontTools: `pip install fonttools`. Outro interpretador: PYTHON=<caminho>.
 * Outra versão do librsvg ou do fontTools pode mudar bytes sem mudar o desenho;
 * nesse caso o --check aponta o arquivo.
 *
 * Fork com outra marca: troque os SVGs-fonte, ajuste `name` e `assets` no
 * brand.json e rode este script (veja docs/identidade-visual.md).
 *
 * Saída: exit 0 = gerado (ou, com --check, igual ao versionado); 1 = ferramenta
 * ausente, falha ao gerar ou diferença no --check; 2 = uso errado.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "src", "data", "brand.json"), "utf8"));

const SYMBOL_SVG = `media/brand/${brand.name}-guarda.svg`;
const MARK_SVG = `media/fonts/${brand.name}-mark.svg`;
const MARK_CODEPOINT = "E900";
/** Nome interno da fonte, em ASCII: "Jataí" vira "Jatai Icons". */
const FONT_FAMILY = `${brand.displayName.normalize("NFKD").replace(/\p{M}/gu, "")} Icons`;

/** Derivados: [arquivo relativo ao pacote, fonte, como gerar]. */
const TARGETS = [
  ...[512, 256].map((size) => [`media/brand/${brand.name}-guarda-${size}.png`, SYMBOL_SVG, { png: size }]),
  [brand.assets.icon, SYMBOL_SVG, { png: 128 }],
  [brand.assets.iconFont, MARK_SVG, { font: `${brand.name}-mark` }],
];

const args = process.argv.slice(2);
const check = args.includes("--check");
if (args.some((a) => a !== "--check")) {
  console.error("uso: node scripts/brand-assets.mjs [--check]");
  process.exit(2);
}

const PYTHON = process.env.PYTHON || "python3";

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: PKG_ROOT, encoding: "utf8" });
  if (r.error) return { ok: false, out: r.error.message };
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

function requireTools() {
  const missing = [];
  if (!run("rsvg-convert", ["--version"]).ok) missing.push("rsvg-convert (librsvg)");
  if (!run(PYTHON, ["-c", "import fontTools"]).ok) missing.push(`fontTools no ${PYTHON} (pip install fonttools)`);
  if (missing.length > 0) {
    console.error(`brand-assets: falta ${missing.join(" e ")}. Veja o cabeçalho do script.`);
    process.exit(1);
  }
}

function generate(rel, source, how, outRoot) {
  const out = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = how.png
    ? run("rsvg-convert", ["--width", String(how.png), "--height", String(how.png), "--format", "png", "--output", out, source])
    : run(PYTHON, ["scripts/brand-icon-font.py", source, out, how.font, MARK_CODEPOINT, FONT_FAMILY]);
  if (!r.ok) {
    console.error(`brand-assets: falhou ao gerar ${rel} de ${source}\n${r.out}`);
    process.exit(1);
  }
}

requireTools();
for (const [, source] of TARGETS) {
  if (!fs.existsSync(path.join(PKG_ROOT, source))) {
    console.error(`brand-assets: SVG-fonte não encontrado: ${source}`);
    process.exit(1);
  }
}

const outRoot = check ? fs.mkdtempSync(path.join(os.tmpdir(), "brand-assets-")) : PKG_ROOT;
const differ = [];
for (const [rel, source, how] of TARGETS) {
  generate(rel, source, how, outRoot);
  const bytes = fs.statSync(path.join(outRoot, rel)).size;
  let note = "";
  if (check) {
    const committed = path.join(PKG_ROOT, rel);
    const same = fs.existsSync(committed) && fs.readFileSync(committed).equals(fs.readFileSync(path.join(outRoot, rel)));
    if (!same) differ.push(rel);
    note = same ? " · igual" : " · DIFERENTE do versionado";
  }
  console.log(`  ${rel} ← ${source} (${bytes} bytes)${note}`);
}
if (check) fs.rmSync(outRoot, { recursive: true, force: true });

if (differ.length > 0) {
  console.log(`resumo: ${differ.length} derivado(s) diferente(s) dos SVGs-fonte; rode node scripts/brand-assets.mjs`);
  process.exit(1);
}
console.log(`resumo: ${TARGETS.length} derivados ${check ? "iguais aos versionados" : "gerados"}`);
