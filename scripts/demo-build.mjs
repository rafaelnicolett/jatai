#!/usr/bin/env node
/**
 * demo-build.mjs: gera o workspace demo fictício em `.demo/` (F7.4)
 *
 * O demo é um projeto de exemplo (a Biblioteca de Bairro, com dois repositórios
 * inventados) para os prints e GIFs do README, para os testes de ponta a ponta e
 * para o modo demo do mapa. Nenhum dado é real.
 *
 * Como o workspace nasce:
 *   1. o instalador real do kit (`KitInstaller.installBrownfield`, host Claude
 *      Code) instala agentes, skills, instruções, hooks, CLI e servidor MCP.
 *      Assim o demo nunca diverge do kit: o que está nele é o que a Jataí instala;
 *   2. as fixtures versionadas de `demo/fixtures/workspace/` são sobrepostas:
 *      os dois repositórios, o estado da metodologia em `.github/artifacts/`, as
 *      ADRs e os cenários BDD. Os horários do histórico (`runs/*.jsonl`) já estão
 *      ancorados numa data fixa (2026-10-05).
 *
 * O instalador é TypeScript. Em vez de exigir um build antes, o script o empacota
 * com o esbuild (que o pacote já tem) num arquivo temporário em `dist/`, na mesma
 * posição em que o `dist/extension.js` roda, e o apaga no fim.
 *
 * Segurança: a pasta de saída só é esvaziada se estiver vazia ou se já for um demo
 * gerado (o `jatai.config.yaml` dela traz o nome do projeto demo). Qualquer outra
 * pasta é recusada, com o que fazer.
 *
 * Uso:
 *   node scripts/demo-build.mjs                gera em .demo/
 *   node scripts/demo-build.mjs --out <pasta>  gera em outra pasta
 *   npm run demo                               o mesmo, pelo npm
 *
 * Saída: exit 0 = demo gerado; 1 = pasta recusada ou falha na geração; 2 = uso errado.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const require = createRequire(import.meta.url);
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Pasta do demo gerado (está no .gitignore e no .vscodeignore). */
export const DEMO_DIR = ".demo";
/** Nome do projeto no `jatai.config.yaml` do demo: é o que o identifica como "demo gerado". */
export const DEMO_PROJECT_NAME = "Biblioteca de Bairro (demo)";
/** Pasta das fixtures, que espelha a raiz do workspace gerado. */
export const FIXTURES_DIR = path.join(PKG_ROOT, "demo", "fixtures", "workspace");
/** Fixtures que o build grava com outro nome (destino relativo à raiz do demo). */
export const RENAMES = {
  // O caminho que a Jataí lê para saber que o Discovery terminou (chat e Cockpit).
  ".github/artifacts/assessment/relatorio-do-discovery.md": ".github/artifacts/assessment/report.md",
};

export class DemoBuildError extends Error {}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function readBrand(pkgRoot) {
  return JSON.parse(fs.readFileSync(path.join(pkgRoot, "src", "data", "brand.json"), "utf-8"));
}

/** `true` se `dir` é um demo gerado antes: o config da marca traz o nome do projeto demo. */
export function looksLikeDemo(dir, pkgRoot = PKG_ROOT) {
  const config = path.join(dir, readBrand(pkgRoot).files.config);
  if (!fs.existsSync(config)) return false;
  return fs.readFileSync(config, "utf-8").includes(`name: "${DEMO_PROJECT_NAME}"`);
}

/** Recusa a pasta que não pode ser esvaziada com segurança; devolve o caminho absoluto. */
export function assertSafeOutDir(out, pkgRoot = PKG_ROOT) {
  const abs = path.resolve(out);
  const rel = path.relative(abs, pkgRoot);
  const containsPackage = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (containsPackage) throw new DemoBuildError(`${abs} é (ou contém) a pasta do pacote. Escolha outra com --out.`);
  if (path.dirname(abs) === abs) throw new DemoBuildError("a raiz do disco não pode ser a pasta do demo.");
  if (!fs.existsSync(abs)) return abs;
  if (!fs.statSync(abs).isDirectory()) throw new DemoBuildError(`${abs} existe e não é uma pasta.`);
  if (fs.readdirSync(abs).length > 0 && !looksLikeDemo(abs, pkgRoot)) {
    throw new DemoBuildError(
      `${abs} já existe e não é de um demo gerado (o config dela não traz o projeto "${DEMO_PROJECT_NAME}"). ` +
        "Nada foi apagado. Escolha outra pasta com --out ou apague esta à mão.",
    );
  }
  return abs;
}

