#!/usr/bin/env node
/**
 * release-check.mjs: confere se o repositório está pronto para a release (F7.5)
 *
 * Uso:
 *   node scripts/release-check.mjs                       pré-voo: confere o que dá sem uma tag
 *   node scripts/release-check.mjs --tag v1.0.0          confere a tag contra o package.json e o CHANGELOG
 *   ... --notes-out <arquivo>                            grava as notas da release (a seção do CHANGELOG)
 *
 * Regras, sempre:
 *   - o package.json tem `name`, `publisher`, `license` MIT e `repository`, e a `version` é semver;
 *   - o CHANGELOG.md existe.
 *
 * Regras, com `--tag`:
 *   - a tag é `vMAJOR.MINOR.PATCH` (com sufixo de pré-lançamento opcional, como `-rc.1`);
 *   - a versão da tag é a mesma do package.json;
 *   - o CHANGELOG tem a seção `## [versão] - AAAA-MM-DD`, com data válida e ao menos
 *     um item, no formato Keep a Changelog. A seção "Não lançado" não vale para uma tag.
 *
 * Sem `--tag` (pré-voo), a ausência da seção da versão não reprova: o CHANGELOG pode
 * estar ainda em "Não lançado". Nesse caso as notas saem dessa seção.
 *
 * Saída: exit 0 = pronto; 1 = problema encontrado; 2 = uso errado.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const TAG = /^v(.+)$/;
const UNRELEASED = /^##\s*\[\s*(n[ãa]o lan[çc]ado|unreleased)\s*\]/i;

/** Decompõe uma versão semver; `null` se não for. */
export function parseSemver(version) {
  const m = SEMVER.exec(version ?? "");
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? null };
}

/** `true` se `AAAA-MM-DD` é uma data de calendário válida. */
export function isIsoDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? "");
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/**
 * Localiza a seção de uma versão no CHANGELOG (`## [versão] - data`).
 * Devolve `{ header, date, body }` ou `null`. `body` vai até o próximo `## ` ou o fim,
 * sem a linha do título e sem os links de referência no rodapé (`[x]: https://...`).
 */
export function findChangelogSection(changelog, version) {
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const wanted = new RegExp(`^##\\s*\\[\\s*v?${version.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}\\s*\\](?:\\s*[-–—]\\s*(\\S+))?`);
  const start = lines.findIndex((l) => wanted.test(l));
  if (start < 0) return null;
  const date = wanted.exec(lines[start])?.[1] ?? null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .filter((l) => !/^\[[^\]]+\]:\s*\S+/.test(l))
    .join("\n")
    .trim();
  return { header: lines[start], date, body };
}

/** A seção "Não lançado" (usada no pré-voo). */
export function findUnreleasedSection(changelog) {
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => UNRELEASED.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { header: lines[start], date: null, body: lines.slice(start + 1, end).join("\n").trim() };
}

/** Uma seção tem conteúdo quando traz ao menos um item de lista. */
function hasItems(body) {
  return /^\s*[-*]\s+\S/m.test(body);
}

/**
 * Confere a release. `tag` é opcional. Não toca no disco além de ler os dois arquivos.
 * @returns {{ ok: boolean, problems: string[], warnings: string[], version: string|null, prerelease: boolean, notes: string }}
 */
export function checkRelease({ root, tag }) {
  const problems = [];
  const warnings = [];
  let version = null;
  let notes = "";

  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch (err) {
    problems.push(`package.json ilegível: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (manifest) {
    for (const field of ["name", "publisher"]) {
      if (typeof manifest[field] !== "string" || manifest[field].trim() === "") problems.push(`package.json sem "${field}"`);
    }
    if (manifest.license !== "MIT") problems.push(`a licença do package.json é ${JSON.stringify(manifest.license)}, e devia ser "MIT"`);
    const repo = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
    if (!repo) problems.push('package.json sem "repository"');
    version = typeof manifest.version === "string" ? manifest.version : null;
    if (!version || !parseSemver(version)) problems.push(`a versão do package.json (${JSON.stringify(manifest.version)}) não é semver`);
  }

  let tagVersion = null;
  if (tag !== undefined) {
    const m = TAG.exec(tag);
    if (!m || !parseSemver(m[1])) {
      problems.push(`a tag ${JSON.stringify(tag)} não tem o formato vMAJOR.MINOR.PATCH (ex.: v1.0.0, v1.0.0-rc.1)`);
    } else {
      tagVersion = m[1];
      if (version && tagVersion !== version) problems.push(`a tag diz ${tagVersion}, mas o package.json diz ${version}`);
    }
  }

  const target = tagVersion ?? version;
  let changelog = null;
  try {
    changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  } catch {
    problems.push("CHANGELOG.md não existe");
  }

  if (changelog !== null && target && parseSemver(target)) {
    const section = findChangelogSection(changelog, target);
    if (section) {
      if (!section.date) problems.push(`a seção [${target}] do CHANGELOG não tem data (## [${target}] - AAAA-MM-DD)`);
      else if (!isIsoDate(section.date)) problems.push(`a data da seção [${target}] do CHANGELOG (${section.date}) não é AAAA-MM-DD válida`);
      if (!hasItems(section.body)) problems.push(`a seção [${target}] do CHANGELOG não tem nenhum item`);
      notes = section.body;
    } else if (tag !== undefined) {
      const unreleased = findUnreleasedSection(changelog);
      problems.push(
        unreleased
          ? `o CHANGELOG ainda está em "Não lançado": troque por "## [${target}] - AAAA-MM-DD" antes de marcar a tag`
          : `o CHANGELOG não tem a seção [${target}]`,
      );
    } else {
      const unreleased = findUnreleasedSection(changelog);
      if (unreleased) {
        warnings.push(`o CHANGELOG não tem a seção [${target}] e segue em "Não lançado" (esperado antes da release)`);
        notes = unreleased.body;
      } else {
        warnings.push(`o CHANGELOG não tem a seção [${target}] nem "Não lançado"`);
      }
    }
  }

  const prerelease = Boolean(parseSemver(target ?? "")?.pre);
  return { ok: problems.length === 0, problems, warnings, version: target ?? null, prerelease, notes };
}

function main(argv) {
  const args = argv.slice(2);
  let tag;
  let notesOut;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag") tag = args[++i];
    else if (args[i] === "--notes-out") notesOut = args[++i];
    else {
      console.error(`opção desconhecida: ${args[i]}\nuso: node scripts/release-check.mjs [--tag vX.Y.Z] [--notes-out <arquivo>]`);
      return 2;
    }
  }
  if ((args.includes("--tag") && !tag) || (args.includes("--notes-out") && !notesOut)) {
    console.error("faltou o valor de --tag ou de --notes-out");
    return 2;
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkRelease({ root, tag });
  console.log(`release-check: versão ${result.version ?? "?"}${result.prerelease ? " (pré-lançamento)" : ""}${tag ? ` · tag ${tag}` : " · pré-voo, sem tag"}`);
  for (const w of result.warnings) console.log(`  ! ${w}`);
  for (const p of result.problems) console.log(`  ✖ ${p}`);
  if (notesOut && result.notes) {
    fs.mkdirSync(path.dirname(path.resolve(notesOut)), { recursive: true });
    fs.writeFileSync(notesOut, `${result.notes}\n`);
    console.log(`  notas da release: ${notesOut}`);
  }
  if (!result.ok) {
    console.log(`resumo: ${result.problems.length} problema(s) para a release`);
    return 1;
  }
  console.log(`resumo: pronto${tag ? " para a tag" : " (pré-voo)"}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv));
}
