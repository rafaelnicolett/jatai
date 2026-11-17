import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { REPO_ROOT, listSourceFiles, parseSource, rel, stringLiterals, uniqSorted } from "./helpers/source-scan";
import { initiativeDeliveryStatePath } from "../../src/data/delivery-state-contract.pure";
import { STATE_SERVICE_INFO_PATH } from "../../src/server/state-service-info";

/**
 * Paths sob `.github/artifacts/` — UM snapshot agregado. F0.4 (lane B),
 * arquitetura-e-refatoracao.md §5.3 ("Paths canônicos, espalhados por 9
 * arquivos `*.pure.ts`") e §7.1 ("Snapshot de um `ARTIFACT_PATHS` agregado").
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * Duas camadas:
 * 1. CONSTANTES (runtime): todo export de `src/data/*.pure.ts` que é um path
 *    `[".github","artifacts",…]` ou string `.github/artifacts…`, mais
 *    `initiativeDeliveryStatePath("<id>")` e o `server.json` do State Service.
 *    É o contrato canônico — o passo 3.1 move esses módulos para `core/`, e
 *    os valores não podem mudar.
 * 2. LITERAIS NO CÓDIGO (AST de `src/**`, comentário não conta): strings com
 *    `.github/artifacts…` e sequências `".github", "artifacts", …` em
 *    `path.join`/arrays — inclusive `...CONSTANTE` resolvida — com
 *    identificadores virando `<var>` e `${…}` virando `<expr>`. Pega os paths
 *    hardcoded fora das constantes (ex.: `WorkspaceStateReader`, prompts).
 *
 * O snapshot é do CONJUNTO de paths (não de onde cada um mora): mover um
 * literal para uma constante (refactor) não muda o conjunto; criar, renomear
 * ou apagar um path muda — e exige revisão.
 */

type Exported = Record<string, unknown>;

const PURE_DIR = path.join(REPO_ROOT, "src/data");
const pureFiles = fs.readdirSync(PURE_DIR).filter((f) => f.endsWith(".pure.ts")).sort();

function asArtifactPath(value: unknown): string | null {
  if (Array.isArray(value) && value.length >= 2 && value.every((v) => typeof v === "string") && value[0] === ".github" && value[1] === "artifacts") {
    return (value as string[]).join("/");
  }
  if (typeof value === "string" && value.startsWith(".github/artifacts")) return value;
  return null;
}

async function loadConstants(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const file of pureFiles) {
    const mod = (await import(path.join(PURE_DIR, file))) as Exported;
    for (const [name, value] of Object.entries(mod)) {
      const p = asArtifactPath(value);
      if (p) out[`${file.replace(/\.ts$/, "")}#${name}`] = p;
    }
  }
  out["delivery-state-contract.pure#initiativeDeliveryStatePath(<id>)"] = initiativeDeliveryStatePath("<id>").join("/");
  out["src/server/state-service-info#STATE_SERVICE_INFO_PATH"] = STATE_SERVICE_INFO_PATH.join("/");
  return out;
}

/**
 * Forma canônica para o conjunto: placeholders `<expr>`/`<var>` viram `<id>`
 * (template literal, `path.join` com variável e a função da constante passam
 * a produzir o MESMO path) e a barra final some (`dir/` == `dir`).
 */
function canonical(p: string): string {
  return p.replace(/<(expr|var)>/g, "<id>").replace(/\/+$/, "");
}

