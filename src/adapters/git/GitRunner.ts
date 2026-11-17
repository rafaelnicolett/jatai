/**
 * GitRunner.ts
 *
 * Porta para executar `git`. Existe para que o sync de repositórios seja
 * testável sem rede nem disco: os testes injetam um runner falso.
 *
 * As credenciais são **delegadas ao git do usuário** — usamos o binário do
 * sistema, que já resolve SSH agent, credential helper e PAT. O Helyx nunca
 * pede, lê ou armazena credencial.
 */

import { execFile } from "child_process";

export interface GitResult {
  stdout: string;
  stderr: string;
}

export interface GitRunner {
  /** Executa `git <args>` em `cwd`. Rejeita com stderr quando o git falha. */
  run(args: string[], cwd?: string): Promise<GitResult>;
}

export class SystemGitRunner implements GitRunner {
  /** Clones grandes podem passar de minutos — o default do execFile mataria antes. */
  private readonly _timeoutMs: number;

  constructor(timeoutMs = 10 * 60 * 1000) {
    this._timeoutMs = timeoutMs;
  }

  run(args: string[], cwd?: string): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        args,
        {
          ...(cwd ? { cwd } : {}),
          timeout: this._timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          // Nunca abrir prompt interativo de credencial: numa extensão isso
          // trava o processo em silêncio, sem UI para o usuário responder.
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr.trim() || err.message));
            return;
          }
          resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        }
      );
    });
  }
}
