#!/usr/bin/env node
/**
 * main.ts — entry da CLI headless do Jataí (`jatai`).
 *
 * Esta é a frente de terminal/CI do kit: escolhe o harness, instala em projeto
 * existente, diagnostica e delega o estado ao `jatai-state`. O instalador é o
 * mesmo `KitInstaller` da extensão; não existe cópia da lógica.
 *
 * Uso: `jatai <init|doctor|harness|state> [opções]`.
 */

import { parseArgs } from "node:util";
import * as path from "node:path";
import { BRAND } from "../data/brand.pure";
import { kitVersion } from "../data/kit-version";
import { CliError, isCliError } from "./errors";
import { defaultIO, type CliIO } from "./io";
import { printHarnesses } from "./harness";
import { runInit } from "./init";
import { runDoctor } from "./doctor";
import { runUpdate } from "./update";
import { runUninstall } from "./uninstall";
import { runState } from "./state";

const HELP = `${BRAND.name} — CLI do kit de agentes da ${BRAND.displayName}

Uso:
  ${BRAND.name} init --harness <copilot|claude|opencode> [--dir <pasta>] [--name <nome>]
             [--maturity <lista>] [--dry-run] [--yes] [--json]
  ${BRAND.name} doctor [--dir <pasta>] [--json]
  ${BRAND.name} harness list [--json]
  ${BRAND.name} state <verbos do ${BRAND.name}-state> [--dir <pasta>]
  ${BRAND.name} update [--dir <pasta>] [--dry-run] [--yes] [--json]
  ${BRAND.name} uninstall [--dir <pasta>] [--dry-run] [--yes] [--json]
  ${BRAND.name} --version
  ${BRAND.name} --help

Opções:
  --dir <pasta>    diretório do workspace (default: atual)
  --harness <id>   copilot | claude | opencode
  --name <nome>    nome do projeto (default: basename do diretório)
  --maturity <l>   frameworks de maturidade separados por vírgula
  --dry-run        mostra o plano e não escreve no alvo
  --yes            não pede confirmação (CI)
  --json           saída de máquina (stdout só JSON)
  --version        versão do kit
  --help           esta ajuda

O MVP é brownfield: instala ao lado do código existente, sem modificá-lo.
`;

const OPTIONS = {
  dir: { type: "string" as const },
  harness: { type: "string" as const },
  name: { type: "string" as const },
  maturity: { type: "string" as const },
  "dry-run": { type: "boolean" as const },
  yes: { type: "boolean" as const, short: "y" },
  json: { type: "boolean" as const },
  help: { type: "boolean" as const, short: "h" },
  version: { type: "boolean" as const, short: "v" },
};

interface Parsed {
  readonly values: Record<string, string | boolean | undefined>;
  readonly positionals: string[];
}

function parse(argv: string[]): Parsed {
  const parsed = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS, strict: true });
  return { values: parsed.values as Parsed["values"], positionals: parsed.positionals };
}

async function dispatch(argv: string[], io: CliIO, cwd: string): Promise<number> {
  // `state` tem flags próprias do jatai-state; não passam pelo parser da CLI.
  const stateIndex = argv.indexOf("state");
  if (stateIndex !== -1) {
    const before = parse(argv.slice(0, stateIndex));
    const dir = typeof before.values.dir === "string" ? before.values.dir : undefined;
    const root = path.resolve(cwd, dir ?? ".");
    return runState(root, argv.slice(stateIndex + 1), io);
  }

  const { values, positionals } = parse(argv);
  if (values.version === true) {
    io.stdout(`${kitVersion()}\n`);
    return 0;
  }
  if (values.help === true || positionals.length === 0) {
    io.stdout(HELP);
    return values.help === true ? 0 : 1;
  }

  const command = positionals[0]!;
  const json = values.json === true;
  const dir = typeof values.dir === "string" ? values.dir : undefined;

  switch (command) {
    case "init":
      return runInit({
        dir,
        harness: typeof values.harness === "string" ? values.harness : undefined,
        name: typeof values.name === "string" ? values.name : undefined,
        maturity: typeof values.maturity === "string" ? values.maturity : undefined,
        dryRun: values["dry-run"] === true,
        yes: values.yes === true,
        json,
      }, io, cwd);

    case "doctor":
      return runDoctor({ dir, json }, io, cwd);

    case "harness":
      if (positionals[1] !== undefined && positionals[1] !== "list") {
        throw new CliError("UNKNOWN_SUBCOMMAND", `Subcomando desconhecido: harness ${positionals[1]}`, 1);
      }
      printHarnesses(io, json);
      return 0;

    case "update":
      return runUpdate({ dir, dryRun: values["dry-run"] === true, yes: values.yes === true, json }, io, cwd);

    case "uninstall":
      return runUninstall({ dir, dryRun: values["dry-run"] === true, yes: values.yes === true, json }, io, cwd);

    default:
      throw new CliError("UNKNOWN_COMMAND", `Comando desconhecido: ${command}. Use init, doctor, harness, update, uninstall ou state.`, 1);
  }
}

/** Executa a CLI e devolve o exit code. Exportada para testes e para o pacote. */
export async function runCli(argv: string[], ioOverride: Partial<CliIO> = {}, cwd = process.cwd()): Promise<number> {
  const io: CliIO = { ...defaultIO(), ...ioOverride };
  const json = argv.includes("--json");
  try {
    return await dispatch(argv, io, cwd);
  } catch (err) {
    if (isCliError(err)) {
      if (json) io.stdout(`${JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }, null, 2)}\n`);
      else io.stderr(`✖ ${err.code}: ${err.message}\n`);
      return err.exitCode;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (json) io.stdout(`${JSON.stringify({ ok: false, error: { code: "INTERNAL", message } }, null, 2)}\n`);
    else io.stderr(`✖ INTERNAL: ${message}\n`);
    return 3;
  }
}

if (require.main === module) {
  void runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(3);
    });
}
