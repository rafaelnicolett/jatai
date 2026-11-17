#!/usr/bin/env node
/**
 * content-scan.mjs: reprova conteúdo proibido nos arquivos versionados (F2.3, ADR-0014)
 *
 * O repositório vai ser público. Dado de cliente, conteúdo pago de terceiro e
 * identificadores internos não podem voltar por um cherry-pick ou uma cópia.
 * Como a lista do que é proibido também não pode ficar em texto claro aqui,
 * ela guarda só o SHA-256 de cada termo NORMALIZADO, em
 * `scripts/content-scan-terms.json`.
 *
 * Normalização (a mesma para o termo e para o texto varrido):
 *   NFKD, sem acentos, minúsculas e sem nada que não seja [a-z0-9].
 *   Ex.: "Acme Foguetes", "acme-foguetes", "ACME_FOGUETES" e "AcmeFoguetes"
 *   viram "acmefoguetes".
 *
 * Varredura, linha a linha, em cada arquivo de texto versionado (e no path):
 *   - quebra a linha em tokens alfanuméricos de dois jeitos: só pelos
 *     separadores, e também nas fronteiras de camelCase ("AcmeNFoguetes"
 *     vira acme, n, foguetes);
 *   - junta de 1 a MAX_TOKENS tokens consecutivos (n-gramas), normaliza, e
 *     compara o SHA-256 com a lista;
 *   - só n-gramas com MIN_LEN a MAX_LEN caracteres entram, então um termo
 *     precisa ter de 1 a 4 tokens e de 5 a 40 caracteres normalizados.
 *   Um termo só casa token inteiro: "acme" não casa dentro de "acmeville".
 *
 * Arquivos: `git ls-files --cached --others --exclude-standard` (versionados
 * e novos ainda não ignorados). Sem git, percorre a pasta pulando node_modules,
 * dist, coverage e afins. Binário (byte NUL nos primeiros 8 KiB) é pulado.
 *
 * Um achado sai como `path:linha · categoria (id do termo)`. O texto achado
 * nunca é impresso.
 *
 * Uso:
 *   node scripts/content-scan.mjs                  varre o pacote
 *   node scripts/content-scan.mjs --root <pasta> --terms <arquivo.json>
 *   node scripts/content-scan.mjs --hash "<termo>" imprime o sha256 normalizado
 *                                                  para pôr na lista
 *
 * Saída: exit 0 = nada proibido; 1 = achou conteúdo proibido; 2 = uso errado
 * ou lista ilegível.
 *
 * Roda no job `security` do ci.yml e em scripts/ci-local.sh. Mude os dois juntos.
 */

import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TERMS = path.join(PKG_ROOT, "scripts", "content-scan-terms.json");

export const MAX_TOKENS = 4;
export const MIN_LEN = 5;
export const MAX_LEN = 40;
const CATEGORIES = new Set(["cliente", "terceiro", "comercial-interno"]);
const BINARY_SNIFF_BYTES = 8 * 1024;
/** Pastas puladas quando não há git para listar os arquivos versionados. */
const WALK_SKIP = new Set([".git", "node_modules", "dist", "coverage", "mock-dist", ".vscode-test"]);
const WALK_SKIP_EXT = [".vsix"];

// ── Normalização e hash ─────────────────────────────────────────────────────

function stripMarks(text) {
  return text.normalize("NFKD").replace(/\p{M}+/gu, "");
}

/** Forma canônica de um termo ou de um n-grama: sem acento, minúsculo, só [a-z0-9]. */
export function normalizeTerm(text) {
  return stripMarks(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const sha256 =
  typeof crypto.hash === "function"
    ? (text) => crypto.hash("sha256", text)
    : (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

/** SHA-256 (hex) da forma normalizada. É o valor que vai na lista. */
export function hashTerm(text) {
  return sha256(normalizeTerm(text));
}

/** As duas sequências de tokens de uma linha: só por separador, e com camelCase quebrado. */
export function tokenSequences(line) {
  const base = stripMarks(line);
  const split = (s) =>
    s
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((t) => t.toLowerCase());
  const plain = split(base);
  const camel = split(base.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2"));
  return plain.length === camel.length ? [plain] : [plain, camel];
}

// ── Lista de termos ─────────────────────────────────────────────────────────

/** Lê e valida a lista. Lança Error com mensagem legível se algo estiver errado. */
export function loadTerms(file = DEFAULT_TERMS) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!doc || !Array.isArray(doc.terms)) throw new Error(`${file}: falta o array "terms"`);
  const ids = new Set();
  const hashes = new Set();
  for (const [i, t] of doc.terms.entries()) {
    const where = `${path.basename(file)}: terms[${i}]`;
    if (!t || typeof t.id !== "string" || !t.id) throw new Error(`${where}: "id" ausente`);
    if (ids.has(t.id)) throw new Error(`${where}: id repetido (${t.id})`);
    if (!CATEGORIES.has(t.category)) throw new Error(`${where}: categoria inválida (${t.category})`);
    if (typeof t.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(t.sha256)) throw new Error(`${where}: sha256 inválido`);
    if (hashes.has(t.sha256)) throw new Error(`${where}: sha256 repetido`);
    ids.add(t.id);
    hashes.add(t.sha256);
  }
  return doc.terms.map((t) => ({ id: t.id, category: t.category, sha256: t.sha256 }));
}

// ── Varredura ───────────────────────────────────────────────────────────────

/** Casador sobre uma lista de termos. Guarda em cache o veredito de cada n-grama já visto. */
export function createMatcher(terms) {
  const byHash = new Map(terms.map((t) => [t.sha256, t]));
  const cache = new Map();
  const lookup = (candidate) => {
    let hit = cache.get(candidate);
    if (hit === undefined) {
      hit = byHash.get(sha256(candidate)) ?? null;
      cache.set(candidate, hit);
    }
    return hit;
  };
  /** Termos que aparecem na linha (no máximo uma vez cada). */
  const scanLine = (line) => {
    const found = new Map();
    for (const tokens of tokenSequences(line)) {
      for (let i = 0; i < tokens.length; i++) {
        let joined = "";
        for (let k = i; k < tokens.length && k < i + MAX_TOKENS; k++) {
          joined += tokens[k];
          if (joined.length > MAX_LEN) break;
          if (joined.length < MIN_LEN) continue;
          const hit = lookup(joined);
          if (hit) found.set(hit.id, hit);
        }
      }
    }
    return [...found.values()];
  };
  return { scanLine };
}

/** Achados num texto: `[{ line, term }]`, com a linha 1-based. */
export function scanText(text, matcher) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    for (const term of matcher.scanLine(lines[n])) hits.push({ line: n + 1, term });
  }
  return hits;
}

function gitFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

function walkFiles(root) {
  const files = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!WALK_SKIP.has(entry.name)) walk(relPath);
      } else if (entry.isFile() && !WALK_SKIP_EXT.some((ext) => entry.name.endsWith(ext))) {
        files.push(relPath);
      }
    }
  };
  walk("");
  return files;
}

/** Arquivos a varrer, relativos a `root`, com "/" como separador e em ordem. */
export function listFiles(root) {
  let files;
  try {
    files = gitFiles(root);
  } catch {
    files = walkFiles(root);
  }
  return [...new Set(files.map((f) => f.split(path.sep).join("/")))].sort();
}

function readText(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null; // apagado do disco mas ainda no índice, ou link quebrado
  }
  if (buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null;
  return buf.toString("utf8");
}

/** Varre `root`. Devolve `{ scanned, skipped, hits: [{ file, line, term }] }`; line 0 = o path. */
export function scanRepo(root, terms) {
  const matcher = createMatcher(terms);
  const hits = [];
  let scanned = 0;
  let skipped = 0;
  for (const rel of listFiles(root)) {
    for (const term of matcher.scanLine(rel)) hits.push({ file: rel, line: 0, term });
    const text = readText(path.join(root, rel));
    if (text === null) {
      skipped++;
      continue;
    }
    scanned++;
    for (const hit of scanText(text, matcher)) hits.push({ file: rel, ...hit });
  }
  return { scanned, skipped, hits };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { root: PKG_ROOT, terms: DEFAULT_TERMS, hash: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} precisa de um valor`);
      return v;
    };
    if (arg === "--root") opts.root = path.resolve(value());
    else if (arg === "--terms") opts.terms = path.resolve(value());
    else if (arg === "--hash") opts.hash = value();
    else throw new Error(`opção desconhecida: ${arg}`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`content-scan: ${err.message}`);
    return 2;
  }

  if (opts.hash !== undefined) {
    const normalized = normalizeTerm(opts.hash);
    const tokens = Math.max(...tokenSequences(opts.hash).map((seq) => seq.length));
    if (normalized.length < MIN_LEN || normalized.length > MAX_LEN || tokens > MAX_TOKENS) {
      console.error(
        `content-scan: o termo precisa ter de 1 a ${MAX_TOKENS} tokens e de ${MIN_LEN} a ${MAX_LEN} caracteres normalizados ` +
          `(tem ${tokens} token(s) e ${normalized.length} caractere(s)); senão o scanner nunca o encontra`,
      );
      return 2;
    }
    console.log(hashTerm(opts.hash));
    return 0;
  }

  let terms;
  try {
    terms = loadTerms(opts.terms);
  } catch (err) {
    console.error(`content-scan: lista de termos ilegível: ${err.message}`);
    return 2;
  }

  const byCategory = {};
  for (const t of terms) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  const categories = Object.entries(byCategory)
    .map(([c, n]) => `${c} ${n}`)
    .join(", ");
  console.log(`content-scan: ${terms.length} termo(s) proibido(s), guardados como SHA-256 (${categories})`);

  const { scanned, skipped, hits } = scanRepo(opts.root, terms);
  const files = new Set(hits.map((h) => h.file));
  for (const h of hits) {
    const where = h.line === 0 ? `${h.file} (no path)` : `${h.file}:${h.line}`;
    console.log(`  ✖ ${where} · ${h.term.category} (${h.term.id})`);
  }
  const base = `${scanned} arquivo(s) de texto varrido(s), ${skipped} binário(s) ou ilegível(is) pulado(s)`;
  if (hits.length > 0) {
    console.log(`resumo: ${hits.length} ocorrência(s) de conteúdo proibido em ${files.size} arquivo(s); ${base}`);
    console.log("Troque o conteúdo por um exemplo fictício (prontidao-open-source.md §1). O texto achado não é impresso.");
    return 1;
  }
  console.log(`resumo: nenhum conteúdo proibido; ${base}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
