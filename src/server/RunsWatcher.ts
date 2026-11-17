/**
 * RunsWatcher.ts
 *
 * Fonte 2 (fora do processo) do event bus do State Service (roadmap
 * `mod-state-service`, item 2.3). Existe porque escritas feitas via CLI
 * (`helyx-state`, invocado por agentes via terminal) rodam num processo
 * SEPARADO do Extension Host — um publicador in-process (Fonte 1) nunca
 * vê essas escritas, só as feitas dentro do próprio processo da extensão.
 *
 * Um watcher centralizado de `.github/artifacts/runs/*.jsonl`, dentro do
 * State Service, substitui a necessidade de mais um watcher espalhado — a
 * wave 3.2 (Cockpit) vai remover os 5 watchers hoje existentes
 * (`CockpitNextController`, `AgentActivityProvider`, `HotspotProvider`,
 * `DeliveryStreamProvider`, `ArtifactValidationProvider`) quando migrarem
 * pra consumir SSE; isto aqui não antecipa essa migração (ADR-0005 continua
 * valendo — Cockpit ainda não consome nada disto), é só a centralização que
 * evita adicionar um 6º watcher redundante.
 *
 * Só lê o DELTA novo de cada arquivo (offset em bytes desde a última leitura)
 * — nunca reprocessa o `.jsonl` inteiro a cada mudança. Uma linha ainda
 * incompleta (escrita a meio, o mesmo cenário que `parseRunEvents` já tolera
 * ao ler o arquivo inteiro) fica retida: o offset só avança até a última
 * quebra de linha completa lida, então a próxima notificação completa o que
 * faltou.
 *
 * Dedup contra a Fonte 1: antes de publicar um evento lido do disco, consulta
 * `EventBus.wasRecentlyPublished` — se o mesmo evento já foi publicado
 * in-process (Fonte 1), não publica de novo.
 */
import * as fs from "fs";
import * as path from "path";
import { RUNS_DIR, parseRunEvents } from "../data/run-events-contract.pure";
import type { EventBus } from "./EventBus";
import type { FileWatch, FileWatcher } from "../adapters/files/FileWatcher";
import { VsCodeFileWatcher } from "../adapters/files/VsCodeFileWatcher";
import { BRAND } from "../data/brand.pure";

export class RunsWatcher {
  private _watcher: FileWatch | null = null;
  private readonly _offsets = new Map<string, number>();

  constructor(
    private readonly _root: string,
    private readonly _bus: EventBus,
    /** Porta de observação (F3.6); o container da extensão entrega a do VS Code. */
    private readonly _files: FileWatcher = new VsCodeFileWatcher()
  ) {}

  /** `true` enquanto o watcher estiver ativo (entre `start()` e `stop()`). */
  get isRunning(): boolean {
    return this._watcher !== null;
  }

  /** Sobe o `FileSystemWatcher` centralizado sobre `.github/artifacts/runs/*.jsonl`. Idempotente. */
  start(): void {
    if (this._watcher) return;

    const dir = path.join(this._root, ...RUNS_DIR);
    const watcher = this._files.watch(dir, "*.jsonl");
    watcher.onDidChange((filePath) => this.handleFileEvent(filePath));
    watcher.onDidCreate((filePath) => this.handleFileEvent(filePath));
    this._watcher = watcher;
  }

  /** Derruba o watcher e esquece os offsets acumulados — idempotente. */
  stop(): void {
    this._watcher?.dispose();
    this._watcher = null;
    this._offsets.clear();
  }

  /**
   * Lê o delta novo de um `.jsonl` e publica os eventos genuinamente novos no
   * bus (com dedup contra a Fonte 1). Público (não só chamado por `start()`)
   * porque é o ponto exato que um teste exercita ao simular uma notificação
   * de watcher sobre um arquivo real, sem depender do timing do
   * `fs.watch`/`FileSystemWatcher` do host.
   */
  handleFileEvent(filePath: string): void {
    try {
      const stat = fs.statSync(filePath);
      const prevOffset = this._offsets.get(filePath) ?? 0;

      if (stat.size < prevOffset) {
        // Arquivo truncado/recriado (não deveria acontecer num .jsonl
        // append-only, mas não custa não travar se acontecer) — relê do zero.
        this._offsets.set(filePath, 0);
        this.handleFileEvent(filePath);
        return;
      }
      if (stat.size === prevOffset) return; // nada novo

      const length = stat.size - prevOffset;
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(filePath, "r");
      try {
        fs.readSync(fd, buffer, 0, length, prevOffset);
      } finally {
        fs.closeSync(fd);
      }

      const chunk = buffer.toString("utf-8");
      const lastNewline = chunk.lastIndexOf("\n");
      if (lastNewline === -1) return; // só uma linha incompleta ainda — espera a próxima notificação

      this._offsets.set(filePath, prevOffset + lastNewline + 1);

      for (const event of parseRunEvents(chunk.slice(0, lastNewline + 1))) {
        const raw = event as unknown as Record<string, unknown>;
        if (this._bus.wasRecentlyPublished(raw)) continue; // já emitido pela Fonte 1 (in-process)
        this._bus.publish({ source: "runs-watcher", event: raw });
      }
    } catch (err) {
      console.error(`[${BRAND.name}] RunsWatcher: falha ao ler delta de ${filePath}:`, err);
    }
  }
}
