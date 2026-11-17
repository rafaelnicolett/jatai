/**
 * source-scan.ts — varredura de código-fonte pelo AST do TypeScript (o
 * `typescript` já é devDependency do host) para os testes de contrato da
 * F0.4, lane B.
 *
 * Por que AST e não regex: comentário não é código. Um `grep` por
 * `"helyx.openCockpit"` também casaria docblocks, e um path citado num
 * comentário (`.github/artifacts/execution/...md`) viraria "path que o código
 * lê". Aqui só entram literais que existem como nós de expressão/tipo.
 *
 * Nada aqui decide o que é bug — só extrai fatos. Os testes de contrato
 * comparam esses fatos com o comportamento pinado.
 *
 * Marca como dado (ADR-0013, F1.2): o código lê os nomes de marca de
 * `BRAND` (`src/data/brand.pure.ts`) em vez de escrevê-los. Uma leitura
 * `BRAND.<caminho>` (sozinha, dentro de `${…}` ou com `.toUpperCase()`)
 * vale aqui como o literal que ela produz, então os fatos extraídos não
 * mudam quando um literal vira leitura da marca.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { brandValueAt } from "../../../src/data/brand.pure";

export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

export interface Located<T> {
  value: T;
  file: string;
  line: number;
}

const sourceCache = new Map<string, ts.SourceFile>();

export function parseSource(absPath: string): ts.SourceFile {
  const cached = sourceCache.get(absPath);
  if (cached) return cached;
  const kind = absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absPath, fs.readFileSync(absPath, "utf-8"), ts.ScriptTarget.ES2022, true, kind);
  sourceCache.set(absPath, sf);
  return sf;
}

/** Todos os `.ts`/`.tsx` sob `dir` (relativo ao repo), sem testes, `.d.ts` nem `mock/`. */
export function listSourceFiles(relDir: string, opts: { includeMock?: boolean } = {}): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        if (!opts.includeMock && entry.name === "mock") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(path.join(REPO_ROOT, relDir));
  return out.sort();
}

export function rel(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function visit(node: ts.Node, fn: (n: ts.Node) => void): void {
  fn(node);
  node.forEachChild((child) => visit(child, fn));
}

/** `BRAND.a.b` → caminho `a.b`; qualquer outra expressão → `null`. */
function brandPath(node: ts.Node): string | null {
  const parts: string[] = [];
  let current: ts.Node = node;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  return ts.isIdentifier(current) && current.text === "BRAND" && parts.length > 0 ? parts.join(".") : null;
}

/** Valor de uma leitura da marca: `BRAND.<caminho>` ou `BRAND.<caminho>.toUpperCase()`. `null` se não for uma. */
export function brandReadValue(node: ts.Node): string | null {
  if (ts.isCallExpression(node) && node.arguments.length === 0 && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "toUpperCase") {
    const inner = brandPath(node.expression.expression);
    const value = inner === null ? undefined : brandValueAt(inner);
    return value === undefined ? null : value.toUpperCase();
  }
  const dotted = brandPath(node);
  return dotted === null ? null : brandValueAt(dotted) ?? null;
}

/**
 * Texto de um literal de string (ou template sem substituição); template com `${…}` vira `<expr>` no lugar de cada expressão.
 * Leitura da marca (`BRAND.<caminho>`), sozinha ou dentro de `${…}`, entra com o valor que produz.
 */
export function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => `${brandReadValue(s.expression) ?? "<expr>"}${s.literal.text}`).join("");
  }
  return brandReadValue(node);
}

/** Literais de string do arquivo, excluindo especificadores de import/export. */
export function stringLiterals(absPath: string): Array<Located<string>> {
  const sf = parseSource(absPath);
  const out: Array<Located<string>> = [];
  visit(sf, (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (n.parent && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent) || ts.isExternalModuleReference(n.parent))) return;
    if (ts.isLiteralTypeNode(n.parent ?? n)) return;
    const text = literalText(n);
    if (text !== null && !ts.isTemplateSpan(n.parent)) out.push({ value: text, file: rel(absPath), line: lineOf(sf, n) });
  });
  return out;
}

function calleeText(sf: ts.SourceFile, call: ts.CallExpression): string {
  return call.expression.getText(sf).replace(/\s+/g, "");
}

/** Chamadas cujo callee termina com `suffix` (ex.: `.registerCommand`, `executeCommand`), com os argumentos literais. */
export function callsEndingWith(absPath: string, suffix: string): Array<Located<{ callee: string; args: Array<string | null> }>> {
  const sf = parseSource(absPath);
  const out: Array<Located<{ callee: string; args: Array<string | null> }>> = [];
  visit(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const callee = calleeText(sf, n);
    if (callee !== suffix && !callee.endsWith(suffix)) return;
    out.push({ value: { callee, args: n.arguments.map((a) => literalText(a)) }, file: rel(absPath), line: lineOf(sf, n) });
  });
  return out;
}

