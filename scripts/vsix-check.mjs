#!/usr/bin/env node
/**
 * vsix-check.mjs: empacota o .vsix numa pasta temporária e confere o conteúdo (F0.3)
 *
 * Uso: node scripts/vsix-check.mjs --out <pasta>
 *   1. roda `vsce package --no-dependencies` com saída em <pasta>, que é criada
 *      se não existir. O build (`npm run build`) tem de ter rodado antes;
 *   2. abre o .vsix gerado e confere, contra a árvore em disco:
 *      - o kit vai inteiro: todo arquivo das edições materializadas em
 *        dist/kit/ (ADR-0018: saem de kit/ no build, fora do git), tirando o
 *        que o .vscodeignore exclui (*.map, *.bak, .DS_Store, *.tsbuildinfo).
 *        Faltar arquivo de kit foi o BUG-03 do 0.9.10;
 *      - dist/ leva só o que o build atual produz. O 0.9.10 levava ~300 saídas
 *        antigas de `tsc` e os .map;
 *      - os arquivos que o package.json referencia (`main`, `icon`, ícones
 *        contribuídos) estão no pacote;
 *      - fora isso, só package.json, media/ e documentos de raiz (README,
 *        CHANGELOG, LICENSE, THIRD_PARTY_NOTICES). Qualquer outra coisa, como
 *        src/, tests/, scripts/, webview-ui/, .github/ ou um arquivo novo solto
 *        na raiz, reprova.
 *
 * Desde a F2.4 o package.json tem `repository` e o repo tem LICENSE, então o
 * vsce roda sem `--allow-missing-repository` nem `--skip-license`: se um dos
 * dois sumir, o empacotamento falha.
 *
 * Saída: exit 0 = pacote ok; 1 = o vsce falhou ou o conteúdo está errado;
 * 2 = uso errado.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VSCE_BIN = path.join(PKG_ROOT, "node_modules", "@vscode", "vsce", "vsce");

const KIT_DIRS = ["dist/kit/templates", "dist/kit/brownfield-templates"];
/** O que o .vscodeignore tira de qualquer pasta, inclusive do kit. */
const NEVER_PACKAGED = [/\.map$/, /\.bak$/, /\.tsbuildinfo$/, /(^|\/)\.DS_Store$/];
/**
 * Orçamento de bundle (F4.4): medido no .vsix de 2026-11-16, com ~15% de
 * folga para não transformar qualquer feature em falha de CI. As fontes não
 * entram: a decisão de 2026-11-16 (tokens.json) manda o webview usar as
 * fontes do editor, e só o wordmark (SVG de contorno) carrega a da marca.
 */
const BUDGET_KB = {
  "dist/extension.js": 1638, // medido 1.306 KB
  "dist/webview/main.js": 480, // medido 400 KB
  "dist/webview/wizard.js": 320, // medido 248 KB
  "dist/webview/assets/index.css": 144, // medido 120 KB
  "dist/webview/assets/wizard.css": 80, // medido 60 KB
  "dist/kit/templates/scripts/jatai-state.cjs": 768, // medido 607 KB
  "dist/kit/templates/scripts/jatai-mcp.cjs": 1331, // medido 1.082 KB
};
/** O webview inteiro (JS + CSS + HTML) num teto só. */
const BUDGET_WEBVIEW_KB = 1024; // medido 832 KB
/** Saídas do build atual que vão no pacote (allowlist do .vscodeignore). */
const DIST_EXPECTED = [
  "dist/extension.js",
  "dist/webview/assets/index.css",
  "dist/webview/index.html",
  "dist/webview/main.js",
  // Wizard em React (F3.10, ADR-0019): build próprio, webview-ui/vite.config.wizard.ts.
  "dist/webview/assets/wizard.css",
  "dist/webview/wizard.js",
];
/** Documentos de raiz que o vsce empacota (ele renomeia alguns, ex.: readme.md). */
const ROOT_DOCS = /^(readme|changelog|license|third_party_notices)(\.(md|txt))?$/i;
/** Tipos publicáveis da API de extensão (F2.5): acompanham o .vsix para quem integra. */
const ROOT_API = ["api/index.d.ts"];
/** Entradas do zip fora de extension/, geradas pelo próprio vsce. */
const VSIX_META = new Set(["extension.vsixmanifest", "[Content_Types].xml"]);

