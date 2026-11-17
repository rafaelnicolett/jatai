/**
 * atomic-write.ts
 *
 * O motor de escrita do `helyx-state`: sempre `read → mutate em memória →
 * write em arquivo temporário → rename atômico`, sob um lock de arquivo.
 *
 * Isso é o que substitui, em código, a regra de prosa que hoje só existe
 * como instrução no `maestro.agent.md` ("leia o initiatives.yaml inteiro
 * antes de escrever, ou uma segunda chave duplicada quebra o parse do
 * arquivo inteiro"). Como toda escrita aqui é sempre find-or-create sobre o
 * conteúdo lido por último, a classe de bug "chave de topo duplicada" deixa
 * de ser possível por construção — não depende de o agente lembrar da regra.
 *
 * O lock existe para o caso de dois agentes/processos gravando itens
 * diferentes do MESMO arquivo em paralelo (ex.: dois itens de uma mesma
 * `wave_status` sendo fechados quase ao mesmo tempo) — sem ele, um
 * read-modify-write intercalado faz um processo sobrescrever silenciosamente
 * o resultado do outro (pior que a duplicação de chave que já existe hoje).
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const LOCK_RETRY_MS = 150;
const LOCK_MAX_RETRIES = 40; // ~6s de espera total antes de desistir
const LOCK_STALE_MS = 10_000;

/** Parâmetros do lock. Os defaults são os de sempre (40 × 150 ms, lock órfão depois de 10 s); testes encurtam. */
export interface AtomicWriteOptions {
  retryMs?: number;
  maxRetries?: number;
  staleMs?: number;
}

interface LockTiming {
  retryMs: number;
  maxRetries: number;
  staleMs: number;
}

function lockTiming(options?: AtomicWriteOptions): LockTiming {
  return {
    retryMs: options?.retryMs ?? LOCK_RETRY_MS,
    maxRetries: options?.maxRetries ?? LOCK_MAX_RETRIES,
    staleMs: options?.staleMs ?? LOCK_STALE_MS,
  };
}

/**
 * Espera sem bloquear a thread (A11 / L11). O lock roda no CLI e também no
 * Extension Host (State Service, Cockpit); o antigo `Atomics.wait` congelava o
 * host inteiro por até ~6 s sob contenção. O lint proíbe `Atomics.wait` fora
 * de src/cli (ADR-0017).
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(filePath: string, timing: LockTiming): Promise<string> {
  const lockPath = `${filePath}.lock`;
  for (let attempt = 0; attempt < timing.maxRetries; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, `${process.pid}`);
      fs.closeSync(fd);
      return lockPath;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > timing.staleMs) {
          fs.rmSync(lockPath, { force: true });
          continue; // retry imediato — o dono anterior provavelmente morreu com o lock aberto
        }
      } catch {
        continue; // lock sumiu entre o EEXIST e o stat — outro processo já liberou, retry imediato
      }
      await delay(timing.retryMs);
    }
  }
  throw new Error(`LOCK_TIMEOUT: não foi possível adquirir lock em '${lockPath}' após ${timing.maxRetries} tentativas`);
}

function releaseLock(lockPath: string): void {
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    // best-effort — se já sumiu, não há o que liberar
  }
}

/** Lê o arquivo se existir, `""` caso contrário — nunca lança por ausência. */
export function readFileOrEmpty(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

/**
 * Executa `mutate` sob lock, contra o conteúdo mais recente do arquivo, e
 * grava atomicamente (temp + rename) só se o resultado mudou de verdade.
 * `mutate` recebe `""` quando o arquivo ainda não existe — cabe a cada writer
 * decidir o que fazer nesse caso (criar do zero, ou devolver `""` sem mudar).
 *
 * A espera pelo lock é assíncrona (A11): enquanto outro processo segura o
 * arquivo, o event loop segue livre. Ler, mutar e gravar acontece de uma vez,
 * sem `await` no meio, então ninguém do mesmo processo intercala.
 */
export async function atomicWrite(filePath: string, mutate: (current: string) => string, options?: AtomicWriteOptions): Promise<{ changed: boolean }> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = await acquireLock(filePath, lockTiming(options));
  try {
    const before = readFileOrEmpty(filePath);
    const after = mutate(before);
    if (after === before) return { changed: false };
    const tmpPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`
    );
    fs.writeFileSync(tmpPath, after, "utf-8");
    fs.renameSync(tmpPath, filePath);
    return { changed: true };
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * Roda `fn` segurando o lock de `filePath` (o mesmo `<arquivo>.lock` do
 * `atomicWrite`, com a mesma espera assíncrona). `fn` é síncrona de propósito:
 * ler, decidir e gravar acontecem de uma vez, sem `await` no meio. É o que o
 * append de `runs/*.jsonl` usa para gravar e rodar o arquivo sem que outro
 * processo intercale (F5.2).
 */
export async function withFileLock<T>(filePath: string, fn: () => T, options?: AtomicWriteOptions): Promise<T> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = await acquireLock(filePath, lockTiming(options));
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}

/** Append de uma linha JSONL — já é atômico por natureza do append em POSIX pra writes pequenos; não precisa de lock nem de read-modify-write. */
export function appendLine(filePath: string, line: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${line}\n`, "utf-8");
}
