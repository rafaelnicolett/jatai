/**
 * uninstall.ts — `jatai uninstall` (Wave 2).
 *
 * Remove SÓ o que o kit instalou, usando o `.github/kit.lock.json`:
 * - arquivo do kit intacto sai;
 * - arquivo do kit alterado pelo time fica (com aviso);
 * - `agents/domain/`, `skills/coding-guidelines-*`, `.github/artifacts/`,
 *   `docs/input/`, `repos/` e o config do workspace nunca são tocados;
 * - MCP: remove só a entrada da marca, preservando outros servidores;
 * - Claude: remove só os hooks do kit do `.claude/settings.json`;
 * - o lock fica se algum arquivo do time foi preservado (para nova tentativa).
 */

import * as path from "node:path";
import { existsSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { BRAND } from "../data/brand.pure";
import { type HarnessAdapter } from "../generator/harness/HarnessAdapter";
import { findHarness } from "../generator/harness/harnesses";
import { collectClientEdits, readKitLock } from "../generator/install/kit-lock";
import { KIT_SCRIPTS_DIR, removeMcpServer, type McpConfigFile } from "../generator/content/mcp-config";
import { hookRelayFile, removeClaudeSettingsHooks } from "../generator/content/claude-hooks";
import { MCP_BUNDLE } from "../generator/install/kit-root";
import { opencodeConfigPath } from "../generator/install/mcp-installer";
import { OPENCODE_PLUGINS_DIR } from "../generator/install/opencode-activity-installer";
import { openCodeActivityPluginFile } from "../generator/content/opencode-activity-plugin";
import { atomicWrite } from "../state/lock/atomic-write";
import { CliError } from "./errors";
import { detectHost } from "./host";
import { confirm, type CliIO } from "./io";

export interface UninstallOptions {
  readonly dir?: string;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly json?: boolean;
}

const PROTECTED = [
  "agents/domain/",
  "skills/coding-guidelines-",
  ".github/artifacts/",
  "docs/input/",
  "repos/",
  ".git/",
  "node_modules/",
];

function isProtected(rel: string): boolean {
  return PROTECTED.some((prefix) => rel.startsWith(prefix) || rel.includes(`/${prefix}`));
}

function resolveMcp(root: string, host: HarnessAdapter, index: number): { rel: string; file: McpConfigFile } {
  const file = host.mcpConfigs[index]!;
  return { rel: file.format === "jsonc" ? opencodeConfigPath(root) : file.path, file };
}

function pruneEmpty(root: string, rel: string): void {
  try {
    rmdirSync(path.join(root, ...rel.split("/")));
  } catch { /* não existe ou não está vazio */ }
}

export async function runUninstall(opts: UninstallOptions, io: CliIO, cwd: string): Promise<number> {
  const root = path.resolve(cwd, opts.dir ?? ".");
  if (!existsSync(root)) throw new CliError("DIR_NOT_FOUND", `Diretório não encontrado: ${root}`, 1);
  const lock = readKitLock(root);
  if (!lock) {
    throw new CliError(
      "NO_LOCK",
      "Sem .github/kit.lock.json: o uninstall não sabe o que é do kit. Rode update (com --yes) para criar o lock ou remova à mão.",
      2
    );
  }

  const detected = detectHost(root);
  const host = findHarness(lock.harness) ?? detected.host;
  if (!host) throw new CliError("HOST_UNKNOWN", `Harness do lock inválido: ${lock.harness}`, 2);

  const edits = collectClientEdits(root, lock);
  const removed: string[] = [];
  const preserved: string[] = [];
  const errors: string[] = [];

  const planned = Object.keys(lock.files).sort().filter((rel) => existsSync(path.join(root, ...rel.split("/"))));
  const toRemove: string[] = [];
  for (const rel of planned) {
    if (isProtected(rel)) {
      preserved.push(rel);
      continue;
    }
    if (edits.has(rel)) {
      preserved.push(rel);
      continue;
    }
    toRemove.push(rel);
  }

  const generated = [
    `${KIT_SCRIPTS_DIR}/${BRAND.files.cli}`,
    `${KIT_SCRIPTS_DIR}/${MCP_BUNDLE}`,
    `${KIT_SCRIPTS_DIR}/${hookRelayFile()}`,
    `${OPENCODE_PLUGINS_DIR}/${openCodeActivityPluginFile()}`,
  ].filter((rel) => existsSync(path.join(root, ...rel.split("/"))));

  const mcpTouched: string[] = [];
  const hookTouched: string[] = [];

  if (opts.dryRun) {
    const mcpPreview: string[] = [];
    for (let i = 0; i < host.mcpConfigs.length; i++) {
      const { rel, file } = resolveMcp(root, host, i);
      const full = path.join(root, ...rel.split("/"));
      if (!existsSync(full)) continue;
      try {
        if (removeMcpServer(readFileSync(full, "utf-8"), file).kind === "write") mcpPreview.push(rel);
      } catch { /* preview best-effort */ }
    }
    return print({
      ok: true, dryRun: true, harness: host.name, dir: root,
      removed: [...toRemove, ...generated], preserved,
      mcp: mcpPreview, hooks: host.name === "claude" ? [".claude/settings.json"] : [], errors: [],
      lockRemoved: preserved.length === 0,
    }, io, opts.json ?? false);
  }

  if (!opts.yes) {
    if (!io.isTTY || opts.json) {
      throw new CliError("CONFIRM_REQUIRED", `Remover o kit de ${root}? Config, artefatos, domínio e skills do cliente serão preservados. Use --yes.`, 2);
    }
    const ok = await confirm(io, `Remover o kit de ${root}? Config, artefatos, domínio e skills do cliente serão preservados.`);
    if (!ok) {
      io.stderr("Uninstall cancelado; nada foi removido.\n");
      return 0;
    }
  }

  for (const rel of toRemove) {
    try {
      unlinkSync(path.join(root, ...rel.split("/")));
      removed.push(rel);
    } catch (err) {
      errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const rel of generated) {
    try {
      unlinkSync(path.join(root, ...rel.split("/")));
      removed.push(rel);
    } catch (err) {
      errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (let i = 0; i < host.mcpConfigs.length; i++) {
    const { rel, file } = resolveMcp(root, host, i);
    const full = path.join(root, ...rel.split("/"));
    if (!existsSync(full)) continue;
    try {
      await atomicWrite(full, (current) => {
        const result = removeMcpServer(current, file);
        if (result.kind === "write") {
          mcpTouched.push(rel);
          return result.text;
        }
        if (result.kind === "unreadable") io.stderr(`! ${rel}: ${result.reason}; o MCP ficou como estava.\n`);
        return current;
      });
    } catch (err) {
      errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (host.name === "claude") {
    const rel = ".claude/settings.json";
    const full = path.join(root, ...rel.split("/"));
    if (existsSync(full)) {
      try {
        await atomicWrite(full, (current) => {
          const result = removeClaudeSettingsHooks(current);
          if (result.kind === "write") {
            hookTouched.push(rel);
            return result.text;
          }
          if (result.kind === "unreadable") io.stderr(`! ${rel}: ${result.reason}; os hooks ficaram como estavam.\n`);
          return current;
        });
      } catch (err) {
        errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  for (const rel of ["agents", "skills", "commands"]) {
    pruneEmpty(root, `${host.hostDir}/${rel}`);
  }
  if (host.supportsChatmodes) pruneEmpty(root, ".github/chatmodes");
  if (host.name === "opencode") pruneEmpty(root, OPENCODE_PLUGINS_DIR);

  let lockRemoved = false;
  if (preserved.length === 0 && errors.length === 0) {
    try {
      unlinkSync(path.join(root, ".github", "kit.lock.json"));
      lockRemoved = true;
    } catch (err) {
      errors.push(`.github/kit.lock.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return print({
    ok: errors.length === 0, dryRun: false, harness: host.name, dir: root,
    removed, preserved, mcp: mcpTouched, hooks: hookTouched, errors, lockRemoved,
  }, io, opts.json ?? false);
}

interface UninstallResult {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly harness: string;
  readonly dir: string;
  readonly removed: readonly string[];
  readonly preserved: readonly string[];
  readonly mcp: readonly string[];
  readonly hooks: readonly string[];
  readonly errors: readonly string[];
  readonly lockRemoved: boolean;
}

function print(result: UninstallResult, io: CliIO, json: boolean): number {
  if (json) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }
  io.stdout(`${result.dryRun ? "Uninstall (dry-run)" : "Desinstalado"}: harness=${result.harness} · ${result.dir}\n`);
  io.stdout(`  removidos: ${result.removed.length}${result.removed.length ? ` (${result.removed.slice(0, 8).join(", ")}${result.removed.length > 8 ? "…" : ""})` : ""}\n`);
  if (result.preserved.length) io.stderr(`! preservados (editados pelo time): ${result.preserved.join(", ")}\n`);
  if (result.mcp.length) io.stdout(`  MCP: entrada removida de ${result.mcp.join(", ")}\n`);
  if (result.hooks.length) io.stdout(`  hooks: removidos de ${result.hooks.join(", ")}\n`);
  if (result.dryRun) io.stdout(`  lock ${result.lockRemoved ? "seria removido" : "seria mantido (há arquivos preservados)"}\n`);
  else io.stdout(`  lock ${result.lockRemoved ? "removido" : "mantido (há arquivos preservados)"}\n`);
  io.stdout("  Config, artefatos, domínio e skills do cliente preservados.\n");
  for (const err of result.errors) io.stderr(`✖ ${err}\n`);
  return result.ok ? 0 : 1;
}