const outIndex = process.argv.indexOf("--out");
const outDir = outIndex > -1 ? process.argv[outIndex + 1] : undefined;
if (!outDir) {
  console.error("uso: node scripts/vsix-check.mjs --out <pasta>");
  process.exit(2);
}
if (!fs.existsSync(VSCE_BIN)) {
  console.error("vsix-check: @vscode/vsce não está em node_modules. Rode `npm ci` antes.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const vsixPath = path.join(path.resolve(outDir), `${manifest.name}-${manifest.version}.vsix`);

// stdout em pipe: sem terminal, o vsce nunca para numa pergunta.
const pack = spawnSync(
  process.execPath,
  [VSCE_BIN, "package", "--no-dependencies", "--out", vsixPath],
  { cwd: PKG_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
);
process.stdout.write(pack.stdout || "");
process.stderr.write(pack.stderr || "");
if (pack.error || pack.status !== 0) {
  console.error(`vsix-check: vsce package falhou (${pack.error ? pack.error.message : `código ${pack.status}`}).`);
  process.exit(1);
}

const JSZip = require("jszip");
const zip = await JSZip.loadAsync(fs.readFileSync(vsixPath));
const zipEntries = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

const problems = [];
const packaged = [];
for (const name of zipEntries) {
  if (name.startsWith("extension/")) packaged.push(name.slice("extension/".length));
  else if (!VSIX_META.has(name)) problems.push(`entrada inesperada fora de extension/: ${name}`);
}

const kitPackaged = new Set();
const distPackaged = new Set();
let media = 0;
let rootDocs = 0;
let rootApi = 0;
for (const rel of packaged) {
  if (NEVER_PACKAGED.some((re) => re.test(rel))) {
    problems.push(`não devia ir no pacote: ${rel}`);
    continue;
  }
  const top = rel.split("/")[0];
  if (rel === "package.json") continue;
  if (!rel.includes("/") && ROOT_DOCS.test(rel)) rootDocs++;
  else if (ROOT_API.includes(rel)) rootApi++;
  else if (top === "media") media++;
  else if (KIT_DIRS.some((dir) => rel.startsWith(`${dir}/`))) kitPackaged.add(rel);
  else if (top === "dist") {
    distPackaged.add(rel);
    if (!DIST_EXPECTED.includes(rel)) problems.push(`dist/ fora da allowlist: ${rel}`);
  } else problems.push(`arquivo inesperado no pacote: ${rel}`);
}

for (const rel of ROOT_API) {
  if (!packaged.includes(rel)) problems.push(`faltou no pacote: ${rel} (os tipos publicáveis da API)`);
}

for (const rel of DIST_EXPECTED) {
  if (!distPackaged.has(rel)) problems.push(`faltou no pacote: ${rel} (o build rodou?)`);
}

// Orçamento de bundle (F4.4): o .vsix é o que a pessoa baixa. A falta de um
// arquivo já é reportada acima; aqui só se mede o que existe.
const overBudget = [];
const measured = new Map();
for (const [rel, budgetKb] of Object.entries(BUDGET_KB)) {
  const entry = zip.file(`extension/${rel}`);
  if (!entry) continue;
  const kb = (await entry.async("nodebuffer")).length / 1024;
  measured.set(rel, kb);
  if (kb > budgetKb) overBudget.push(`${rel}: ${kb.toFixed(0)} KB (teto ${budgetKb} KB)`);
}
let webviewKb = 0;
for (const entry of zipEntries) {
  if (!entry.startsWith("extension/dist/webview/")) continue;
  webviewKb += (await zip.file(entry).async("nodebuffer")).length / 1024;
}
if (webviewKb > BUDGET_WEBVIEW_KB) overBudget.push(`dist/webview/: ${webviewKb.toFixed(0)} KB (teto ${BUDGET_WEBVIEW_KB} KB)`);
for (const budgetProblem of overBudget) problems.push(`orçamento de bundle estourado: ${budgetProblem}`);

/** Arquivos do kit em disco, com "/" e relativos à raiz, sem o que o .vscodeignore exclui. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(PKG_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (!NEVER_PACKAGED.some((re) => re.test(rel))) out.push(rel);
  }
  return out;
}
const kitOnDisk = KIT_DIRS.flatMap((dir) => (fs.existsSync(path.join(PKG_ROOT, dir)) ? walk(dir) : []));
if (kitOnDisk.length === 0) problems.push("dist/kit/ vazio: o build (scripts/copy-templates.js) materializa o kit antes do pacote");
const missingKit = kitOnDisk.filter((rel) => !kitPackaged.has(rel));
const extraKit = [...kitPackaged].filter((rel) => !kitOnDisk.includes(rel));
for (const rel of missingKit) problems.push(`arquivo do kit fora do pacote: ${rel}`);
for (const rel of extraKit) problems.push(`arquivo de kit no pacote que não existe em disco: ${rel}`);

const referenced = [manifest.main, manifest.icon];
for (const icon of Object.values(manifest.contributes?.icons ?? {})) referenced.push(icon?.default?.fontPath);
for (const containers of Object.values(manifest.contributes?.viewsContainers ?? {})) {
  for (const c of containers) if (typeof c.icon === "string" && !c.icon.startsWith("$(")) referenced.push(c.icon);
}
for (const ref of referenced.filter(Boolean)) {
  const rel = ref.replace(/^\.\//, "");
  if (!packaged.includes(rel)) problems.push(`o package.json referencia ${rel}, que não está no pacote`);
}

const countKit = (dir) => [...kitPackaged].filter((rel) => rel.startsWith(`${dir}/`)).length;
const size = fs.statSync(vsixPath).size;
console.log(
  `vsix-check: ${path.basename(vsixPath)}: ${zipEntries.length} entradas, ${(size / 1024 / 1024).toFixed(2)} MB\n` +
    `  kit: ${KIT_DIRS.map((d) => `${d.replace("dist/kit/", "")}/ ${countKit(d)}`).join(" + ")} = ${kitPackaged.size} (em disco: ${kitOnDisk.length})\n` +
    `  dist/: ${distPackaged.size} (esperados: ${DIST_EXPECTED.length}) · media/: ${media} · api/: ${rootApi} · documentos de raiz: ${rootDocs} · package.json\n` +
    `  orçamento: ${measured.size}/${Object.keys(BUDGET_KB).length} arquivo(s) medido(s), webview ${webviewKb.toFixed(0)}/${BUDGET_WEBVIEW_KB} KB, ${overBudget.length} acima do teto`,
);
for (const p of problems) console.log(`  ✖ ${p}`);

if (problems.length > 0) {
  console.log(`resumo: ${problems.length} problema(s) no conteúdo do .vsix`);
  process.exit(1);
}
console.log(`resumo: ${zipEntries.length} entradas, ${(size / 1024 / 1024).toFixed(2)} MB; kit ${kitPackaged.size}/${kitOnDisk.length}, dist ${distPackaged.size}/${DIST_EXPECTED.length}; nada fora da allowlist`);
console.log(`vsix: ${vsixPath}`);
