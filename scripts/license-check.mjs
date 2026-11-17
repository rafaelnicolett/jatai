#!/usr/bin/env node
/**
 * license-check.mjs: gate de licenças de terceiros (F0.3, ADR-0014)
 *
 * Lê os dois lockfiles (`package-lock.json` e `webview-ui/package-lock.json`)
 * e confere a licença declarada de cada pacote contra a allowlist do
 * ADR-0014. Não usa rede nem `node_modules`: o lockfile v2/v3 já traz o campo
 * `license` de cada pacote, então o gate roda igual no CI e offline.
 *
 * Regras:
 *   - A licença é lida como expressão SPDX. Com OR, basta uma opção permitida;
 *     com AND, todas precisam ser. WITH (exceção) e texto livre, como
 *     "SEE LICENSE IN ...", não são aceitos.
 *   - Produção: tudo que não é `dev` no lockfile. São as dependências que vão
 *     embutidas nos bundles do .vsix (extensão, MCP, CLI e webview).
 *       · Licença fora da allowlist reprova.
 *       · Expressão com OR exige a opção declarada em ELECTIONS. O ADR-0014
 *         pede que a opção MIT do jszip fique declarada.
 *   - Desenvolvimento (ferramentas de build e teste, que não são
 *     redistribuídas): também reprova fora da allowlist, salvo as exceções
 *     revisadas de DEV_EXCEPTIONS. Elas aparecem como "sinalizadas" na saída.
 *     Aqui o OR é resolvido sozinho.
 *
 * Saída: exit 0 = ok; 1 = alguma licença reprovada; 2 = lockfile ilegível.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCKFILES = ["package-lock.json", "webview-ui/package-lock.json"];

/** Allowlist do ADR-0014 (ids SPDX). */
const ALLOW = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "Zlib",
  "CC0-1.0",
  "Python-2.0",
  "BlueOak-1.0.0",
];

/** Dependências de produção com licença dupla: a opção usada pela Jataí. */
const ELECTIONS = {
  jszip: { license: "MIT", why: "jszip é (MIT OR GPL-3.0-or-later); a Jataí usa a opção MIT (ADR-0014)" },
};

/**
 * Pacotes só de desenvolvimento com licença fora da allowlist, revisados um a
 * um. Valem só enquanto o pacote for `dev` e a licença declarada for
 * exatamente esta. Se mudar, o gate volta a reprovar.
 */
const DEV_EXCEPTIONS = [
  {
    name: /^@vscode\/vsce-sign(-[a-z0-9-]+)?$/,
    license: "SEE LICENSE IN LICENSE.txt",
    why: "binários de assinatura da Microsoft, puxados pelo @vscode/vsce; só servem para publicar, não vão no .vsix",
  },
  {
    name: "caniuse-lite",
    license: "CC-BY-4.0",
    why: "base de dados do browserslist (via @vitejs/plugin-react), lida só no build do webview; não vai no bundle",
  },
  {
    name: "@csstools/color-helpers",
    license: "MIT-0",
    why: "dependência do jsdom (via cssstyle), só nos testes do webview; MIT-0 é a MIT sem a cláusula de atribuição",
  },
  {
    name: "axe-core",
    license: "MPL-2.0",
    why: "motor do teste de acessibilidade (F4.4), só nos testes do webview; MPL é copyleft fraco por arquivo e o pacote não vai no .vsix nem no bundle",
  },
];

const allowLower = new Map(ALLOW.map((id) => [id.toLowerCase(), id]));

// ── SPDX ────────────────────────────────────────────────────────────────────

function tokenize(expression) {
  return expression.replace(/([()])/g, " $1 ").trim().split(/\s+/).filter(Boolean);
}

/**
 * Avalia uma expressão SPDX contra a allowlist. Devolve `{ ok, licenses }`,
 * com as licenças que satisfazem a expressão, ou `null` se ela não for SPDX.
 * Precedência: WITH > AND > OR.
 */
