/**
 * io.ts — entrada e saída da CLI do kit (headless).
 *
 * A CLI é testável sem `process`: os comandos recebem este objeto e não
 * escrevem direto no console. `--json` usa `stdout` para o objeto e `stderr`
 * para qualquer log humano.
 */

import * as readline from "node:readline/promises";

export interface CliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly isTTY: boolean;
}

export function defaultIO(): CliIO {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  };
}

/** Pergunta no terminal; só deve ser chamada quando `io.isTTY` é verdadeiro. */
export async function ask(io: CliIO, question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function confirm(io: CliIO, question: string): Promise<boolean> {
  if (!io.isTTY) return false;
  const answer = (await ask(io, `${question} [s/N] `)).toLowerCase();
  return answer === "s" || answer === "sim" || answer === "y" || answer === "yes";
}
