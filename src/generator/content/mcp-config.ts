/**
 * mcp-config.ts
 *
 * As configurações MCP que o kit escreve no workspace (ADR-0025 e epic-9) e o
 * merge por nome com o que o time já declarou. Funções puras, sem fs.
 *
 * Formatos (documentação oficial conferida em 2026-11-16/17):
 * - Claude Code, `.mcp.json` na raiz: `{ "mcpServers": { <nome>: { command,
 *   args, env } } }`. Num `.mcp.json` de projeto, a raiz do projeto entra em
 *   `command`/`args` como `${CLAUDE_PROJECT_DIR:-.}` (code.claude.com/docs/en/mcp).
 *   O harness Copilot do VS Code também lê esse arquivo, com o mesmo
 *   `mcpServers` (code.visualstudio.com/docs/agents/reference/mcp-configuration).
 * - VS Code, `.vscode/mcp.json`: `{ "servers": { <nome>: { type: "stdio",
 *   command, args, cwd } } }`, com `${workspaceFolder}` (mesma página). É o
 *   formato do harness Local do VS Code.
 * - OpenCode 2.x, `opencode.json(c)`: `{ "mcp": { "servers": { <nome>: {
 *   type: "local", command: ["node", "<caminho>"], cwd: "." } } } }`
 *   (opencode.ai/docs/mcp-servers). O caminho é relativo ao workspace; não
 *   existe `${workspaceFolder}`.
 *
 * Nos três, o servidor é o bundle do kit em `.github/scripts/`, por caminho
 * relativo ao workspace: nada absoluto, nada que mude por máquina ou por
 * versão da extensão.
 */

import { applyEdits, modify, parse, type ParseError } from "jsonc-parser/lib/esm/main.js";
import { BRAND } from "../../data/brand.pure";

/** Pasta do workspace onde o kit instala os bundles (CLI e servidor MCP). */
export const KIT_SCRIPTS_DIR = ".github/scripts";

/** Schema público do config do OpenCode (o `$schema` é opcional, mas ajuda o editor). */
export const OPENCODE_CONFIG_SCHEMA = "https://opencode.ai/config.json";

export interface McpConfigFile {
  /** Caminho relativo à raiz do workspace (o instalador pode resolvê-lo melhor). */
  readonly path: string;
  /** Caminho até o mapa nome → servidor. `.mcp.json` usa `["mcpServers"]`; OpenCode usa `["mcp","servers"]`. */
  readonly serversPath: readonly string[];
  /** `json` mantém o merge byte-a-byte histórico; `jsonc` preserva comentários via jsonc-parser. Default: `json`. */
  readonly format?: "json" | "jsonc";
  /** A entrada do servidor da marca, dado o nome do bundle. */
  entry(bundle: string): Record<string, unknown>;
}

/** Nome do servidor da marca nas configurações (as tools viram `mcp__<nome>__*` no Claude Code e `<nome>_*` no OpenCode). */
export const MCP_SERVER_KEY = BRAND.name;

export const MCP_CONFIG_FILES: readonly McpConfigFile[] = [
  {
    path: ".mcp.json",
    serversPath: ["mcpServers"],
    entry: (bundle) => ({ type: "stdio", command: "node", args: [`\${CLAUDE_PROJECT_DIR:-.}/${KIT_SCRIPTS_DIR}/${bundle}`] }),
  },
  {
    path: ".vscode/mcp.json",
    serversPath: ["servers"],
    entry: (bundle) => ({ type: "stdio", command: "node", args: [`\${workspaceFolder}/${KIT_SCRIPTS_DIR}/${bundle}`], cwd: "${workspaceFolder}" }),
  },
];

/** Config do OpenCode 2.x: `mcp.servers.<nome>`, com `command` em array e `cwd` relativo. */
export const OPENCODE_MCP_CONFIG: McpConfigFile = {
  path: "opencode.json",
  serversPath: ["mcp", "servers"],
  format: "jsonc",
  entry: (bundle) => ({ type: "local", command: ["node", `${KIT_SCRIPTS_DIR}/${bundle}`], cwd: "." }),
};

