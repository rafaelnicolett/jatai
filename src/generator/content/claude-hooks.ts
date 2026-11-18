/**
 * claude-hooks.ts
 *
 * Hooks de projeto do Claude Code que registram a atividade dos agentes
 * (contrato agent-activity §4, "hooks do kit"). Funções puras, sem fs.
 *
 * Nomes dos eventos de hook conferidos na documentação oficial em
 * 2026-11-16 (code.claude.com/docs/en/hooks): `SubagentStart` e
 * `SubagentStop` (entrada com `agent_type`, o `name` do agente) e
 * `PostToolUse` (entrada com `tool_input.file_path`, sempre absoluto).
 * O comando roda em segundo plano (`async: true`), sem segurar o agente.
 *
 * O Claude Code passa o aviso como JSON no stdin, e o registro de atividade é
 * o verbo `runs append` do CLI de estado, que recebe flags. Quem faz a ponte
 * é o relé `.github/scripts/<marca>-hook.cjs`, gerado aqui como texto (como o
 * atalho do CLI legado): lê o stdin, filtra e chama
 * `node .github/scripts/<cli> runs append …` com as flags do contrato.
 *
 * Dependência: o verbo `runs append` é da frente G (onda 5). As flags que o
 * relé usa estão em `RUNS_APPEND_FLAGS`, num lugar só.
 */

import { BRAND, type Brand } from "../../data/brand.pure";
import { RUNS_DIR } from "../../core/contracts/run-events-contract.pure";
import { STATE_SERVICE_INFO_PATH } from "../../server/state-service-info";
import { KIT_SCRIPTS_DIR } from "./mcp-config";

/** Raiz dos artefatos do delivery: só gravações aqui viram `artifact-written`. */
const ARTIFACTS_PREFIX = `${RUNS_DIR.slice(0, -1).join("/")}/`;

/**
 * Pastas dos artefatos que não contam: `runs/` é o próprio registro de
 * atividade, e `.state-service/` é estado efêmero do State Service.
 */
const IGNORED_PREFIXES = [`${RUNS_DIR.join("/")}/`, `${STATE_SERVICE_INFO_PATH.slice(0, -1).join("/")}/`];

/** Campos do contrato agent-activity que o relé preenche → flag do `runs append`. */
export const RUNS_APPEND_FLAGS = {
  event_type: "--event-type",
  agent_id: "--agent-id",
  artifact_path: "--artifact-path",
  harness: "--harness",
} as const;

/** Tipos de evento que os hooks produzem, por evento de hook do Claude Code. */
export const CLAUDE_HOOK_EVENTS = [
  { hook: "SubagentStart", event: "agent-started", matcher: null },
  { hook: "SubagentStop", event: "agent-done", matcher: null },
  { hook: "PostToolUse", event: "artifact-written", matcher: "Write|Edit|MultiEdit|NotebookEdit" },
] as const;

/** Nome do relé em `.github/scripts/`. */
export function hookRelayFile(brand: Brand = BRAND): string {
  return `${brand.name}-hook.cjs`;
}

/** O comando de cada hook (forma shell; o Claude Code substitui `${CLAUDE_PROJECT_DIR}`). */
export function hookCommand(event: string, brand: Brand = BRAND): string {
  return `node "\${CLAUDE_PROJECT_DIR}/${KIT_SCRIPTS_DIR}/${hookRelayFile(brand)}" ${event}`;
}

interface HookHandler {
  type: "command";
  command: string;
  async: true;
  timeout: number;
}
interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
}

/** O grupo de hooks do kit para um evento de hook. */
function kitGroup(event: (typeof CLAUDE_HOOK_EVENTS)[number], brand: Brand): HookGroup {
  const handler: HookHandler = { type: "command", command: hookCommand(event.event, brand), async: true, timeout: 30 };
  return event.matcher === null ? { hooks: [handler] } : { matcher: event.matcher, hooks: [handler] };
}