/** Tokens `.github/artifacts…` dentro de um literal (um prompt pode citar vários; `{a, b}` é expandido). */
function pathTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\.github\/artifacts[^\s`'"(),;|\\{]*(\{[^}]*\})?/g)) {
    const token = m[0];
    const brace = token.indexOf("{");
    if (brace === -1) {
      out.push(token.replace(/[.:]+$/, ""));
      continue;
    }
    const prefix = token.slice(0, brace);
    for (const item of token.slice(brace + 1, -1).split(",")) out.push(`${prefix}${item.trim()}`);
  }
  return out;
}

/** Sequências `".github", "artifacts", …` (args de chamada / elementos de array), com `...CONST` resolvida. */
function segmentRuns(absPath: string, constSegments: Map<string, string[]>): string[] {
  const sf = parseSource(absPath);
  const out: string[] = [];
  const consider = (elements: readonly ts.Node[]): void => {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]!;
      let segments: string[] | null = null;
      if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression)) {
        const resolved = constSegments.get(el.expression.text);
        if (resolved) segments = [...resolved];
      } else if (ts.isStringLiteral(el) && el.text === ".github") {
        const next = elements[i + 1];
        if (next && ts.isStringLiteral(next) && next.text === "artifacts") segments = [];
      }
      if (segments === null) continue;
      let j = i;
      if (segments.length === 0) {
        segments.push(".github", "artifacts");
        j = i + 1;
      }
      for (let k = j + 1; k < elements.length; k++) {
        const e = elements[k]!;
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) segments.push(e.text);
        else if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) segments.push("<var>");
        else break;
      }
      out.push(segments.join("/"));
      break;
    }
  };
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) consider(n.arguments);
    if (ts.isArrayLiteralExpression(n)) consider(n.elements);
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

async function scanCode(constants: Record<string, string>): Promise<Map<string, Set<string>>> {
  const constSegments = new Map<string, string[]>();
  for (const [key, value] of Object.entries(constants)) {
    const name = key.split("#")[1]!;
    if (/^[A-Z_]+$/.test(name)) constSegments.set(name, value.split("/"));
  }
  const found = new Map<string, Set<string>>();
  const add = (raw: string, file: string): void => {
    const p = canonical(raw);
    if (!found.has(p)) found.set(p, new Set());
    found.get(p)!.add(file);
  };
  for (const file of listSourceFiles("src")) {
    for (const lit of stringLiterals(file)) for (const p of pathTokens(lit.value)) add(p, lit.file);
    for (const p of segmentRuns(file, constSegments)) add(p, rel(file));
  }
  return found;
}

describe("contrato — paths sob .github/artifacts/", () => {
  it("snapshot das CONSTANTES de path (módulo#export → path)", async () => {
    const constants = await loadConstants();
    expect(constants).toMatchSnapshot();
  });

  it("toda constante de path de src/data/*.pure.ts está coberta (nenhum arquivo .pure.ts novo com path escapa do snapshot)", async () => {
    const constants = await loadConstants();
    const modules = uniqSorted(Object.keys(constants).map((k) => k.split("#")[0]!)).filter((m) => m.endsWith(".pure"));
    expect(modules).toEqual([
      "context-repos-contract.pure",
      "delivery-state-contract.pure",
      "foundation-state-contract.pure",
      "initiatives-contract.pure",
      "operations-contract.pure",
      "repo-graph-contract.pure",
      "repos-contract.pure",
      "run-events-contract.pure",
    ]);
  });

  it("snapshot AGREGADO de todo path sob .github/artifacts/ que o código lê, escreve ou manda o agente escrever", async () => {
    const constants = await loadConstants();
    const scanned = await scanCode(constants);
    const all = uniqSorted([...Object.values(constants).map(canonical), ...scanned.keys()]);
    const detail = JSON.stringify([...scanned.entries()].map(([p, files]) => ({ p, files: [...files] })), null, 2);
    expect(all, detail).toMatchSnapshot();
  });

  it("paths que só existem como literal hardcoded (fora das constantes) — inventário para o passo 3.1 / CH6", async () => {
    const constants = await loadConstants();
    const scanned = await scanCode(constants);
    const fromConstants = new Set(Object.values(constants).map(canonical));
    const onlyHardcoded = [...scanned.keys()].filter((p) => !fromConstants.has(p)).sort();
    expect(onlyHardcoded).toMatchSnapshot();
  });

  // Behavior pinned on 2026-11-14 — C2 / H-BUG-02. O path por iniciativa é
  // montado com o id CRU, sem validar slug: o mesmo id com aspas (o que os
  // leitores por regex extraem de `active: "x"`) gera OUTRA pasta.
  it('@known-bug: initiativeDeliveryStatePath aceita o id com aspas e gera uma pasta diferente — base do split-brain (C2 / H-BUG-02)', () => {
    expect(initiativeDeliveryStatePath("loja-demo").join("/")).toBe(".github/artifacts/initiatives/loja-demo/delivery-state.yaml");
    expect(initiativeDeliveryStatePath('"loja-demo"').join("/")).toBe('.github/artifacts/initiatives/"loja-demo"/delivery-state.yaml');
  });
});