function evaluate(expression) {
  const tokens = tokenize(expression);
  let pos = 0;
  const peek = () => tokens[pos]?.toUpperCase();

  function term() {
    const token = tokens[pos++];
    if (token === undefined) throw new Error("fim inesperado");
    if (token === "(") {
      const inner = orExpr();
      if (tokens[pos++] !== ")") throw new Error("parêntese sem par");
      return inner;
    }
    if (/^(AND|OR|WITH|\))$/i.test(token)) throw new Error(`token inesperado: ${token}`);
    if (!/^[A-Za-z0-9.+-]+$/.test(token)) throw new Error(`id inválido: ${token}`);
    if (peek() === "WITH") {
      pos++;
      const exception = tokens[pos++];
      if (exception === undefined) throw new Error("WITH sem exceção");
      return { ok: false, licenses: [`${token} WITH ${exception}`] };
    }
    const id = allowLower.get(token.toLowerCase());
    return id ? { ok: true, licenses: [id] } : { ok: false, licenses: [token] };
  }

  function andExpr() {
    let left = term();
    while (peek() === "AND") {
      pos++;
      const right = term();
      left = { ok: left.ok && right.ok, licenses: [...left.licenses, ...right.licenses] };
    }
    return left;
  }

  function orExpr() {
    let left = andExpr();
    while (peek() === "OR") {
      pos++;
      const right = andExpr();
      if (!left.ok) left = right.ok ? right : { ok: false, licenses: [...left.licenses, ...right.licenses] };
    }
    return left;
  }

  try {
    const result = orExpr();
    if (pos !== tokens.length) throw new Error("sobrou texto");
    return result;
  } catch {
    return null;
  }
}

// ── Lockfiles ───────────────────────────────────────────────────────────────

function normalizeLicense(raw) {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && typeof raw.type === "string") return raw.type;
  return "UNKNOWN";
}

function readLockfile(rel) {
  const file = path.join(PKG_ROOT, rel);
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`license-check: não consegui ler ${rel}: ${err.message}`);
    process.exit(2);
  }
  if (!lock.packages || typeof lock.packages !== "object") {
    console.error(`license-check: ${rel} não tem "packages" (lockfile v1 não é suportado; rode npm >= 7).`);
    process.exit(2);
  }
  const entries = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === "" || entry.link) continue;
    const name = entry.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    entries.push({
      lockfile: rel,
      name,
      version: entry.version ?? "?",
      license: normalizeLicense(entry.license),
      scope: entry.dev === true ? "dev" : "prod",
    });
  }
  return entries;
}

function devException(pkg) {
  return DEV_EXCEPTIONS.find(
    (ex) => (typeof ex.name === "string" ? ex.name === pkg.name : ex.name.test(pkg.name)) && ex.license === pkg.license,
  );
}

// ── Gate ────────────────────────────────────────────────────────────────────

const violations = [];
const flagged = [];
const elected = [];
const byLicense = new Map();
const unique = { prod: new Set(), dev: new Set() };
const perLockfile = [];

