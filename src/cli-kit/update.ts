/**
 * update.ts — `jatai update` (Wave 2).
 *
 * Atualiza o kit do workspace com o `migrateKit` da extensão: arquivo do kit
 * alterado pelo time fica e a versão nova vai para `.kit-new`; o que o kit
 * deixou de ter sai se estava intacto. `--dry-run` roda numa cópia mínima
 * (só config, lock, kit e arquivos de harness), sem tocar no alvo.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import * as os from "node:os";
import * as yaml from "js-yaml";
import { KitInstaller } from "../generator/install/KitInstaller";
import type { KitMigrationReport } from "../generator/install/kit-lock";
import { readKitLock } from "../generator/install/kit-lock";
import { findConfigPath, readKitVersion, readProjectMode, kitVersion } from "../data/kit-version";
import { BRAND } from "../data/brand.pure";
import { KIT_SCRIPTS_DIR } from "../generator/content/mcp-config";
import { CliError } from "./errors";
import { detectHost } from "./host";
import { slugify } from "./init";
import type { CliIO } from "./io";

export interface UpdateOptions {
  readonly dir?: string;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly json?: boolean;
}

interface UpdateResult {
  readonly ok: true;
  readonly dryRun: boolean;
  readonly harness: string;
  readonly dir: string;
  readonly fromVersion: string | null;
  readonly toVersion: string;
  readonly report: KitMigrationReport | null;
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

function projectNameOf(root: string): string {
  const configPath = findConfigPath(root);
  if (configPath !== null) {
    try {
      const doc = yaml.load(readFileSync(configPath, "utf-8")) as { project?: { name?: unknown } } | null;
      const name = doc && typeof doc === "object" && doc.project && typeof doc.project.name === "string" ? doc.project.name.trim() : "";
      if (name) return name;
    } catch { /* cai no basename */ }
  }
  return slugify(path.basename(root)) || "projeto";
}

function rels(root: string, dir = "", out: string[] = []): string[] {
  if (!existsSync(path.join(root, dir))) return out;
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const child = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rels(root, child, out);
    else out.push(child);
  }
  return out.sort();
}

