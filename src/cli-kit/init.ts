/**
 * init.ts — `jatai init` (brownfield).
 *
 * Reusa o `KitInstaller` da extensão; não existe um segundo instalador.
 * O MVP é brownfield: instala o kit ao lado do código existente, com o
 * harness escolhido, sem tocar no código do repositório.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import * as os from "node:os";
import { KitInstaller } from "../generator/install/KitInstaller";
import { findConfigPath, readProjectMode, kitVersion } from "../data/kit-version";
import { BRAND } from "../data/brand.pure";
import { readKitLock } from "../generator/install/kit-lock";
import { findHarness } from "../generator/harness/harnesses";
import { CliError } from "./errors";
import { detectHost } from "./host";
import { listHarnesses } from "./harness";
import { ask, confirm, type CliIO } from "./io";

export interface InitOptions {
  readonly dir?: string;
  readonly harness?: string;
  readonly name?: string;
  readonly maturity?: string;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly json?: boolean;
}

interface InitResult {
  readonly ok: true;
  readonly dryRun: boolean;
  readonly harness: string;
  readonly dir: string;
  readonly name: string;
  readonly files: readonly string[];
  readonly warnings: readonly string[];
}

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** `Meu Projeto` → `meu-projeto`; acentos fora, hífens colapsados. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function isNonEmptyDir(root: string): boolean {
  try {
    return readdirSync(root).some((name) => name !== ".DS_Store");
  } catch {
    return false;
  }
}

async function listFiles(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await listFiles(root, child));
    else out.push(child);
  }
  return out.sort();
}

async function chooseHarness(io: CliIO): Promise<string> {
  if (!io.isTTY) {
    throw new CliError("HARNESS_REQUIRED", "Informe --harness (copilot, claude ou opencode).", 1);
  }
  const options = listHarnesses();
  io.stderr(`Escolha o harness:\n${options.map((h, i) => `  ${i + 1}. ${h.name} — ${h.label}`).join("\n")}\n`);
  const answer = (await ask(io, "Harness [1-3 ou nome]: ")).toLowerCase();
  const byNumber = Number(answer);
  const chosen = Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= options.length
    ? options[byNumber - 1]!.name
    : options.find((h) => h.name === answer)?.name;
  if (!chosen) throw new CliError("INVALID_HARNESS", `Harness inválido: ${answer}`, 1);
  return chosen;
}

function parseMaturity(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const list = raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  return list.length > 0 ? list : undefined;
}

export async function runInit(opts: InitOptions, io: CliIO, cwd: string): Promise<number> {
  const root = path.resolve(cwd, opts.dir ?? ".");
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(root);
  } catch {
    throw new CliError("DIR_NOT_FOUND", `Diretório não encontrado: ${root}. Crie a pasta antes.`, 1);
  }
  if (!stat.isDirectory()) throw new CliError("NOT_A_DIR", `Não é um diretório: ${root}`, 1);

  const configPath = findConfigPath(root);
  const mode = readProjectMode(root);
  if (mode === "greenfield") {
    throw new CliError("GREENFIELD", "Este é um projeto greenfield; use o Wizard da extensão. O CLI do MVP instala em projeto existente (brownfield).", 2);
  }

  const detected = detectHost(root);
  const requested = opts.harness !== undefined ? findHarness(opts.harness) : undefined;
  if (opts.harness !== undefined && requested === undefined) {
    throw new CliError("INVALID_HARNESS", `Harness inválido: ${opts.harness}. Use copilot, claude ou opencode.`, 1);
  }
  if (detected.host && requested && requested.name !== detected.host.name) {
    throw new CliError(
      "HOST_MISMATCH",
      `Este workspace já é ${detected.host.name}; a CLI não troca o harness. Use update para atualizar o kit.`,
      2
    );
  }
  const harness = requested ?? detected.host;
  if (!harness) {
    const chosen = await chooseHarness(io);
    const found = findHarness(chosen);
    if (!found) throw new CliError("INVALID_HARNESS", `Harness inválido: ${chosen}`, 1);
    return runInit({ ...opts, harness: found.name }, io, cwd);
  }

  const projectName = (opts.name?.trim() || slugify(path.basename(root)) || "projeto");
  if (!NAME.test(projectName)) {
    throw new CliError("INVALID_NAME", `Nome de projeto inválido: ${projectName}. Use letras minúsculas, números e hífen.`, 1);
  }

  const maturity = parseMaturity(opts.maturity);
  const warnings: string[] = [];
  if (configPath === null && isNonEmptyDir(root)) {
    warnings.push("A pasta não está vazia; o kit será instalado ao lado dos arquivos existentes (nada é removido).");
    if (!opts.yes) {
      if (!io.isTTY || opts.json) {
        throw new CliError("CONFIRM_REQUIRED", `${warnings[0]} Use --yes para confirmar.`, 2);
      }
      const ok = await confirm(io, `${warnings[0]} Continuar?`);
      if (!ok) {
        io.stderr("Instalação cancelada; nada foi gravado.\n");
        return 0;
      }
    }
  }
  if (configPath !== null) {
    warnings.push(`Workspace ${BRAND.displayName} existente: a instalação completa o que falta; a atualização do kit entra na Wave 2.`);
  }

  const installer = new KitInstaller();

  if (opts.dryRun) {
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), `${BRAND.name}-cli-init-`));
    try {
      await installer.installBrownfield(staging, projectName, harness.name, maturity);
      const all = await listFiles(staging);
      const files = configPath === null ? all : all.filter((rel) => !existsSync(path.join(root, ...rel.split("/"))));
      if (configPath !== null) warnings.push("O dry-run lista só os arquivos que faltam; MCP e plugin existentes seriam mesclados pelo update.");
      return print({
        ok: true, dryRun: true, harness: harness.name, dir: root, name: projectName, files, warnings,
      }, io, opts.json ?? false);
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  try {
    await installer.installBrownfield(root, projectName, harness.name, maturity);
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError("INSTALL_FAILED", err instanceof Error ? err.message : String(err), 3);
  }
  const lock = readKitLock(root);
  const files = lock ? Object.keys(lock.files).sort() : [];
  return print({
    ok: true, dryRun: false, harness: harness.name, dir: root, name: projectName, files, warnings,
  }, io, opts.json ?? false);
}

function print(result: InitResult, io: CliIO, json: boolean): number {
  if (json) {
    io.stdout(`${JSON.stringify({ ...result, kitVersion: kitVersion(), fileCount: result.files.length }, null, 2)}\n`);
    return 0;
  }
  io.stdout(`${result.dryRun ? "Plano (dry-run)" : "Instalado"}: harness=${result.harness} · diretório=${result.dir}\n`);
  io.stdout(`Projeto: ${result.name} · kit: ${kitVersion()} · ${result.files.length} arquivo(s)${result.dryRun ? " a gravar" : " no lock"}\n`);
  for (const warning of result.warnings) io.stderr(`! ${warning}\n`);
  if (result.dryRun) {
    for (const file of result.files) io.stdout(`  ${file}\n`);
  }
  return 0;
}