for (const rel of LOCKFILES) {
  const entries = readLockfile(rel);
  perLockfile.push(
    `${rel}: ${entries.length} pacotes (${entries.filter((e) => e.scope === "prod").length} de produção, ${entries.filter((e) => e.scope === "dev").length} de dev)`,
  );
  for (const pkg of entries) {
    const id = `${pkg.name}@${pkg.version}`;
    unique[pkg.scope].add(id);
    const result = evaluate(pkg.license);
    const hasOr = tokenize(pkg.license).some((t) => t.toUpperCase() === "OR");
    let resolved = null;
    let problem = null;

    const election = ELECTIONS[pkg.name];
    if (election && pkg.scope === "prod") {
      const offered = result !== null && hasOr && tokenize(pkg.license).includes(election.license);
      if (!offered || !allowLower.has(election.license.toLowerCase())) {
        problem = `a opção declarada (${election.license}) não está em "${pkg.license}"`;
      } else {
        resolved = election.license;
        elected.push({ ...pkg, chosen: election.license, why: election.why });
      }
    } else if (result === null) {
      problem = `"${pkg.license}" não é uma expressão SPDX`;
    } else if (!result.ok) {
      problem = `"${pkg.license}" está fora da allowlist`;
    } else if (hasOr && pkg.scope === "prod") {
      problem = `"${pkg.license}" tem OR: declare a opção usada em ELECTIONS (ADR-0014)`;
    } else {
      resolved = result.licenses.join(" AND ");
    }

    if (problem && pkg.scope === "dev") {
      const ex = devException(pkg);
      if (ex) {
        flagged.push({ ...pkg, exception: ex });
        resolved = `${pkg.license} (exceção de dev)`;
        problem = null;
      }
    }
    if (problem) violations.push({ ...pkg, problem });
    else {
      if (!byLicense.has(resolved)) byLicense.set(resolved, new Set());
      byLicense.get(resolved).add(id);
    }
  }
}

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((p) => {
    const k = `${p.name}@${p.version}|${p.problem ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

console.log(`license-check: allowlist do ADR-0014: ${ALLOW.join(", ")}`);
for (const line of perLockfile) console.log(`  ${line}`);
console.log(
  `  por licença (pacote@versão únicos): ${[...byLicense.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .map(([lic, ids]) => `${lic} ${ids.size}`)
    .join(" · ")}`,
);
for (const p of dedupe(elected)) {
  console.log(`  opção declarada: ${p.name}@${p.version} "${p.license}" → ${p.chosen}. ${p.why}`);
}
const flaggedUnique = dedupe(flagged);
if (flaggedUnique.length > 0) {
  console.log(`  ⚠ sinalizados: ${flaggedUnique.length} pacote(s) de dev fora da allowlist, em exceção revisada (não vão no .vsix)`);
  for (const ex of DEV_EXCEPTIONS) {
    const hits = flaggedUnique.filter((p) => p.exception === ex);
    if (hits.length === 0) continue;
    console.log(`      "${ex.license}" × ${hits.length}: ${hits.map((p) => `${p.name}@${p.version}`).join(", ")}`);
    console.log(`        motivo: ${ex.why}`);
  }
}
const violationsUnique = dedupe(violations);
for (const p of violationsUnique) {
  console.log(`  ✖ ${p.scope === "prod" ? "produção" : "dev"}: ${p.name}@${p.version} (${p.lockfile}): ${p.problem}`);
}

const flaggedIds = new Set(flaggedUnique.map((p) => `${p.name}@${p.version}`));
const devAllowed = [...unique.dev].filter((id) => !flaggedIds.has(id)).length;
const summary =
  violationsUnique.length > 0
    ? `${violationsUnique.length} pacote(s) reprovado(s)`
    : `produção ${unique.prod.size} pacote(s), todos na allowlist (${dedupe(elected).length} com opção declarada); ` +
      `dev ${unique.dev.size} pacote(s): ${devAllowed} na allowlist + ${flaggedUnique.length} sinalizado(s)`;
console.log(`resumo: ${summary}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    "### Licenças de terceiros (ADR-0014)",
    "",
    violationsUnique.length > 0 ? `**Reprovado:** ${summary}` : `**Ok:** ${summary}`,
    "",
    ...violationsUnique.map((p) => `- ✖ \`${p.name}@${p.version}\` (${p.scope}): ${p.problem}`),
    ...dedupe(elected).map((p) => `- opção declarada: \`${p.name}@${p.version}\` → ${p.chosen}`),
    ...flaggedUnique.map((p) => `- ⚠ sinalizado (dev): \`${p.name}@${p.version}\` "${p.license}"`),
    "",
  ].join("\n");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

process.exit(violationsUnique.length > 0 ? 1 : 0);
