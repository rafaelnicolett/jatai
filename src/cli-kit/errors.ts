/**
 * errors.ts — erro de CLI com código estável e exit code.
 *
 * Códigos (roadmap do epic-10):
 * - 0 sucesso
 * - 1 uso/entrada (flag, harness, nome, diretório)
 * - 2 ambiente bloqueado (Node, config de outro host, pasta não vazia sem --yes)
 * - 3 erro interno (exceção do instalador)
 */

export type CliExitCode = 0 | 1 | 2 | 3;

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: CliExitCode = 1
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function isCliError(err: unknown): err is CliError {
  return err instanceof CliError;
}
