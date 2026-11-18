/**
 * state.ts — `jatai state ...` delega ao CLI de estado do workspace.
 *
 * A CLI de instalação não reimplementa os verbos de estado; o
 * `.github/scripts/<marca>-state.cjs` continua sendo o motor instalado no
 * workspace, com o lock e a validação de sempre.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { BRAND } from "../data/brand.pure";
import { CliError } from "./errors";
import type { CliIO } from "./io";

export function runState(root: string, args: readonly string[], _io: CliIO): number {
  const cli = path.join(root, ".github", "scripts", BRAND.files.cli);
  if (!existsSync(cli)) {
    throw new CliError(
      "STATE_CLI_MISSING",
      `Não encontrei ${path.relative(root, cli)}. O workspace não tem o CLI de estado instalado.`,
      2
    );
  }
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw new CliError("STATE_FAILED", result.error.message, 3);
  return result.status ?? 3;
}
