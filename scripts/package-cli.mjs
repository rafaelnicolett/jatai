#!/usr/bin/env node
/**
 * package-cli.mjs — monta o pacote npm da CLI headless do Jataí.
 *
 * Uso: node scripts/package-cli.mjs [--out <pasta>]
 *
 * Pré-requisito: `npm run build:kit` (dist/kit materializado; o script npm
 * `build:cli-kit` já roda antes). O pacote é autocontido:
 *   <out>/jatai.cjs                 bundle da CLI (esbuild)
 *   <out>/kit/                      templates + brownfield-templates + bundles
 *   <out>/package.json              bin: jatai, sem postinstall
 *   <out>/README.md, LICENSE, THIRD_PARTY_NOTICES.md
 *
 * Não publica. A publicação é um job separado do release, com provenance.
 */

import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outIndex = process.argv.indexOf("--out");
const outDir = path.resolve(outIndex > -1 ? process.argv[outIndex + 1] : "dist/cli-package");
const kitDir = path.join(PKG_ROOT, "dist", "kit");
const repoPkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8"));

if (!fs.existsSync(kitDir)) {
  console.error("package-cli: dist/kit não existe. Rode `npm run build:kit` antes.");
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. Bundle da CLI. O bundle fica na raiz do pacote para o kitRoot() achar
//    `<out>/kit/` ao lado (o mesmo layout do dist/ no repo).
await esbuild.build({
  entryPoints: [path.join(PKG_ROOT, "src", "cli-kit", "main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: path.join(outDir, "jatai.cjs"),
  logLevel: "warning",
  sourcemap: false,
});

// 2. Kit materializado, sem maps e lixo de build.
const skip = (src) => !/(\.map|\.DS_Store|\.bak)$/.test(src);
fs.cpSync(kitDir, path.join(outDir, "kit"), { recursive: true, filter: skip });

// 3. Documentos de raiz. O README do pacote é o guia da CLI, não o da extensão.
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  const src = path.join(PKG_ROOT, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, file));
}
const cliReadme = path.join(PKG_ROOT, "docs", "cli.md");
const rootReadme = path.join(PKG_ROOT, "README.md");
const readme = fs.existsSync(cliReadme) ? cliReadme : rootReadme;
if (fs.existsSync(readme)) {
  const text = fs.readFileSync(readme, "utf-8")
    .replace(/\]\(\.\.\/LICENSE\)/g, "](LICENSE)")
    .replace(/\]\(\.\.\/THIRD_PARTY_NOTICES\.md\)/g, "](THIRD_PARTY_NOTICES.md)");
  fs.writeFileSync(path.join(outDir, "README.md"), text);
}

// 4. package.json do pacote (sem postinstall, sem dependências: o bundle é
//    autocontido).
const pkg = {
  name: "jatai",
  version: repoPkg.version,
  description: "CLI do Jataí — instala, atualiza e diagnostica o kit de agentes no seu projeto.",
  license: "MIT",
  bin: { jatai: "./jatai.cjs" },
  files: ["jatai.cjs", "kit", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"],
  engines: { node: ">=20" },
  repository: repoPkg.repository,
  homepage: repoPkg.homepage,
  bugs: repoPkg.bugs,
  keywords: ["jatai", "ai", "agents", "methodology", "copilot", "claude", "opencode"],
  publishConfig: { access: "public" },
};
fs.writeFileSync(path.join(outDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

// 5. Conferência do pacote: nada de fonte, node_modules, .env ou postinstall.
const problems = [];
const must = [
  "jatai.cjs",
  "package.json",
  "kit/templates/scripts/jatai-state.cjs",
  "kit/templates/scripts/jatai-mcp.cjs",
  "kit/brownfield-templates/opencode-instructions.md",
  "kit/brownfield-templates/agents/discovery/assessor.agent.md",
];
for (const rel of must) if (!fs.existsSync(path.join(outDir, rel))) problems.push(`falta ${rel}`);
const forbidden = ["src", "node_modules", ".env", "postinstall"];
for (const rel of forbidden) if (fs.existsSync(path.join(outDir, rel))) problems.push(`não deveria existir ${rel}`);
if (pkg.scripts && "postinstall" in pkg.scripts) problems.push("package.json com postinstall");
if (!pkg.bin?.jatai) problems.push("package.json sem bin.jatai");

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
  const full = path.join(dir, e.name);
  return sum + (e.isDirectory() ? size(full) : fs.statSync(full).size);
}, 0);
const bytes = size(outDir);
if (problems.length > 0) {
  for (const p of problems) console.error(`package-cli: ${p}`);
  process.exit(1);
}
console.log(`package-cli: ${pkg.name}@${pkg.version} em ${outDir}`);
console.log(`  jatai.cjs ${(fs.statSync(path.join(outDir, "jatai.cjs")).size / 1024).toFixed(0)} KB · pacote ${(bytes / 1024 / 1024).toFixed(2)} MB · sem postinstall`);
