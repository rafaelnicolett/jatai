/**
 * run-event-log.ts — a escrita de `.github/artifacts/runs/*.jsonl` (F5.2,
 * contrato agent-activity §6).
 *
 * Antes, o append era sem lock (`appendLine`): dois produtores ao mesmo tempo
 * (um hook do Claude Code e o State Service, por exemplo) podiam intercalar
 * bytes de linhas grandes. Agora todo produtor do contrato passa por
 * `appendRunEvent`:
 *
 * 1. valida e limpa o evento (`validateRunEvent`, lista fechada, R8);
 * 2. escolhe o arquivo da iniciativa: `runs/<initiative_id>.jsonl`, ou
 *    `runs/workspace.jsonl` para evento sem iniciativa (D1 de um repo, por
 *    exemplo);
 * 3. sob o lock do arquivo (o mesmo `<arquivo>.lock` do `atomicWrite`), roda
 *    o arquivo se ele já tem `RUN_EVENTS_PER_FILE` eventos e grava a linha.
 *
 * Rotação por iniciativa, 5.000 eventos por arquivo:
 * - o arquivo cheio vira `runs/previous/<id>.jsonl`, que continua na leitura
 *   ao vivo: o Cockpit e o mapa não perdem os eventos recentes na virada;
 * - o `previous` que já existia vai para `runs/archive/<id>.<carimbo>.jsonl`,
 *   o histórico que o replay (F5.4) lê. A leitura ao vivo olha só o topo de
 *   `runs/` e `runs/previous/`, então o custo dela fica limitado a dois
 *   arquivos por iniciativa.
 *
 * Por que `previous/` é uma subpasta, e não `<id>.previous.jsonl` ao lado do
 * ativo: o `RunsWatcher` vigia `runs/*.jsonl` (só o topo) e guarda um offset
 * por arquivo. Um arquivo novo no topo, mesmo que seja o ativo renomeado, é
 * lido do byte 0, e a rotação republicaria no barramento os 5.000 eventos
 * que ele já entregou. Fora do topo, o watcher não o vê.
 */
import * as fs from "fs";
import * as path from "path";
import { RUNS_DIR, parseRunEvents, type RunEvent } from "../../core/contracts/run-events-contract.pure";
import { validateRunEvent } from "../../core/contracts/agent-activity.pure";
import type { FieldResult } from "../../core/validation/validation";
import { withFileLock, type AtomicWriteOptions } from "../lock/atomic-write";

/** Limite de eventos por arquivo (contrato agent-activity §6). */
export const RUN_EVENTS_PER_FILE = 5_000;

/** Arquivo dos eventos sem iniciativa. */
export const WORKSPACE_RUN_KEY = "workspace";

/** Pasta do histórico rodado, dentro de `runs/`. */
export const RUNS_ARCHIVE_DIR = "archive";

/** Pasta do arquivo cheio mais recente, que continua na leitura ao vivo. Fora do topo de `runs/`, que o watcher vigia. */
export const PREVIOUS_DIR = "previous";

/** A menor linha que o parser aceita como evento: `{"event_type":"","timestamp":""}`. Abaixo de `limite × isto` bytes, o arquivo não pode estar cheio. */
const MIN_EVENT_LINE_BYTES = '{"event_type":"","timestamp":""}'.length;

/** Id de iniciativa que vira nome de arquivo: um segmento simples, sem separador nem `..`. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface AppendRunEventOptions {
  /** Tempo de espera do lock (testes encurtam). */
  lock?: AtomicWriteOptions;
  /** Limite por arquivo. Default `RUN_EVENTS_PER_FILE`. */
  maxEventsPerFile?: number;
  /** Relógio do carimbo do arquivo arquivado. Default: agora. */
  now?: () => Date;
}

export interface AppendedRunEvent {
  event: RunEvent;
  /** Caminho absoluto do arquivo onde a linha entrou. */
  path: string;
  /** Quando houve rotação: para onde o arquivo cheio foi. */
  rotatedTo?: string;
}

