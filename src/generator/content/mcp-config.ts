/**
 * mcp-config.ts
 *
 * As duas configurações MCP que o kit escreve no workspace (ADR-0025) e o
 * merge por nome com o que o time já declarou. Funções puras, sem fs.
 *
 * Formatos (documentação oficial conferida em 2026-11-16):
 * - Claude Code, `.mcp.json` na raiz: `{ "mcpServers": { <nome>: { command,
 *   args, env } } }`. Num `.mcp.json` de projeto, a raiz do projeto entra em
 *   `command`/`args` como `${CLAUDE_PROJECT_DIR:-.}` (code.claude.com/docs/en/mcp).
 *   O harness Copilot do VS Code também lê esse arquivo, com o mesmo
 *   `mcpServers` (code.visualstudio.com/docs/agents/reference/mcp-configuration).
 * - VS Code, `.vscode/mcp.json`: `{ "servers": { <nome>: { type: "stdio",
 *   command, args, cwd } } }`, com `${workspaceFolder}` (mesma página). É o
 *   formato do harness Local do VS Code.
 *
 * Nos dois, o servidor é o bundle do kit em `.github/scripts/`, por caminho
 * relativo ao workspace: nada absoluto, nada que mude por máquina ou por
 * versão da extensão.
 */

import { BRAND } from "../../data/brand.pure";

/** Pasta do workspace onde o kit instala os bundles (CLI e servidor MCP). */
export const KIT_SCRIPTS_DIR = ".github/scripts";

export interface McpConfigFile {
  /** Caminho relativo à raiz do workspace. */
  readonly path: string;
  /** Chave de topo que mapeia nome → servidor. */
  readonly serversKey: "mcpServers" | "servers";
  /** A entrada do servidor da marca, dado o nome do bundle. */
  entry(bundle: string): Record<string, unknown>;
}

/** Nome do servidor da marca nas duas configurações (as tools viram `mcp__<nome>__*` no Claude Code). */
export const MCP_SERVER_KEY = BRAND.name;

export const MCP_CONFIG_FILES: readonly McpConfigFile[] = [
  {
    path: ".mcp.json",
    serversKey: "mcpServers",
    entry: (bundle) => ({ type: "stdio", command: "node", args: [`\${CLAUDE_PROJECT_DIR:-.}/${KIT_SCRIPTS_DIR}/${bundle}`] }),
  },
  {
    path: ".vscode/mcp.json",
    serversKey: "servers",
    entry: (bundle) => ({ type: "stdio", command: "node", args: [`\${workspaceFolder}/${KIT_SCRIPTS_DIR}/${bundle}`], cwd: "${workspaceFolder}" }),
  },
];

export type McpMergeResult =
  | { readonly kind: "write"; readonly text: string }
  | { readonly kind: "unchanged" }
  | { readonly kind: "unreadable"; readonly reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A indentação do arquivo do time (a da primeira linha indentada); sem nenhuma, 2 espaços. */
function indentOf(text: string): string | number {
  const m = /\n([ \t]+)\S/.exec(text);
  return m ? m[1]! : 2;
}

/**
 * Põe (ou atualiza) o servidor da marca em `current`, sem tocar no resto:
 * outros servidores e outras chaves de topo ficam como estão, na mesma ordem.
 *
 * - arquivo ausente ou vazio: nasce só com o servidor da marca;
 * - a entrada da marca já igual: `unchanged` (a migração é idempotente);
 * - texto que não é JSON puro (comentários, vírgula sobrando) ou que não
 *   tem a forma esperada: `unreadable`, e quem chama não grava nada. O
 *   `.vscode/mcp.json` aceita comentários (JSONC), e regravá-lo perderia o
 *   que o time escreveu.
 */
export function mergeMcpConfig(current: string | null, file: McpConfigFile, bundle: string): McpMergeResult {
  const entry = file.entry(bundle);
  if (current === null || current.trim() === "") {
    return { kind: "write", text: `${JSON.stringify({ [file.serversKey]: { [MCP_SERVER_KEY]: entry } }, null, 2)}\n` };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(current);
  } catch (err) {
    return { kind: "unreadable", reason: `não é JSON puro (${(err as Error).message})` };
  }
  if (!isPlainObject(doc)) return { kind: "unreadable", reason: "o topo não é um objeto" };
  const servers = doc[file.serversKey] ?? {};
  if (!isPlainObject(servers)) return { kind: "unreadable", reason: `"${file.serversKey}" não é um objeto` };
  if (JSON.stringify(servers[MCP_SERVER_KEY]) === JSON.stringify(entry)) return { kind: "unchanged" };

  const merged = { ...doc, [file.serversKey]: { ...servers, [MCP_SERVER_KEY]: entry } };
  const eol = current.endsWith("\n") ? "\n" : "";
  return { kind: "write", text: `${JSON.stringify(merged, null, indentOf(current))}${eol}` };
}
