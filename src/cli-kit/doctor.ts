/**
 * doctor.ts — `jatai doctor`.
 *
 * Diagnóstico somente-leitura: Node, config, modo, host, lock, arquivos do
 * kit, MCP e versão. Não conserta nada; aponta o que fazer. `--json` é a
 * saída de automação; o texto humano fica no stdout, exceto em `--json`.
 */

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  compareVersions,
  findConfigPath,
  kitVersion,
  readKitVersion,
  readProjectMode,
} from "../data/kit-version";
import { BRAND } from "../data/brand.pure";
import { KIT_SCRIPTS_DIR, mergeMcpConfig, type McpConfigFile } from "../generator/content/mcp-config";
import { MCP_BUNDLE } from "../generator/install/kit-root";
import { collectClientEdits, readKitLock } from "../generator/install/kit-lock";
import { opencodeConfigPath } from "../generator/install/mcp-installer";
import type { HarnessAdapter } from "../generator/harness/HarnessAdapter";
import { CliError } from "./errors";
import { detectHost } from "./host";
import type { CliIO } from "./io";

export interface DoctorOptions {
  readonly dir?: string;
  readonly json?: boolean;
}

type Status = "ok" | "warn" | "error";

interface Check {
  readonly id: string;
  readonly status: Status;
  readonly message: string;
}

function check(checks: Check[], id: string, status: Status, message: string): void {
  checks.push({ id, status, message });
}

function mcpPath(root: string, adapter: HarnessAdapter, index: number): { rel: string; file: McpConfigFile } {
  const file = adapter.mcpConfigs[index]!;
  return { rel: file.format === "jsonc" ? opencodeConfigPath(root) : file.path, file };
}

export function runDoctor(opts: DoctorOptions, io: CliIO, cwd: string): number {
  const root = path.resolve(cwd, opts.dir ?? ".");
  const checks: Check[] = [];

  if (!existsSync(root)) throw new CliError("DIR_NOT_FOUND", `Diretório não encontrado: ${root}`, 1);

  const major = Number(process.versions.node.split(".")[0]);
  check(checks, "node", major >= 20 ? "ok" : "error", `Node ${process.versions.node}${major >= 20 ? "" : " (o CLI exige >= 20)"}`);

  const configPath = findConfigPath(root);
  if (!configPath) {
    check(checks, "config", "error", `Sem ${BRAND.files.config} — não é um workspace ${BRAND.displayName}`);
    return print(checks, root, undefined, undefined, io, opts.json ?? false);
  }
  check(checks, "config", "ok", path.relative(root, configPath) || configPath);

  const mode = readProjectMode(root);
  check(checks, "mode", mode ? "ok" : "warn", mode ?? "modo não declarado no config");

  const detected = detectHost(root);
  if (!detected.host) {
    check(checks, "host", "error", detected.declared ? `host_adapter inválido: ${detected.declared}` : "harness não detectado no config nem no disco");
  } else {
    check(checks, "host", "ok", `${detected.host.name} (${detected.source})`);
  }
  const host = detected.host;

  const installed = readKitVersion(root);
  const current = kitVersion();
  if (!installed) {
    check(checks, "kit-version", "warn", "config sem kit_version (workspace anterior ao versionamento)");
  } else if (installed === current) {
    check(checks, "kit-version", "ok", current);
  } else if (compareVersions(installed, current) < 0) {
    check(checks, "kit-version", "warn", `instalado ${installed}; CLI ${current} (update disponível)`);
  } else {
    check(checks, "kit-version", "warn", `instalado ${installed}; CLI ${current} (CLI mais antiga que o workspace)`);
  }

  const lock = readKitLock(root);
  if (!lock) {
    check(checks, "lock", "warn", "sem .github/kit.lock.json; o update não distingue o que é do time");
  } else {
    check(checks, "lock", "ok", `${Object.keys(lock.files).length} arquivo(s) · harness ${lock.harness}`);
    if (host && lock.harness !== host.name) {
      check(checks, "lock-harness", "error", `lock diz ${lock.harness}; host detectado ${host.name}`);
    }
    const missing = Object.keys(lock.files).filter((rel) => !existsSync(path.join(root, ...rel.split("/"))));
    if (missing.length > 0) {
      check(checks, "lock-files", "error", `${missing.length} arquivo(s) do kit ausente(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
    } else {
      check(checks, "lock-files", "ok", "todos os arquivos do lock existem");
    }
    const edits = collectClientEdits(root, lock);
    if (edits.size > 0) {
      check(checks, "client-edits", "warn", `${edits.size} arquivo(s) do kit alterado(s) pelo time; o update preserva e grava .kit-new`);
    }
  }

  if (host) {
    const orchestrator = path.join(root, ...`${host.hostDir}/agents/${host.orchestratorFile}`.split("/"));
    check(checks, "orchestrator", existsSync(orchestrator) ? "ok" : "error", `${host.hostDir}/agents/${host.orchestratorFile}`);
    check(checks, "instructions", existsSync(path.join(root, ...host.instructionsFile.split("/"))) ? "ok" : "error", host.instructionsFile);

    for (const file of [BRAND.files.cli, MCP_BUNDLE]) {
      const rel = `${KIT_SCRIPTS_DIR}/${file}`;
      check(checks, `script-${file}`, existsSync(path.join(root, ...rel.split("/"))) ? "ok" : "error", rel);
    }

    for (let i = 0; i < host.mcpConfigs.length; i++) {
      const { rel, file } = mcpPath(root, host, i);
      const full = path.join(root, ...rel.split("/"));
      if (!existsSync(full)) {
        check(checks, `mcp-${rel}`, "error", `${rel} não existe`);
        continue;
      }
      try {
        const result = mergeMcpConfig(readFileSync(full, "utf-8"), file, MCP_BUNDLE);
        if (result.kind === "unchanged") check(checks, `mcp-${rel}`, "ok", `${rel} tem o servidor ${BRAND.name}`);
        else if (result.kind === "write") check(checks, `mcp-${rel}`, "error", `${rel} não tem o servidor ${BRAND.name}`);
        else check(checks, `mcp-${rel}`, "warn", `${rel}: ${result.reason}; confira o MCP à mão`);
      } catch (err) {
        check(checks, `mcp-${rel}`, "warn", `${rel}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  check(checks, "repos", existsSync(path.join(root, "repos")) ? "ok" : "warn", "repos/ (materializado pelo Foundation)");
  check(checks, "docs-input", existsSync(path.join(root, "docs", "input")) ? "ok" : "warn", "docs/input/");
  return print(checks, root, host?.name, mode ?? undefined, io, opts.json ?? false);
}

function print(checks: readonly Check[], root: string, host: string | undefined, mode: string | undefined, io: CliIO, json: boolean): number {
  const errors = checks.filter((c) => c.status === "error");
  const warnings = checks.filter((c) => c.status === "warn");
  if (json) {
    io.stdout(`${JSON.stringify({
      ok: errors.length === 0,
      root,
      host: host ?? null,
      mode: mode ?? null,
      checks,
      errors: errors.length,
      warnings: warnings.length,
    }, null, 2)}\n`);
    return errors.length === 0 ? 0 : 1;
  }
  io.stdout(`Doctor: ${root}\n`);
  for (const c of checks) {
    const mark = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✖";
    io.stdout(`${mark} ${c.id}: ${c.message}\n`);
  }
  io.stdout(`\n${errors.length === 0 ? "ok" : "falhou"} · ${errors.length} erro(s) · ${warnings.length} aviso(s)\n`);
  return errors.length === 0 ? 0 : 1;
}