/** Valores literais da propriedade `prop` em object literals (ex.: `command: "helyx.x"` em botões/StatusBar/CodeLens). */
export function objectPropertyLiterals(absPath: string, prop: string): Array<Located<string>> {
  const sf = parseSource(absPath);
  const out: Array<Located<string>> = [];
  visit(sf, (n) => {
    if (!ts.isPropertyAssignment(n)) return;
    const name = n.name.getText(sf).replace(/["']/g, "");
    if (name !== prop) return;
    const text = literalText(n.initializer);
    if (text !== null) out.push({ value: text, file: rel(absPath), line: lineOf(sf, n) });
  });
  return out;
}

/** Atribuições `x.prop = "literal"` (ex.: `item.command = "helyx.openCockpitNext"`). */
export function propertyAssignmentLiterals(absPath: string, prop: string): Array<Located<string>> {
  const sf = parseSource(absPath);
  const out: Array<Located<string>> = [];
  visit(sf, (n) => {
    if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
    if (!ts.isPropertyAccessExpression(n.left) || n.left.name.text !== prop) return;
    const text = literalText(n.right);
    if (text !== null) out.push({ value: text, file: rel(absPath), line: lineOf(sf, n) });
  });
  return out;
}

/**
 * Discriminantes `type: "<literal>"` de um `type Alias = A | B | …` declarado
 * no arquivo. Referências a outros aliases do MESMO arquivo são seguidas
 * (ex.: `WebviewToHostMessage` → `LegacyWebviewMessage`).
 */
export function unionTypeDiscriminants(absPath: string, aliasName: string, discriminant = "type"): string[] {
  const sf = parseSource(absPath);
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  visit(sf, (n) => {
    if (ts.isTypeAliasDeclaration(n)) aliases.set(n.name.text, n);
  });
  const out: string[] = [];
  const seen = new Set<string>();
  const collect = (typeNode: ts.TypeNode): void => {
    if (ts.isUnionTypeNode(typeNode)) {
      typeNode.types.forEach(collect);
      return;
    }
    if (ts.isParenthesizedTypeNode(typeNode)) {
      collect(typeNode.type);
      return;
    }
    if (ts.isTypeReferenceNode(typeNode)) {
      const name = typeNode.typeName.getText(sf);
      const target = aliases.get(name);
      if (target && !seen.has(name)) {
        seen.add(name);
        collect(target.type);
      }
      return;
    }
    if (ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
        if (!ts.isPropertySignature(member) || !member.type) continue;
        if (member.name.getText(sf).replace(/["']/g, "") !== discriminant) continue;
        if (ts.isLiteralTypeNode(member.type) && ts.isStringLiteral(member.type.literal)) out.push(member.type.literal.text);
      }
    }
  };
  const root = aliases.get(aliasName);
  if (!root) throw new Error(`source-scan: type alias '${aliasName}' não encontrado em ${rel(absPath)}`);
  seen.add(aliasName);
  collect(root.type);
  // Uma resposta com dois desfechos (`ok` e erro) compartilha o discriminante: conta uma vez, na ordem de declaração.
  return [...new Set(out)];
}

/** `case "<literal>":` dentro do método/função chamado `name`. */
export function caseLabelsIn(absPath: string, name: string): string[] {
  const sf = parseSource(absPath);
  const out: string[] = [];
  visit(sf, (n) => {
    const isTarget =
      (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name !== undefined && n.name.getText(sf) === name;
    if (!isTarget) return;
    visit(n, (inner) => {
      if (ts.isCaseClause(inner)) {
        const text = literalText(inner.expression);
        if (text !== null) out.push(text);
      }
    });
  });
  return out;
}

/** Literais comparados com `===` contra a expressão `lhs` (ex.: `msg.type`) dentro de `name`. */
export function equalityLiteralsIn(absPath: string, name: string, lhs: string): string[] {
  const sf = parseSource(absPath);
  const out: string[] = [];
  visit(sf, (n) => {
    const isTarget =
      (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name !== undefined && n.name.getText(sf) === name;
    if (!isTarget) return;
    visit(n, (inner) => {
      if (!ts.isBinaryExpression(inner)) return;
      if (inner.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return;
      if (inner.left.getText(sf).replace(/\s+/g, "") !== lhs) return;
      const text = literalText(inner.right);
      if (text !== null) out.push(text);
    });
  });
  return out;
}

/**
 * Valor de `type` em object literals passados como 1º argumento de chamadas
 * cujo callee termina com `calleeSuffix` (ex.: `postMessage`, `._post`).
 */
export function messageTypesSentVia(absPath: string, calleeSuffix: string): Array<Located<string>> {
  const sf = parseSource(absPath);
  const out: Array<Located<string>> = [];
  visit(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const callee = calleeText(sf, n);
    if (callee !== calleeSuffix && !callee.endsWith(calleeSuffix)) return;
    const first = n.arguments[0];
    if (!first || !ts.isObjectLiteralExpression(first)) return;
    for (const prop of first.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (prop.name.getText(sf).replace(/["']/g, "") !== "type") continue;
      const text = literalText(prop.initializer);
      if (text !== null) out.push({ value: text, file: rel(absPath), line: lineOf(sf, n) });
    }
  });
  return out;
}

/**
 * Valor de `type` em object literals guardados COMO DADO numa propriedade
 * (ex.: `message: { type: "shell/requestSnapshot" }`). Serve para mensagens que
 * um modelo puro monta e outra camada envia com `postMessage(dado)`: a varredura
 * de `messageTypesSentVia` só vê o literal passado direto à chamada.
 */
export function messageTypesInProperty(absPath: string, propertyName: string): Array<Located<string>> {
  const sf = parseSource(absPath);
  const out: Array<Located<string>> = [];
  visit(sf, (n) => {
    if (!ts.isPropertyAssignment(n) || n.name.getText(sf).replace(/["']/g, "") !== propertyName) return;
    if (!ts.isObjectLiteralExpression(n.initializer)) return;
    for (const prop of n.initializer.properties) {
      if (!ts.isPropertyAssignment(prop) || prop.name.getText(sf).replace(/["']/g, "") !== "type") continue;
      const text = literalText(prop.initializer);
      if (text !== null) out.push({ value: text, file: rel(absPath), line: lineOf(sf, n) });
    }
  });
  return out;
}

export function uniqSorted<T>(values: T[]): T[] {
  return [...new Set(values)].sort();
}
