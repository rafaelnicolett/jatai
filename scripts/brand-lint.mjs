#!/usr/bin/env node
/**
 * brand-lint.mjs: reprova literal de marca fora do brand.json (F1.2, ADR-0013)
 *
 * A marca é dado: `src/data/brand.json` guarda nome, prefixos, participant,
 * nomes de arquivo, env e URLs, e o código e o kit leem dali. Um literal de
 * marca escrito à mão fica para trás na próxima troca de marca, em silêncio.
 * Este lint é o que impede isso.
 *
 * Marca = o `name` e o `displayName` do brand.json, mais as marcas legadas
 * (`legacy.names`, `legacy.displayNames`). Casamento sem distinção de
 * maiúsculas, por substring (`HELYX_`, `helyxWizard`, `Helyx` contam), nas
 * formas NFC e NFD do nome de exibição.
 *
 * O que é varrido:
 *   - código (`src/**`, `webview-ui/src/**`, `.ts`/`.tsx`): só o que vira
 *     dado em runtime. Literais de string e de template, texto JSX,
 *     regex e nome de variável lida em `process.env.<NOME>`. Comentário,
 *     identificador e caminho de import ficam de fora (o símbolo `HelyxMark` e
 *     o tipo `HelyxConfig` são código, não marca exibida nem protocolo);
 *   - CSS em `src/**` e `webview-ui/src/**`, sem os comentários;
 *   - o kit (`kit/**`, a fonte única; as edições são materializadas fora do git), arquivo de texto
 *     inteiro e o caminho de cada arquivo. No kit a marca se escreve
 *     `{{brand.<caminho>}}`, que o gerador renderiza ao instalar; todo
 *     placeholder tem que resolver para uma string do brand.json.
 *
 * Fora da varredura, sempre: o próprio `src/data/brand.json`, o bundle do CLI
 * (`kit/scripts/<files.cli>` e o `.map`), que é gerado de `src/cli` pelo
 * `npm run build:cli` e carrega o brand.json embutido, e o do servidor MCP
 * (`kit/scripts/<name>-mcp.cjs`, `npm run build:mcp`, ADR-0025), idem. O que mais precisar
 * escrever a marca entra em ALLOWLIST abaixo, com o motivo.
 *
 * Uso:
 *   node scripts/brand-lint.mjs                 varre o pacote
 *   node scripts/brand-lint.mjs --root <pasta>  varre outra raiz (testes)
 *
 * Saída: um achado por linha (`path:linha: tipo: trecho`) e uma linha
 * `resumo:`. Exit 0 = limpo; 1 = achou literal de marca ou placeholder que
 * não resolve; 2 = uso errado.
 *
 * Roda no job `verify` do ci.yml e em scripts/ci-local.sh, logo depois do
 * lint do webview. Mude os dois juntos.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAND_JSON = "src/data/brand.json";
const CODE_DIRS = ["src", "webview-ui/src"];
// `kit/` é a fonte única (F3.5); as duas edições são materializadas dele.
const KIT_DIRS = ["kit"];
const WALK_SKIP = new Set(["node_modules", "dist", "coverage", "mock-dist"]);
const BINARY_SNIFF_BYTES = 8 * 1024;

/**
 * Arquivos que podem escrever a marca, cada um com o motivo. Caminho relativo
 * ao pacote, com `/`. Uma entrada que não acha mais nada reprova (entrada
 * obsoleta), para a lista não crescer sem dono.
 */
export const ALLOWLIST = [
  // Vazia: o código e o kit leem tudo do brand.json, inclusive o que é
  // legado (`BRAND.legacy.*`). Formato: { path: "src/…", reason: "…" }.
];

/** `{{brand.<caminho>}}`, a mesma forma de `src/data/brand.pure.ts › BRAND_PLACEHOLDER`. */
const PLACEHOLDER = /\{\{brand\.([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\}\}/g;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function loadBrand(root = PKG_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, BRAND_JSON), "utf-8"));
}

/** Regex (sem distinção de maiúsculas) que casa qualquer forma da marca atual ou legada. */
export function brandPattern(brand) {
  const names = [brand.name, ...(brand.legacy?.names ?? [])];
  const displays = [brand.displayName, ...(brand.legacy?.displayNames ?? [])];
  const tokens = new Set();
  for (const t of [...names, ...displays]) {
    if (!t) continue;
    tokens.add(t.normalize("NFC"));
    tokens.add(t.normalize("NFD"));
  }
  const alternatives = [...tokens].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(alternatives.join("|"), "iu");
}

