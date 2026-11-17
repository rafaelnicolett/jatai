#!/usr/bin/env node
/**
 * kit.js: materializa as edições do kit a partir da fonte única (ADR-0018, F3.5)
 *
 * `kit/` é a única fonte do kit de agentes, e é ela que vai para o git.
 * `kit/kit.manifest.yaml` diz o que cada edição recebe, e este script escreve
 * (ou confere) as pastas que o gerador lê em runtime e o .vsix leva, em
 * `dist/kit/`, fora do git (ADR-0018):
 *   greenfield → dist/kit/templates/   brownfield → dist/kit/brownfield-templates/
 *
 * Uso:
 *   node scripts/kit.js --check   (padrão) sai com 1 se alguma edição em dist/kit/ divergir do manifesto
 *   node scripts/kit.js --write   reescreve as edições em dist/kit/ (npm run build:kit)
 *
 * O `--write` só mexe nas pastas das edições, e nelas preserva o que o
 * manifesto marca como `keep`. Nunca apaga nada de `kit/`.
 *
 * Os bytes e o modo de cada arquivo são copiados como estão: a marca
 * (`{{brand.*}}`) só é renderizada na instalação, pelo gerador.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const PKG_ROOT = path.resolve(__dirname, "..");
const KIT_ROOT = path.join(PKG_ROOT, "kit");
/** Onde as edições são materializadas: fora do git, no `dist/` do pacote. */
const OUT_ROOT = path.join(PKG_ROOT, "dist", "kit");
const MANIFEST = path.join(KIT_ROOT, "kit.manifest.yaml");

function toPosix(p) {
  return p.split(path.sep).join("/");
}

/** Arquivos sob `dir`, em caminhos POSIX relativos a ele, ignorando `.DS_Store`. */
function walk(dir) {
  const out = [];
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".DS_Store") continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full);
      else out.push(toPosix(path.relative(dir, full)));
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return out.sort();
}

function loadManifest(manifestPath = MANIFEST) {
  const doc = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  if (!doc || doc.schema !== 1 || typeof doc.editions !== "object") {
    throw new Error(`${toPosix(path.relative(PKG_ROOT, manifestPath))}: manifesto inválido (schema 1 com editions)`);
  }
  return doc;
}

/** Normaliza uma unidade do manifesto para `{ from, to }`, com `from` relativo a `kit/`. */
function normalizeUnit(unit) {
  if (typeof unit === "string") return { from: `content/${unit}`, to: unit };
  if (unit && typeof unit.from === "string" && typeof unit.to === "string") return { from: unit.from, to: unit.to };
  throw new Error(`unidade inválida no manifesto: ${JSON.stringify(unit)}`);
}

/**
 * Plano de uma edição: caminho na edição → arquivo-fonte em `kit/`. Fonte
 * ausente e dois arquivos no mesmo destino são erros.
 */
function planEdition(manifest, name, kitRoot = KIT_ROOT) {
  const edition = manifest.editions[name];
  if (!edition) throw new Error(`edição desconhecida: ${name}`);
  const units = [...(edition.units ?? []).map(normalizeUnit), ...(edition.skills ?? []).map((id) => normalizeUnit(`skills/${id}`))];
  const plan = new Map();
  const problems = [];
  for (const { from, to } of units) {
    const src = path.join(kitRoot, from);
    if (!fs.existsSync(src)) {
      problems.push(`${name}: fonte ausente kit/${from}`);
      continue;
    }
    // Source map (o do bundle do CLI, em kit/scripts/) fica na fonte para depuração e não entra em edição.
    const files = fs.statSync(src).isDirectory() ? walk(src).filter((rel) => !rel.endsWith(".map")).map((rel) => [path.join(src, rel), `${to}/${rel}`]) : [[src, to]];
    if (files.length === 0) problems.push(`${name}: kit/${from} está vazio`);
    for (const [file, dest] of files) {
      if (plan.has(dest)) problems.push(`${name}: ${dest} vem de duas unidades (${toPosix(path.relative(kitRoot, plan.get(dest)))} e ${toPosix(path.relative(kitRoot, file))})`);
      else plan.set(dest, file);
    }
  }
  return { out: edition.out, keep: edition.keep ?? [], plan, problems };
}

function isKept(rel, keep) {
  return keep.some((k) => rel === k || rel.startsWith(`${k}/`));
}

function modeOf(file) {
  return fs.statSync(file).mode & 0o777;
}

/** Temporário de uma escrita em curso (`<arquivo>.tmp-<pid>-<ms>`): não é conteúdo da edição. */
const TEMP_SUFFIX = /\.tmp-\d+-\d+$/;
/** Um temporário abandonado por uma escrita que morreu no meio só é limpo depois deste tempo. */
const STALE_TEMP_MS = 60_000;

