/**
 * RunEventReader.ts — leitura incremental de `.github/artifacts/runs/*.jsonl`
 * (F5.2, contrato agent-activity §6; fecha o H-GAP-18).
 *
 * Antes, `loadRunEvents` relia todos os arquivos inteiros a cada chamada, e
 * o Cockpit chama a cada 4 s e a cada evento do SSE. Com 5.000 eventos por
 * arquivo (e dois arquivos por iniciativa depois da rotação), isso é ler
 * megabytes para achar as 200 linhas mais recentes.
 *
 * Agora cada arquivo tem um cursor: o deslocamento (em bytes) até a última
 * quebra de linha lida, os 64 bytes antes dele (a âncora) e os eventos que
 * ainda podem entrar na janela. A próxima leitura só lê os bytes novos.
 *
 * A saída é a MESMA da leitura completa, em qualquer caso:
 * - cada arquivo guarda os seus `limit` eventos mais recentes por (horário,
 *   linha); a janela global de `limit` está sempre contida nessa união;
 * - a linha final sem quebra (escrita a meio) é relida a cada vez e entra se
 *   já for JSON válido, como na leitura completa;
 * - arquivo encolhido, trocado (outro inode) ou reescrito (âncora diferente)
 *   é relido inteiro; arquivo que sumiu sai da janela.
 *
 * O acesso ao disco passa por uma porta (`RunFiles`), para o teste contar os
 * bytes lidos sem `vi.mock`.
 */
import * as fs from "fs";
import * as path from "path";
import { RUNS_DIR, RUNS_REL, parseRunEvents, type RunEvent } from "../../core/contracts/run-events-contract.pure";
import { PREVIOUS_DIR } from "./run-event-log";
import type { OnDataIssue } from "../../core/contracts/data-health";
import { BRAND } from "../../core/brand/brand.pure";

/** Porta de leitura dos arquivos de eventos. */
export interface RunFiles {
  /** Nomes dos arquivos da pasta, ou `null` se ela não existe. */
  list(dir: string): string[] | null;
  /** Tamanho e inode, ou `null` se o arquivo não existe. */
  stat(file: string): { size: number; ino: number } | null;
  /** Bytes de `[start, end)`. */
  read(file: string, start: number, end: number): Buffer;
}

export const nodeRunFiles: RunFiles = {
  list: (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : null),
  stat: (file) => {
    try {
      const st = fs.statSync(file);
      return { size: st.size, ino: st.ino };
    } catch {
      return null;
    }
  },
  read: (file, start, end) => {
    const length = Math.max(0, end - start);
    const buffer = Buffer.alloc(length);
    if (length === 0) return buffer;
    const fd = fs.openSync(file, "r");
    try {
      let done = 0;
      while (done < length) {
        const n = fs.readSync(fd, buffer, done, length - done, start + done);
        if (n === 0) break;
        done += n;
      }
      return done === length ? buffer : buffer.subarray(0, done);
    } finally {
      fs.closeSync(fd);
    }
  },
};

/** Bytes guardados antes do deslocamento para saber se o arquivo foi reescrito. */
const ANCHOR_BYTES = 64;
const NEWLINE = 0x0a;

interface Indexed {
  event: RunEvent;
  /** Ordem da linha no arquivo: desempata horários iguais como a leitura completa. */
  index: number;
}

interface FileCursor {
  ino: number;
  /** Bytes lidos até a última quebra de linha. */
  offset: number;
  anchor: Buffer;
  /** Quantos eventos completos já foram lidos (o próximo índice). */
  count: number;
  /** Os eventos que ainda podem entrar na janela, na ordem do arquivo. */
  kept: Indexed[];
  /** A janela para a qual `kept` foi podado. */
  limit: number;
}

function byTime(a: Indexed, b: Indexed): number {
  return a.event.timestamp.localeCompare(b.event.timestamp) || a.index - b.index;
}

/** Os `limit` eventos mais recentes por (horário, linha), na ordem do arquivo. */
function prune(kept: Indexed[], limit: number): Indexed[] {
  if (kept.length <= limit) return kept;
  const keep = new Set([...kept].sort(byTime).slice(-limit));
  return kept.filter((k) => keep.has(k));
}