export type McpMergeResult =
  | { readonly kind: "write"; readonly text: string }
  | { readonly kind: "unchanged" }
  | { readonly kind: "unreadable"; readonly reason: string };

export type McpRemoveResult = McpMergeResult;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A indentação do arquivo do time (a da primeira linha indentada); sem nenhuma, 2 espaços. */
function indentOf(text: string): string | number {
  const m = /\n([ \t]+)\S/.exec(text);
  return m ? m[1]! : 2;
}

function formattingOf(text: string): { insertSpaces: boolean; tabSize: number } {
  const indent = indentOf(text);
  if (typeof indent === "number") return { insertSpaces: true, tabSize: indent };
  return { insertSpaces: !indent.includes("\t"), tabSize: Math.max(1, indent.length) };
}

/** O valor no caminho, ou `undefined` se algum nível não existir. */
function valueAt(root: unknown, path: readonly string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (!isPlainObject(cur) || !(key in cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** `true` se o valor existente no caminho já é igual à entrada da marca. */
function isSameEntry(doc: unknown, file: McpConfigFile, entry: Record<string, unknown>): boolean {
  return JSON.stringify(valueAt(doc, [...file.serversPath, MCP_SERVER_KEY])) === JSON.stringify(entry);
}

/**
 * `true` se o caminho pode receber a entrada: os níveis intermediários que
 * existem precisam ser objetos. Um nível ausente é criado pelo merge.
 */
function pathIsObject(root: unknown, path: readonly string[]): boolean {
  let cur: unknown = root;
  for (const key of path) {
    if (!isPlainObject(cur)) return false;
    if (!(key in cur)) return true;
    cur = cur[key];
  }
  return true;
}

/**
 * Põe (ou atualiza) o servidor da marca em `current`, sem tocar no resto:
 * outros servidores e outras chaves de topo ficam como estão, na mesma ordem.
 *
 * - arquivo ausente ou vazio: nasce com o servidor da marca (e, no OpenCode,
 *   com o `$schema`);
 * - a entrada da marca já igual: `unchanged` (a migração é idempotente);
 * - texto que não é JSON/JSONC puro ou que não tem a forma esperada:
 *   `unreadable`, e quem chama não grava nada.
 */
export function mergeMcpConfig(current: string | null, file: McpConfigFile, bundle: string): McpMergeResult {
  const entry = file.entry(bundle);
  if (file.format === "jsonc") return mergeJsoncMcpConfig(current, file, entry);

  if (current === null || current.trim() === "") {
    const root = buildRoot(file, entry);
    return { kind: "write", text: `${JSON.stringify(root, null, 2)}\n` };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(current);
  } catch (err) {
    return { kind: "unreadable", reason: `não é JSON puro (${(err as Error).message})` };
  }
  if (!isPlainObject(doc)) return { kind: "unreadable", reason: "o topo não é um objeto" };
  if (!pathIsObject(doc, file.serversPath)) {
    return { kind: "unreadable", reason: `"${file.serversPath.join(".")}" não é um objeto` };
  }
  if (isSameEntry(doc, file, entry)) return { kind: "unchanged" };

  const merged = setEntry(doc, file.serversPath, MCP_SERVER_KEY, entry);
  const eol = current.endsWith("\n") ? "\n" : "";
  return { kind: "write", text: `${JSON.stringify(merged, null, indentOf(current))}${eol}` };
}

/** Copia `root` criando/atualizando o caminho; preserva a ordem das chaves existentes. */
function setEntry(root: Record<string, unknown>, path: readonly string[], key: string, entry: Record<string, unknown>): Record<string, unknown> {
  if (path.length === 0) return { ...root, [key]: entry };
  const [head, ...rest] = path;
  const child = isPlainObject(root[head!]) ? root[head!] : {};
  return { ...root, [head!]: setEntry(child as Record<string, unknown>, rest, key, entry) };
}

function buildRoot(file: McpConfigFile, entry: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = file.format === "jsonc" ? { $schema: OPENCODE_CONFIG_SCHEMA } : {};
  let cur = root;
  for (let i = 0; i < file.serversPath.length; i++) {
    const key = file.serversPath[i]!;
    if (i === file.serversPath.length - 1) cur[key] = { [MCP_SERVER_KEY]: entry };
    else cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  return root;
}

/**
 * Merge do OpenCode: JSONC com comentários e vírgulas à direita. O
 * `jsonc-parser` edita só o caminho `mcp.servers.<marca>` e preserva o resto
 * do arquivo (comentários, ordem, formatação). Arquivo que não parseia fica
 * como está, com aviso — nunca é sobrescrito no escuro.
 */
function mergeJsoncMcpConfig(current: string | null, file: McpConfigFile, entry: Record<string, unknown>): McpMergeResult {
  if (current === null || current.trim() === "") {
    return { kind: "write", text: `${JSON.stringify(buildRoot(file, entry), null, 2)}\n` };
  }
  const errors: ParseError[] = [];
  const doc: unknown = parse(current, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) return { kind: "unreadable", reason: `não é JSONC válido (${errors.length} erro(s))` };
  if (!isPlainObject(doc)) return { kind: "unreadable", reason: "o topo não é um objeto" };
  if (!pathIsObject(doc, file.serversPath)) {
    return { kind: "unreadable", reason: `"${file.serversPath.join(".")}" não é um objeto` };
  }
  if (isSameEntry(doc, file, entry)) return { kind: "unchanged" };

  const edits = modify(current, [...file.serversPath, MCP_SERVER_KEY], entry, {
    formattingOptions: formattingOf(current),
  });
  if (edits.length === 0) return { kind: "unchanged" };
  return { kind: "write", text: applyEdits(current, edits) };
}

/** Cópia de `root` sem a chave no caminho; `found` diz se a chave existia. */
function removeEntry(root: Record<string, unknown>, path: readonly string[], key: string): { found: boolean; value: Record<string, unknown> } {
  if (path.length === 0) {
    if (!(key in root)) return { found: false, value: root };
    const next = { ...root };
    delete next[key];
    return { found: true, value: next };
  }
  const [head, ...rest] = path;
  const child = root[head!];
  if (!isPlainObject(child)) return { found: false, value: root };
  const removed = removeEntry(child, rest, key);
  if (!removed.found) return { found: false, value: root };
  return { found: true, value: { ...root, [head!]: removed.value } };
}

/**
 * Remove só a entrada da marca de uma configuração MCP, preservando o resto
 * (outros servidores, chaves de topo, comentários). Usado pelo `uninstall`.
 * Arquivo que não parseia não é tocado (`unreadable`).
 */
export function removeMcpServer(current: string | null, file: McpConfigFile): McpRemoveResult {
  if (current === null || current.trim() === "") return { kind: "unchanged" };
  if (file.format === "jsonc") {
    const errors: ParseError[] = [];
    const doc: unknown = parse(current, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length > 0) return { kind: "unreadable", reason: `não é JSONC válido (${errors.length} erro(s))` };
    if (!isPlainObject(doc)) return { kind: "unreadable", reason: "o topo não é um objeto" };
    if (!pathIsObject(doc, file.serversPath)) return { kind: "unreadable", reason: `"${file.serversPath.join(".")}" não é um objeto` };
    if (valueAt(doc, [...file.serversPath, MCP_SERVER_KEY]) === undefined) return { kind: "unchanged" };
    const edits = modify(current, [...file.serversPath, MCP_SERVER_KEY], undefined, {
      formattingOptions: formattingOf(current),
    });
    if (edits.length === 0) return { kind: "unchanged" };
    return { kind: "write", text: applyEdits(current, edits) };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(current);
  } catch (err) {
    return { kind: "unreadable", reason: `não é JSON puro (${(err as Error).message})` };
  }
  if (!isPlainObject(doc)) return { kind: "unreadable", reason: "o topo não é um objeto" };
  if (!pathIsObject(doc, file.serversPath)) return { kind: "unreadable", reason: `"${file.serversPath.join(".")}" não é um objeto` };
  const removed = removeEntry(doc, file.serversPath, MCP_SERVER_KEY);
  if (!removed.found) return { kind: "unchanged" };
  const eol = current.endsWith("\n") ? "\n" : "";
  return { kind: "write", text: `${JSON.stringify(removed.value, null, indentOf(current))}${eol}` };
}