/** `true` se `dest` existe e tem os mesmos bytes de `src`. */
function sameContent(dest, src) {
  try {
    return fs.readFileSync(dest).equals(fs.readFileSync(src));
  } catch {
    return false;
  }
}

/**
 * Escreve `dest` a partir de `src` sem que um leitor concorrente veja o arquivo truncado: copia para um
 * temporário na mesma pasta e troca por `rename`. O `copyFileSync` direto trunca o destino antes de
 * preenchê-lo, e um teste que lia o bundle do MCP nessa janela o viu com 0 bytes.
 */
function copyAtomic(src, dest, mode) {
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.copyFileSync(src, tmp);
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Diferenças entre a edição materializada em disco e o plano. */
function diffEdition(edition, pkgRoot = OUT_ROOT) {
  const outDir = path.join(pkgRoot, edition.out);
  const problems = [...edition.problems];
  const present = walk(outDir).filter((rel) => !isKept(rel, edition.keep) && !TEMP_SUFFIX.test(rel));
  for (const [rel, src] of edition.plan) {
    const dest = path.join(outDir, rel);
    if (!fs.existsSync(dest)) problems.push(`${edition.out}/${rel}: falta (fonte kit/${toPosix(path.relative(KIT_ROOT, src))})`);
    else if (!fs.readFileSync(dest).equals(fs.readFileSync(src))) problems.push(`${edition.out}/${rel}: conteúdo diferente da fonte kit/${toPosix(path.relative(KIT_ROOT, src))}`);
    else if (process.platform !== "win32" && modeOf(dest) !== modeOf(src)) problems.push(`${edition.out}/${rel}: modo diferente da fonte`);
  }
  for (const rel of present) {
    if (!edition.plan.has(rel)) problems.push(`${edition.out}/${rel}: sobra (nenhuma unidade do manifesto o produz)`);
  }
  return problems;
}

function writeEdition(edition, pkgRoot = OUT_ROOT) {
  if (edition.problems.length > 0) throw new Error(edition.problems.join("\n"));
  const outDir = path.join(pkgRoot, edition.out);
  for (const rel of walk(outDir)) {
    if (isKept(rel, edition.keep) || edition.plan.has(rel)) continue;
    const full = path.join(outDir, rel);
    // O temporário de outra escrita em curso fica; só o abandonado há mais de um minuto sai.
    if (TEMP_SUFFIX.test(rel) && Date.now() - fs.statSync(full).mtimeMs < STALE_TEMP_MS) continue;
    fs.rmSync(full, { force: true });
  }
  for (const [rel, src] of edition.plan) {
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const mode = modeOf(src);
    // O que já está igual não é tocado: reescrever o mesmo conteúdo só abre uma janela de leitura truncada.
    if (!sameContent(dest, src)) copyAtomic(src, dest, mode);
    else if (process.platform !== "win32" && modeOf(dest) !== mode) fs.chmodSync(dest, mode);
  }
  // Pastas que ficaram vazias depois das remoções
  const prune = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(d, e.name));
    if (d !== outDir && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
  };
  if (fs.existsSync(outDir)) prune(outDir);
}

function editions(manifest = loadManifest()) {
  return Object.keys(manifest.editions).map((name) => ({ name, ...planEdition(manifest, name) }));
}

/** Todas as diferenças entre as edições em dist/kit/ e o manifesto (vazio = em dia). */
function checkAll() {
  return editions().flatMap((e) => diffEdition(e));
}

/** Materializa as duas edições em dist/kit/ (o build e o globalSetup dos testes chamam isto). */
function writeAll() {
  for (const e of editions()) writeEdition(e);
}

module.exports = { loadManifest, planEdition, diffEdition, writeEdition, writeAll, editions, checkAll, KIT_ROOT, OUT_ROOT, MANIFEST };

if (require.main === module) {
  const write = process.argv.includes("--write");
  try {
    if (write) {
      for (const e of editions()) {
        writeEdition(e);
        console.log(`dist/kit/${e.out}/: ${e.plan.size} arquivo(s) do kit (edição ${e.name})`);
      }
    }
    const problems = checkAll();
    if (problems.length > 0) {
      console.error(`kit: ${problems.length} diferença(s) entre kit/ e as edições materializadas em dist/kit/`);
      for (const p of problems.slice(0, 50)) console.error(`  ✗ ${p}`);
      console.error("Edite kit/ e rode: npm run build:kit");
      process.exit(1);
    }
    const summary = editions().map((e) => `dist/kit/${e.out}/ ${e.plan.size}`).join(" · ");
    console.log(`kit em dia com kit/kit.manifest.yaml: ${summary}`);
  } catch (err) {
    console.error(`kit: ${err.message}`);
    process.exit(1);
  }
}
