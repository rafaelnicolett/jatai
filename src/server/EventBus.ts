/**
 * EventBus.ts
 *
 * Barramento de eventos in-process do State Service (roadmap `mod-state-service`,
 * item 2.3 — "Barramento de eventos: `RunEvent` vira publish real"). Duas
 * fontes publicam aqui:
 *
 *   - Fonte 1 (in-process): quem roda dentro do Extension Host e publica
 *     direto (hoje nenhum produtor: o `TelemetryBuffer`, que nunca foi
 *     instanciado, saiu no corte da F2.1).
 *   - Fonte 2 (fora do processo): `RunsWatcher`, que detecta escrita feita por
 *     um processo separado (CLI `helyx-state`, invocado por agentes via
 *     terminal — o Extension Host nunca vê essa escrita diretamente).
 *
 * `StateServiceServer` assina este bus no endpoint `GET /events` (SSE) e
 * repassa cada evento pro cliente conectado. Sem persistência/replay — um
 * evento publicado sem nenhum assinante conectado é perdido (ver limitações
 * no feature-report do item 2.3).
 *
 * Dedup: toda publicação fica "lembrada" por um TTL curto
 * (`DEFAULT_DEDUP_TTL_MS`). `wasRecentlyPublished` deixa a Fonte 2 checar,
 * antes de publicar, se o mesmo evento já passou pelo bus (tipicamente vindo
 * da Fonte 1) — evita notificar o cliente SSE duas vezes pro mesmo evento.
 *
 * Fonte 3 (in-process, item 3.2 — achado corrigido aqui): os 6 endpoints de
 * ESCRITA do `StateServiceServer` (`POST /initiatives`, .../switch-active,
 * .../bump-phase, .../wave-items/:wave/:item, `POST
 * /delivery-state/upsert-phase`, `POST /delivery-state/upsert-checklist`)
 * publicam aqui logo após gravar com sucesso — sem isso, uma escrita feita
 * via CLI (que tenta o State Service primeiro) ou MCP não gerava NENHUM
 * evento SSE, só o poll de 4s do Cockpit notava a mudança. Fonte nova
 * (`"state-write"`), NÃO passa por `wasRecentlyPublished`: investigado que
 * não há cenário real de dupla-publicação — `RunsWatcher` (Fonte 2) só
 * observa `.github/artifacts/runs/*.jsonl`, nunca
 * `initiatives.yaml`/`delivery-state.yaml`, e o fallback do CLI pra escrita
 * direta em YAML só roda QUANDO o caminho HTTP falhou (nunca em paralelo ou
 * depois de um sucesso HTTP) — ver
 * `feature-report-helyx-vscode-write-endpoints-events.md`.
 */
import { EventEmitter } from "events";

/** Origem do evento — só para diagnóstico; o cliente SSE não deve depender disto para se comportar diferente por fonte. */
export type EventBusSource = "telemetry" | "runs-watcher" | "state-write";

export const EVENT_BUS_SOURCES = ["telemetry", "runs-watcher", "state-write"] as const;

export interface StateServiceEvent {
  source: EventBusSource;
  /** Payload bruto do evento (hoje: `TelemetryEvent` da Fonte 1 ou `RunEvent` da Fonte 2 — os dois shapes coexistem, não unificados nesta wave). */
  event: Record<string, unknown>;
}

const DEFAULT_DEDUP_TTL_MS = 5_000;
const EVENT_CHANNEL = "event";

function fingerprint(event: Record<string, unknown>): string {
  return JSON.stringify({
    run_id: event["run_id"],
    event_type: event["event_type"],
    timestamp: event["timestamp"],
    phase_id: event["phase_id"],
    agent_id: event["agent_id"],
  });
}

export class EventBus {
  private readonly _emitter = new EventEmitter();
  private readonly _seen = new Map<string, number>();

  constructor(private readonly _dedupTtlMs: number = DEFAULT_DEDUP_TTL_MS) {
    // Muitos clientes SSE podem assinar ao mesmo tempo — sem isto, o Node avisa
    // "MaxListenersExceededWarning" a partir do 11º assinante.
    this._emitter.setMaxListeners(0);
  }

  /** Publica um evento pro bus. Fontes in-process (Fonte 1) chamam sempre — são a origem autoritativa. */
  publish(event: StateServiceEvent): void {
    this._remember(event.event);
    this._emitter.emit(EVENT_CHANNEL, event);
  }

  /** A Fonte 2 (watcher fora do processo) consulta isto ANTES de publicar, pra não duplicar um evento que a Fonte 1 já emitiu (mesmo evento, dois caminhos de detecção). */
  wasRecentlyPublished(event: Record<string, unknown>): boolean {
    this._prune();
    return this._seen.has(fingerprint(event));
  }

  /** Quantos assinantes ativos agora — só diagnóstico/teste (ex.: confirmar que uma conexão SSE encerrada não vazou o listener). */
  get subscriberCount(): number {
    return this._emitter.listenerCount(EVENT_CHANNEL);
  }

  /** Assina o bus. Retorna a função de cancelamento — o assinante DEVE chamá-la ao se desconectar, senão o listener vaza. */
  subscribe(listener: (event: StateServiceEvent) => void): () => void {
    this._emitter.on(EVENT_CHANNEL, listener);
    return () => {
      this._emitter.off(EVENT_CHANNEL, listener);
    };
  }

  private _remember(event: Record<string, unknown>): void {
    this._prune();
    this._seen.set(fingerprint(event), Date.now());
  }

  private _prune(): void {
    const cutoff = Date.now() - this._dedupTtlMs;
    for (const [key, ts] of this._seen) {
      if (ts < cutoff) this._seen.delete(key);
    }
  }
}

/** Instância compartilhada do processo do Extension Host — usada por `RunsWatcher` e `StateServiceServer` quando nenhuma outra é injetada explicitamente. */
export const stateServiceEventBus = new EventBus();
