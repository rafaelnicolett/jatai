/**
 * cli-runner.ts — roda o CLI de estado como o agente roda: `node <bundle>
 * <artefato> <verbo> --flags`, num subprocesso, a partir da raiz do workspace.
 *
 * Isolamento:
 * - **Ambiente mínimo por allowlist.** Nenhuma variável da marca passa
 *   (`HELYX_WORKSPACE_ROOT`, `HELYX_CLOUD_API_*`, `NODE_OPTIONS`...). Rodando
 *   o vitest de um terminal do VS Code com a extensão ativa, o
 *   `HELYX_WORKSPACE_ROOT` herdado faria o CLI achar o `server.json` do State
 *   Service real e gravar no workspace de verdade.
 * - **HOME/USERPROFILE** apontam para uma pasta do sandbox, e o git ignora a
 *   configuração do sistema (`GIT_CONFIG_NOSYSTEM`): o `user.name` que o
 *   `gates approve` lê vem só do `.gitconfig` do sandbox, quando o cenário tem.
 * - Sem `server.json` no sandbox e sem `HELYX_CLOUD_API_URL`, o CLI não abre
 *   socket nenhum: cai direto no caminho de escrita em YAML.
 * - Mesmo binário do Node que roda o vitest (`process.execPath`).
 */
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { cliBundleName, cliSourceEntry, REPO_ROOT } from "./paths";

export interface CliRun {
  readonly exit: number | string;
  readonly stdout: string;
  readonly stderr: string;
}

const PASSTHROUGH_ENV = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "WINDIR", "ComSpec", "COMSPEC", "TEMP", "TMP", "TMPDIR"];

export function isolatedEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of PASSTHROUGH_ENV) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  env.HOME = home;
  env.USERPROFILE = home;
  // O git só enxerga o HOME do sandbox (ADR-0024: quem aprova um gate é o user.name do git).
  env.GIT_CONFIG_NOSYSTEM = "1";
  return env;
}

export function runCli(cliPath: string, argv: readonly string[], cwd: string, home: string, timeoutMs = 30_000): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...argv], {
      cwd,
      env: isolatedEnv(home),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI passou de ${timeoutMs}ms: ${argv.join(" ")}`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        exit: code ?? `signal:${signal ?? "?"}`,
        stdout: Buffer.concat(out).toString("utf-8"),
        stderr: Buffer.concat(err).toString("utf-8"),
      });
    });
  });
}

/**
 * Builda o CLI a partir de `src/` com as mesmas opções de `npm run build:cli`
 * (inclusive o sourcemap, que muda o comentário final do bundle). Serve para
 * provar que o código-fonte atual se comporta igual ao bundle versionado.
 */
export async function buildCliFromSource(outDir: string): Promise<string> {
  const esbuild = await import("esbuild");
  const outfile = path.join(outDir, cliBundleName());
  fs.mkdirSync(outDir, { recursive: true });
  await esbuild.build({
    entryPoints: [path.relative(REPO_ROOT, cliSourceEntry()).split(path.sep).join("/")],
    absWorkingDir: REPO_ROOT,
    bundle: true,
    outfile,
    format: "cjs",
    platform: "node",
    target: "node18",
    sourcemap: true,
    logLevel: "silent",
  });
  return outfile;
}

/** Pool simples: roda `tasks` com no máximo `limit` em paralelo, preservando a ordem do resultado. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}