export type SettingsMergeResult =
  | { readonly kind: "write"; readonly text: string }
  | { readonly kind: "unchanged" }
  | { readonly kind: "unreadable"; readonly reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function indentOf(text: string): string | number {
  const m = /\n([ \t]+)\S/.exec(text);
  return m ? m[1]! : 2;
}

/**
 * Põe os hooks do kit no `.claude/settings.json`, sem tocar no resto:
 * permissões, variáveis, outros hooks e a ordem das chaves ficam como estão.
 * Um hook do kit é reconhecido pelo relé no comando; os antigos saem e os
 * atuais entram no fim da lista do evento, uma vez só. Texto que não é JSON
 * puro ou com a forma errada: `unreadable`, e quem chama não grava nada.
 */
export function mergeClaudeSettings(current: string | null, brand: Brand = BRAND): SettingsMergeResult {
  const relay = `${KIT_SCRIPTS_DIR}/${hookRelayFile(brand)}`;
  let doc: Record<string, unknown> = {};
  const empty = current === null || current.trim() === "";
  if (!empty) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(current);
    } catch (err) {
      return { kind: "unreadable", reason: `não é JSON puro (${(err as Error).message})` };
    }
    if (!isPlainObject(parsed)) return { kind: "unreadable", reason: "o topo não é um objeto" };
    doc = parsed;
  }
  const hooks = doc.hooks ?? {};
  if (!isPlainObject(hooks)) return { kind: "unreadable", reason: '"hooks" não é um objeto' };

  const merged: Record<string, unknown> = { ...hooks };
  for (const event of CLAUDE_HOOK_EVENTS) {
    const groups = hooks[event.hook] ?? [];
    if (!Array.isArray(groups)) return { kind: "unreadable", reason: `"hooks.${event.hook}" não é uma lista` };
    const kept: unknown[] = [];
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
        kept.push(group);
        continue;
      }
      const theirs = group.hooks.filter((h) => !(isPlainObject(h) && typeof h.command === "string" && h.command.includes(relay)));
      if (theirs.length === group.hooks.length) kept.push(group);
      else if (theirs.length > 0) kept.push({ ...group, hooks: theirs });
    }
    merged[event.hook] = [...kept, kitGroup(event, brand)];
  }

  const next = { ...doc, hooks: merged };
  if (!empty && JSON.stringify(next) === JSON.stringify(doc)) return { kind: "unchanged" };
  const eol = empty || current.endsWith("\n") ? "\n" : "";
  return { kind: "write", text: `${JSON.stringify(next, null, empty ? 2 : indentOf(current))}${eol}` };
}

/**
 * Remove os hooks do kit do `.claude/settings.json`, preservando permissões,
 * variáveis, outros hooks e a ordem das chaves. Espelho do merge, usado pelo
 * `uninstall`. Arquivo que não parseia fica como está (`unreadable`).
 */
export function removeClaudeSettingsHooks(current: string | null, brand: Brand = BRAND): SettingsMergeResult {
  if (current === null || current.trim() === "") return { kind: "unchanged" };
  const relay = `${KIT_SCRIPTS_DIR}/${hookRelayFile(brand)}`;
  let doc: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(current);
    if (!isPlainObject(parsed)) return { kind: "unreadable", reason: "o topo não é um objeto" };
    doc = parsed;
  } catch (err) {
    return { kind: "unreadable", reason: `não é JSON puro (${(err as Error).message})` };
  }
  const hooks = doc.hooks;
  if (hooks === undefined) return { kind: "unchanged" };
  if (!isPlainObject(hooks)) return { kind: "unreadable", reason: '"hooks" não é um objeto' };

  const merged: Record<string, unknown> = { ...hooks };
  let changed = false;
  for (const event of CLAUDE_HOOK_EVENTS) {
    const groups = hooks[event.hook];
    if (groups === undefined) continue;
    if (!Array.isArray(groups)) return { kind: "unreadable", reason: `"hooks.${event.hook}" não é uma lista` };
    const kept: unknown[] = [];
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
        kept.push(group);
        continue;
      }
      const theirs = group.hooks.filter((h) => !(isPlainObject(h) && typeof h.command === "string" && h.command.includes(relay)));
      if (theirs.length === group.hooks.length) kept.push(group);
      else if (theirs.length > 0) kept.push({ ...group, hooks: theirs });
      else changed = true;
      if (theirs.length < group.hooks.length) changed = true;
    }
    if (kept.length === 0) delete merged[event.hook];
    else merged[event.hook] = kept;
  }
  if (!changed) return { kind: "unchanged" };
  const eol = current.endsWith("\n") ? "\n" : "";
  return { kind: "write", text: `${JSON.stringify({ ...doc, hooks: merged }, null, indentOf(current))}${eol}` };
}