/** Valor de `{{brand.a.b}}` no brand.json, ou `undefined` se não for uma string. */
export function placeholderValue(brand, dotted) {
  let current = brand;
  for (const key of dotted.split(".")) {
    if (current === null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function excerpt(s) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 80 ? `${one.slice(0, 77)}...` : one;
}

/** Literais de marca num fonte TS/TSX. Usa o `typescript` do próprio pacote. */
export function scanCode(text, fileName, pattern, ts) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const report = (node, what, raw) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    findings.push({ line, kind: what, text: excerpt(raw) });
  };
  const isModuleSpecifier = (node) => {
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
    if (ts.isImportTypeNode?.(parent.parent ?? parent)) return true;
    if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
      const callee = parent.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
      if (ts.isIdentifier(callee) && callee.text === "require") return true;
    }
    return false;
  };
  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail: {
        const raw = node.getText(sf);
        if (pattern.test(raw) && !isModuleSpecifier(node)) report(node, "literal", raw);
        break;
      }
      case ts.SyntaxKind.JsxText: {
        const raw = node.getText(sf);
        if (pattern.test(raw)) report(node, "texto JSX", raw);
        break;
      }
      case ts.SyntaxKind.RegularExpressionLiteral: {
        const raw = node.getText(sf);
        if (pattern.test(raw)) report(node, "regex", raw);
        break;
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        if (node.expression.getText(sf).replace(/\s+/g, "") === "process.env" && pattern.test(node.name.text)) {
          report(node, "variável de ambiente", node.getText(sf));
        }
        break;
      }
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** Marca em CSS fora de comentário (ex.: `content: "…"`). */
export function scanCss(text, pattern) {
  const findings = [];
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const re = new RegExp(pattern.source, "giu");
  for (const m of stripped.matchAll(re)) findings.push({ line: lineOf(stripped, m.index), kind: "css", text: excerpt(m[0]) });
  return findings;
}

/** Marca em texto do kit, e placeholder que não resolve. */
export function scanKitText(text, pattern, brand) {
  const findings = [];
  const re = new RegExp(pattern.source, "giu");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(re)) findings.push({ line: i + 1, kind: "marca no kit", text: excerpt(line.slice(Math.max(0, m.index - 30), m.index + 50)) });
    for (const m of line.matchAll(PLACEHOLDER)) {
      if (placeholderValue(brand, m[1]) === undefined) findings.push({ line: i + 1, kind: "placeholder sem valor", text: m[0] });
    }
  });
  return findings;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (WALK_SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function readText(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null;
  return buf.toString("utf-8");
}

function rel(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

export function lintRepo(root = PKG_ROOT, { allowlist = ALLOWLIST } = {}) {
  const brand = loadBrand(root);
  const pattern = brandPattern(brand);
  const require = createRequire(path.join(root, "package.json"));
  let ts;
  try {
    ts = require("typescript");
  } catch {
    ts = createRequire(path.join(PKG_ROOT, "package.json"))("typescript");
  }
  const cliBundle = `kit/scripts/${brand.files.cli}`;
  const mcpBundle = `kit/scripts/${brand.name}-mcp.cjs`;
  const skip = new Set([BRAND_JSON, cliBundle, `${cliBundle}.map`, mcpBundle]);
  const allowed = new Map(allowlist.map((a) => [a.path, a]));
  const usedAllow = new Set();
  const findings = [];
  let files = 0;

  const add = (file, list) => {
    if (list.length === 0) return;
    if (allowed.has(file)) {
      usedAllow.add(file);
      return;
    }
    for (const f of list) findings.push({ file, ...f });
  };

  for (const dir of CODE_DIRS) {
    for (const abs of walk(path.join(root, dir))) {
      const file = rel(root, abs);
      if (skip.has(file)) continue;
      if (/\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts")) {
        files++;
        add(file, scanCode(fs.readFileSync(abs, "utf-8"), abs, pattern, ts));
      } else if (file.endsWith(".css")) {
        files++;
        add(file, scanCss(fs.readFileSync(abs, "utf-8"), pattern));
      }
    }
  }

  for (const dir of KIT_DIRS) {
    for (const abs of walk(path.join(root, dir))) {
      const file = rel(root, abs);
      if (skip.has(file)) continue;
      files++;
      const pathHits = pattern.test(file) ? [{ line: 0, kind: "marca no caminho", text: file }] : [];
      const text = readText(abs);
      add(file, [...pathHits, ...(text === null ? [] : scanKitText(text, pattern, brand))]);
    }
  }

  const stale = [...allowed.keys()].filter((p) => !usedAllow.has(p));
  return { brand: { name: brand.name, displayName: brand.displayName }, files, findings, stale };
}

function main(argv) {
  let root = PKG_ROOT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) root = path.resolve(argv[++i]);
    else {
      console.error(`brand-lint: opção desconhecida: ${argv[i]}`);
      return 2;
    }
  }
  const { brand, files, findings, stale } = lintRepo(root);
  for (const f of findings) console.log(`${f.file}:${f.line}: ${f.kind}: ${f.text}`);
  for (const s of stale) console.log(`${s}: entrada obsoleta na ALLOWLIST (nenhum literal de marca no arquivo)`);
  const marca = `${brand.displayName} (${brand.name})`;
  if (findings.length > 0 || stale.length > 0) {
    const where = new Set(findings.map((f) => f.file)).size;
    console.log(`resumo: ${findings.length} literal(is) de marca fora do brand.json em ${where} arquivo(s)${stale.length ? `, ${stale.length} entrada(s) obsoleta(s) na allowlist` : ""}; marca ${marca}; use BRAND (src/data/brand.pure.ts) no código e {{brand.*}} no kit`);
    return 1;
  }
  console.log(`resumo: nenhum literal de marca fora do brand.json; ${files} arquivo(s) de código e kit varrido(s); marca ${marca}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