function same(a: string, b: string): boolean {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

function copyPath(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

/** Cópia mínima para o dry-run: só o que o `migrateKit` lê e escreve. */
function stageForDryRun(root: string): string {
  const temp = mkdtempSync(path.join(os.tmpdir(), `${BRAND.name}-cli-update-`));
  const lock = readKitLock(root);
  if (lock) for (const rel of Object.keys(lock.files)) copyPath(path.join(root, ...rel.split("/")), path.join(temp, ...rel.split("/")));
  copyPath(path.join(root, ".github", "kit.lock.json"), path.join(temp, ".github", "kit.lock.json"));
  const config = findConfigPath(root);
  if (config) copyPath(config, path.join(temp, path.basename(config)));
  copyPath(path.join(root, KIT_SCRIPTS_DIR), path.join(temp, ...KIT_SCRIPTS_DIR.split("/")));
  copyPath(path.join(root, ".mcp.json"), path.join(temp, ".mcp.json"));
  copyPath(path.join(root, ".vscode", "mcp.json"), path.join(temp, ".vscode", "mcp.json"));
  copyPath(path.join(root, "opencode.json"), path.join(temp, "opencode.json"));
  copyPath(path.join(root, "opencode.jsonc"), path.join(temp, "opencode.jsonc"));
  copyPath(path.join(root, ".opencode", "opencode.json"), path.join(temp, ".opencode", "opencode.json"));
  copyPath(path.join(root, ".opencode", "opencode.jsonc"), path.join(temp, ".opencode", "opencode.jsonc"));
  copyPath(path.join(root, ".claude", "settings.json"), path.join(temp, ".claude", "settings.json"));
  copyPath(path.join(root, ".gitignore"), path.join(temp, ".gitignore"));
  return temp;
}

function diff(original: string, staged: string, lock: ReturnType<typeof readKitLock>): { added: string[]; changed: string[]; removed: string[] } {
  const originalFiles = new Set(rels(original));
  const stagedFiles = new Set(rels(staged));
  const added = [...stagedFiles].filter((rel) => !originalFiles.has(rel)).sort();
  const changed = [...stagedFiles].filter((rel) => originalFiles.has(rel) && !same(path.join(original, ...rel.split("/")), path.join(staged, ...rel.split("/")))).sort();
  const removed = [...(lock ? Object.keys(lock.files) : [])].filter((rel) => !stagedFiles.has(rel)).sort();
  return { added, changed, removed };
}

export async function runUpdate(opts: UpdateOptions, io: CliIO, cwd: string): Promise<number> {
  const root = path.resolve(cwd, opts.dir ?? ".");
  if (!existsSync(root)) throw new CliError("DIR_NOT_FOUND", `Diretório não encontrado: ${root}`, 1);
  const configPath = findConfigPath(root);
  if (!configPath) throw new CliError("NOT_A_WORKSPACE", `Sem ${BRAND.files.config}; este diretório não é um workspace ${BRAND.displayName}.`, 2);
  if (readProjectMode(root) === "greenfield") {
    throw new CliError("GREENFIELD", "Projeto greenfield: use o Wizard da extensão; o update do CLI é para brownfield.", 2);
  }
  const detected = detectHost(root);
  if (!detected.host) {
    throw new CliError("HOST_UNKNOWN", detected.declared ? `host_adapter inválido: ${detected.declared}` : "Harness não detectado no workspace.", 2);
  }
  const host = detected.host;
  const projectName = projectNameOf(root);
  const lock = readKitLock(root);
  const fromVersion = readKitVersion(root);
  const installer = new KitInstaller();

  if (opts.dryRun) {
    const staged = stageForDryRun(root);
    try {
      const report = await installer.migrate(staged, projectName, host.name);
      if (!report) throw new CliError("NOT_APPLIED", "O migrateKit recusou o workspace (greenfield?).", 2);
      const result: UpdateResult = {
        ok: true,
        dryRun: true,
        harness: host.name,
        dir: root,
        fromVersion,
        toVersion: kitVersion(),
        report,
        ...diff(root, staged, lock),
      };
      return print(result, io, opts.json ?? false);
    } finally {
      await fs.rm(staged, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (lock === null && !opts.yes) {
    throw new CliError("CONFIRM_REQUIRED", "Sem .github/kit.lock.json: o update não distingue o que é do time. Use --yes para continuar mesmo assim.", 2);
  }
  const report = await installer.migrate(root, projectName, host.name);
  if (!report) throw new CliError("NOT_APPLIED", "O migrateKit recusou o workspace (greenfield?).", 2);
  return print({
    ok: true,
    dryRun: false,
    harness: host.name,
    dir: root,
    fromVersion,
    toVersion: kitVersion(),
    report,
    added: [],
    changed: [],
    removed: report.removed,
  }, io, opts.json ?? false);
}

function print(result: UpdateResult, io: CliIO, json: boolean): number {
  if (json) {
    io.stdout(`${JSON.stringify({ ...result, keptClientEdits: result.report?.keptClientEdits ?? [] }, null, 2)}\n`);
    return 0;
  }
  const r = result.report;
  io.stdout(`${result.dryRun ? "Update (dry-run)" : "Atualizado"}: harness=${result.harness} · ${result.fromVersion ?? "sem versão"} → ${result.toVersion}\n`);
  if (result.dryRun) {
    io.stdout(`  adicionados: ${result.added.length} · alterados: ${result.changed.length} · removidos: ${result.removed.length}\n`);
    for (const rel of result.changed) io.stdout(`  ~ ${rel}\n`);
    for (const rel of result.added) io.stdout(`  + ${rel}\n`);
    for (const rel of result.removed) io.stdout(`  - ${rel}\n`);
  }
  if (r?.keptClientEdits.length) {
    io.stderr(`! ${r.keptClientEdits.length} arquivo(s) do kit alterados pelo time: preservados; a versão nova está em .kit-new\n`);
    for (const rel of r.keptClientEdits) io.stderr(`  ${rel} → ${rel}.kit-new\n`);
  }
  if (r?.removed.length) io.stdout(`  removidos pelo kit: ${r.removed.join(", ")}\n`);
  if (r?.keptDiscontinued.length) io.stderr(`! saíram do kit, mas o time alterou: ${r.keptDiscontinued.join(", ")}\n`);
  if (r?.withoutPreviousLock) io.stderr("! workspace sem lock: o kit foi atualizado como antes; rode de novo para o lock nascer.\n");
  io.stdout(`Config, artefatos, domínio e skills do cliente preservados.\n`);
  return 0;
}