/**
 * O relé `.github/scripts/<marca>-hook.cjs`. Recebe o tipo de evento no
 * argumento e o aviso do Claude Code no stdin. Só repassa o nome do agente
 * (`agent_type`) e, na gravação, o caminho relativo do artefato: nunca
 * conteúdo de arquivo, prompt ou saída de ferramenta (contrato §2.3). Grava
 * nos artefatos do delivery contam; `runs/` e `.state-service/` não (são do
 * próprio registro e do State Service). Sai sempre com 0: o hook nunca
 * atrapalha o agente.
 */
export function claudeHookRelay(brand: Brand = BRAND): string {
  const file = hookRelayFile(brand);
  return [
    "#!/usr/bin/env node",
    `// ${file}: gerado pela ${brand.displayName} (contrato agent-activity). Os hooks de projeto`,
    "// do Claude Code (.claude/settings.json) chamam este arquivo com o tipo de evento; ele lê",
    `// o aviso do Claude Code (JSON no stdin) e o repassa ao CLI de estado, nesta mesma pasta:`,
    `// node ${brand.files.cli} runs append. Só passa o nome do agente e o caminho do artefato,`,
    "// nunca conteúdo. E sai sempre com 0: o hook nunca atrapalha o agente.",
    '"use strict";',
    'const fs = require("fs");',
    'const path = require("path");',
    'const { spawnSync } = require("child_process");',
    `const CLI = path.join(__dirname, ${JSON.stringify(brand.files.cli)});`,
    `const FLAGS = ${JSON.stringify(RUNS_APPEND_FLAGS)};`,
    `const EVENTS = ${JSON.stringify(CLAUDE_HOOK_EVENTS.map((e) => e.event))};`,
    `const ARTIFACTS = ${JSON.stringify(ARTIFACTS_PREFIX)};`,
    `const IGNORED = ${JSON.stringify(IGNORED_PREFIXES)};`,
    "",
    "function main() {",
    "  const event = process.argv[2];",
    "  if (!EVENTS.includes(event)) return;",
    "  let input = {};",
    "  try {",
    '    input = JSON.parse(fs.readFileSync(0, "utf-8"));',
    "  } catch {",
    "    return;",
    "  }",
    '  const agent = typeof input.agent_type === "string" ? input.agent_type : "";',
    "  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();",
    '  const args = ["runs", "append", FLAGS.event_type, event, FLAGS.harness, "claude-code"];',
    '  if (event === "artifact-written") {',
    "    const tool = input.tool_input || {};",
    "    const file = tool.file_path || tool.notebook_path;",
    '    if (typeof file !== "string") return;',
    '    const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");',
    "    if (!rel.startsWith(ARTIFACTS) || IGNORED.some((p) => rel.startsWith(p))) return;",
    "    args.push(FLAGS.artifact_path, rel);",
    "    if (agent) args.push(FLAGS.agent_id, agent);",
    "  } else {",
    "    if (!agent) return;",
    "    args.push(FLAGS.agent_id, agent);",
    "  }",
    '  spawnSync(process.execPath, [CLI, ...args], { cwd: root, stdio: "ignore", timeout: 20000 });',
    "}",
    "",
    "try {",
    "  main();",
    "} catch {",
    "  // o registro de atividade é melhor esforço",
    "}",
    "process.exit(0);",
    "",
  ].join("\n");
}