export class RunEventReader {
  private readonly _cursors = new Map<string, FileCursor>();

  constructor(private readonly _files: RunFiles = nodeRunFiles) {}

  /**
   * Os eventos do workspace, do mais antigo ao mais recente, com no máximo
   * `limit` (a janela de `loadRunEvents`). Falha de leitura vira
   * `DataSourceIssue` e lista vazia, como antes.
   */
  read(workspaceRoot: string, limit = 200, onError?: OnDataIssue): RunEvent[] {
    const dir = path.join(workspaceRoot, ...RUNS_DIR);
    // O topo de runs/ e o arquivo cheio mais recente de cada iniciativa (runs/previous/): a janela ao vivo.
    const previousDir = path.join(dir, PREVIOUS_DIR);
    try {
      const files = [...this._jsonlFiles(dir), ...this._jsonlFiles(previousDir)];
      const present = new Set(files);
      this._forget(dir, present);
      this._forget(previousDir, present);
      const all: RunEvent[] = [];
      for (const file of files) all.push(...this._readFile(file, limit));
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return all.slice(-limit);
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao ler ${RUNS_REL}:`, err);
      onError?.({ source: "run-events", message: `falha ao ler ${RUNS_REL}: ${(err as Error).message}` });
      return [];
    }
  }

  /** Os `.jsonl` de `dir` (só o nível dele), ou nenhum se a pasta não existe. */
  private _jsonlFiles(dir: string): string[] {
    return (this._files.list(dir) ?? []).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f));
  }

  /** Esquece os cursores de arquivos de `dir` que não existem mais. */
  private _forget(dir: string, present: Set<string>): void {
    for (const file of this._cursors.keys()) {
      if (path.dirname(file) === dir && !present.has(file)) this._cursors.delete(file);
    }
  }

  private _readFile(file: string, limit: number): RunEvent[] {
    const st = this._files.stat(file);
    if (!st) {
      this._cursors.delete(file);
      return [];
    }
    let cursor = this._cursors.get(file);
    let chunk: Buffer;
    if (cursor && cursor.ino === st.ino && cursor.limit >= limit && st.size >= cursor.offset) {
      const anchorStart = cursor.offset - cursor.anchor.length;
      const bytes = this._files.read(file, anchorStart, st.size);
      if (bytes.subarray(0, cursor.anchor.length).equals(cursor.anchor)) {
        chunk = bytes.subarray(cursor.anchor.length);
      } else {
        cursor = undefined;
        chunk = this._files.read(file, 0, st.size);
      }
    } else {
      cursor = undefined;
      chunk = this._files.read(file, 0, st.size);
    }
    if (!cursor) cursor = { ino: st.ino, offset: 0, anchor: Buffer.alloc(0), count: 0, kept: [], limit };

    const lastNewline = chunk.lastIndexOf(NEWLINE);
    const complete = lastNewline === -1 ? Buffer.alloc(0) : chunk.subarray(0, lastNewline + 1);
    const tail = lastNewline === -1 ? chunk : chunk.subarray(lastNewline + 1);

    if (complete.length > 0) {
      const fresh = parseRunEvents(complete.toString("utf-8")).map((event, i) => ({ event, index: cursor.count + i }));
      cursor.count += fresh.length;
      cursor.kept = prune([...cursor.kept, ...fresh], limit);
      cursor.offset += complete.length;
      const readSoFar = Buffer.concat([cursor.anchor, complete]);
      cursor.anchor = Buffer.from(readSoFar.subarray(Math.max(0, readSoFar.length - ANCHOR_BYTES)));
    }
    cursor.ino = st.ino;
    cursor.limit = limit;
    this._cursors.set(file, cursor);

    // A linha final sem quebra é relida a cada vez: entra se já for JSON completo, como na leitura inteira.
    const pending = tail.length > 0 ? parseRunEvents(tail.toString("utf-8")) : [];
    return [...cursor.kept.map((k) => k.event), ...pending];
  }
}

/** O leitor do processo: o Cockpit chama `loadRunEvents` a cada 4 s e a cada evento do SSE. */
export const runEventReader = new RunEventReader();