/** Apaga o conteúdo da pasta, sem apagar a pasta (ela pode estar aberta no editor) nem um `.git` que alguém tenha criado nela. */
function emptyDirectory(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === ".git") continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

/** Arquivos sob `dir`, em caminhos POSIX relativos, sem `.DS_Store`. */
export function listFiles(dir) {
  const out = [];
  const visit = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(toPosix(path.relative(dir, full)));
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return out.sort();
}

/** Materializa o kit em dist/kit/ só se faltar ou estiver defasado: o `writeAll` reescreve tudo e outro processo (os testes) pode estar lendo. */
function ensureKitMaterialized(pkgRoot) {
  const kit = require(path.join(pkgRoot, "scripts", "kit.js"));
  if (kit.checkAll().length > 0) kit.writeAll();
}

/**
 * Empacota o instalador (TypeScript) com o esbuild e o carrega. O arquivo fica em
 * `dist/`, a mesma pasta de onde o `extension.js` acha o kit (`dist/kit/`), e tem
 * nome único: dois processos podem gerar um demo ao mesmo tempo.
 */
async function withInstaller(pkgRoot, run) {
  const distDir = path.join(pkgRoot, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  const bundle = path.join(distDir, `demo-installer-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.cjs`);
  try {
    await esbuild.build({
      entryPoints: [path.join(pkgRoot, "src", "generator", "install", "KitInstaller.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      outfile: bundle,
      logLevel: "silent",
    });
    const { KitInstaller } = require(bundle);
    return await run(new KitInstaller());
  } finally {
    fs.rmSync(bundle, { force: true });
  }
}

/** Sobrepõe as fixtures ao workspace gerado. Devolve os caminhos gravados (relativos, POSIX). */
export function overlayFixtures(out, fixturesDir = FIXTURES_DIR) {
  const written = [];
  for (const rel of listFiles(fixturesDir)) {
    const target = RENAMES[rel] ?? rel;
    const dest = path.join(out, ...target.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(fixturesDir, ...rel.split("/")), dest);
    written.push(target);
  }
  return written;
}

/**
 * Gera o demo em `out` (padrão: `.demo/` do pacote) e devolve o que foi feito.
 * `fixturesDir` e `pkgRoot` existem para os testes.
 */
export async function buildDemo({ out = path.join(PKG_ROOT, DEMO_DIR), pkgRoot = PKG_ROOT, fixturesDir = FIXTURES_DIR } = {}) {
  const abs = assertSafeOutDir(out, pkgRoot);
  fs.mkdirSync(abs, { recursive: true });
  emptyDirectory(abs);

  ensureKitMaterialized(pkgRoot);
  await withInstaller(pkgRoot, (installer) => installer.installBrownfield(abs, DEMO_PROJECT_NAME, "claude"));

  const fromFixtures = overlayFixtures(abs, fixturesDir);
  const files = listFiles(abs);
  return { out: abs, files: files.length, fixtures: fromFixtures.length, installed: files.length - fromFixtures.length };
}

function main(argv) {
  let out = path.join(PKG_ROOT, DEMO_DIR);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) out = path.resolve(argv[++i]);
    else {
      console.error(`demo-build: opção desconhecida: ${argv[i]}`);
      console.error("uso: node scripts/demo-build.mjs [--out <pasta>]");
      return 2;
    }
  }
  return buildDemo({ out }).then(
    (result) => {
      const relative = path.relative(process.cwd(), result.out);
      const shown = relative === "" ? "." : relative.startsWith("..") || path.isAbsolute(relative) ? result.out : relative;
      console.log(`demo-build: ${result.files} arquivo(s) em ${shown} (${result.installed} do instalador do kit, ${result.fixtures} das fixtures)`);
      console.log(`  abrir no VS Code com a Jataí instalada: code ${shown}`);
      console.log("  mapa ao vivo: npm run demo:play");
      return 0;
    },
    (err) => {
      console.error(`demo-build: ${err instanceof DemoBuildError ? err.message : (err?.stack ?? err)}`);
      return 1;
    },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(await main(process.argv.slice(2)));
}