/** Pasta `runs/` do workspace. */
export function runsDir(root: string): string {
  return path.join(root, ...RUNS_DIR);
}

/** `runs/<iniciativa>.jsonl`, ou `runs/workspace.jsonl` sem iniciativa. */
export function runEventFilePath(root: string, initiativeId: string | undefined): string {
  return path.join(runsDir(root), `${initiativeId ?? WORKSPACE_RUN_KEY}.jsonl`);
}

/** `runs/previous/<iniciativa>.jsonl`: o arquivo cheio mais recente da iniciativa (ou de `workspace`). */
export function previousRunEventFilePath(root: string, initiativeId: string | undefined): string {
  return path.join(runsDir(root), PREVIOUS_DIR, `${initiativeId ?? WORKSPACE_RUN_KEY}.jsonl`);
}

function countEvents(filePath: string, maxEvents: number): number {
  if (!fs.existsSync(filePath)) return 0;
  if (fs.statSync(filePath).size < maxEvents * MIN_EVENT_LINE_BYTES) return 0;
  return parseRunEvents(fs.readFileSync(filePath, "utf-8")).length;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Um caminho de arquivo que ainda não existe, com `-2`, `-3`... se o carimbo repetir. */
function freePath(dir: string, base: string): string {
  let candidate = path.join(dir, `${base}.jsonl`);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base}-${n}.jsonl`);
  return candidate;
}

/** Roda o arquivo cheio de `key`: o `previous` de antes vai para o histórico e o cheio vira o `previous`. Devolve o novo caminho do arquivo cheio. */
function rotate(root: string, key: string, active: string, now: Date): string {
  const dir = runsDir(root);
  const previousDir = path.join(dir, PREVIOUS_DIR);
  const previous = path.join(previousDir, `${key}.jsonl`);
  if (fs.existsSync(previous)) {
    const archiveDir = path.join(dir, RUNS_ARCHIVE_DIR);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(previous, freePath(archiveDir, `${key}.${stamp(now)}`));
  }
  fs.mkdirSync(previousDir, { recursive: true });
  fs.renameSync(active, previous);
  return previous;
}

/**
 * Valida o evento e grava uma linha no arquivo da iniciativa, sob lock, rodando
 * o arquivo cheio. Erro de validação volta como `FieldError` (nada é gravado);
 * erro de disco ou de lock propaga, como nas outras escritas de estado.
 */
export async function appendRunEvent(root: string, input: unknown, options?: AppendRunEventOptions): Promise<FieldResult<AppendedRunEvent>> {
  const validated = validateRunEvent(input);
  if (!validated.ok) return validated;
  const event = validated.value;

  if (event.initiative_id !== undefined && !SAFE_KEY.test(event.initiative_id)) {
    return {
      ok: false,
      error: {
        code: "USAGE",
        message: `valor inválido para --initiative_id: '${event.initiative_id}' — o id vira nome de arquivo: letras, números, '.', '-' e '_'`,
        field: "initiative_id",
        value: event.initiative_id,
      },
    };
  }

  const key = event.initiative_id ?? WORKSPACE_RUN_KEY;
  const filePath = runEventFilePath(root, event.initiative_id);
  const maxEvents = options?.maxEventsPerFile ?? RUN_EVENTS_PER_FILE;
  const line = `${JSON.stringify(event)}\n`;

  const rotatedTo = await withFileLock(
    filePath,
    () => {
      const rotated = countEvents(filePath, maxEvents) >= maxEvents ? rotate(root, key, filePath, options?.now?.() ?? new Date()) : undefined;
      fs.appendFileSync(filePath, line, "utf-8");
      return rotated;
    },
    options?.lock
  );
  return { ok: true, value: { event, path: filePath, ...(rotatedTo ? { rotatedTo } : {}) } };
}
