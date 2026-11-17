#!/usr/bin/env node
/**
 * third-party-notices.mjs: gera THIRD_PARTY_NOTICES.md (F2.4, ADR-0014)
 *
 * Os bundles do .vsix (extensão, MCP, CLI e webview) embutem dependências de
 * produção e perdem os avisos de licença delas. Este script lista cada pacote
 * de produção dos dois lockfiles e anexa o texto de licença encontrado no
 * node_modules correspondente.
 *
 * Uso:
 *   node scripts/third-party-notices.mjs          → (re)gera o arquivo
 *   node scripts/third-party-notices.mjs --check  → exit 1 se o arquivo
 *                                                    gerado diferir do atual
 *
 * Requer node_modules instalado (os textos de licença vêm dele). A lista de
 * pacotes e as licenças declaradas vêm só dos lockfiles, igual ao
 * license-check.mjs.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(PKG_ROOT, "THIRD_PARTY_NOTICES.md");
const LOCKFILES = [
  { file: "package-lock.json", base: "", label: "extensão, CLI e servidor MCP" },
  { file: "webview-ui/package-lock.json", base: "webview-ui", label: "webview (Cockpit)" },
];

/** Licenças duplas: a opção usada pela Jataí (mesma regra do license-check.mjs). */
const ELECTIONS = { jszip: "MIT (o pacote é MIT OR GPL-3.0-or-later; a Jataí usa a opção MIT)" };

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$|^licen[cs]e[-.]/i;

function nameFromLockPath(p) {
  const i = p.lastIndexOf("node_modules/");
  return p.slice(i + "node_modules/".length);
}

function readLicenseTexts(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort()
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").trim() }));
}

function collect() {
  const byKey = new Map();
  for (const lf of LOCKFILES) {
    const lock = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, lf.file), "utf8"));
    for (const [p, meta] of Object.entries(lock.packages ?? {})) {
      if (!p || meta.dev || meta.link) continue;
      const name = meta.name ?? nameFromLockPath(p);
      const key = `${name}@${meta.version}`;
      if (byKey.has(key)) {
        byKey.get(key).usedBy.add(lf.label);
        continue;
      }
      const dir = path.join(PKG_ROOT, lf.base, p);
      byKey.set(key, {
        name,
        version: meta.version,
        license: ELECTIONS[name] ?? meta.license ?? "(sem licença declarada no lockfile)",
        usedBy: new Set([lf.label]),
        texts: readLicenseTexts(dir),
        installed: fs.existsSync(dir),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function render(pkgs) {
  const lines = [
    "# Avisos de terceiros",
    "",
    "A Jataí é distribuída sob a licença MIT (ver `LICENSE`). Os pacotes do `.vsix` embutem as dependências de produção listadas abaixo, cada uma com a própria licença.",
    "",
    "Arquivo gerado por `scripts/third-party-notices.mjs` a partir dos lockfiles. Não edite à mão: rode `npm run notices`.",
    "",
    `Total: ${pkgs.length} pacotes de produção.`,
    "",
    "| Pacote | Versão | Licença | Usado em |",
    "|---|---|---|---|",
    ...pkgs.map((p) => `| ${p.name} | ${p.version} | ${p.license} | ${[...p.usedBy].sort().join("; ")} |`),
    "",
  ];
  for (const p of pkgs) {
    lines.push(`## ${p.name}@${p.version}`, "", `Licença: ${p.license}`, "");
    if (p.texts.length === 0) {
      lines.push(
        p.installed
          ? "O pacote não traz arquivo de licença; vale a licença declarada acima, conforme o `package.json` do pacote."
          : "Texto da licença indisponível (pacote não instalado ao gerar este arquivo).",
        ""
      );
      continue;
    }
    for (const t of p.texts) {
      lines.push(`<details><summary>${t.file}</summary>`, "", "```text", t.text, "```", "", "</details>", "");
    }
  }
  return lines.join("\n");
}

const content = render(collect());
if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== content) {
    console.error("THIRD_PARTY_NOTICES.md desatualizado: rode `npm run notices` e commite o resultado.");
    process.exit(1);
  }
  console.log("THIRD_PARTY_NOTICES.md em dia.");
} else {
  fs.writeFileSync(OUT, content);
  console.log(`THIRD_PARTY_NOTICES.md gerado (${content.split("\n## ").length - 1} pacotes).`);
}
