/**
 * StateServiceSseClient.ts
 *
 * Cliente SSE genérico (`node:http` puro — `EventSource` não existe no
 * runtime do Extension Host) para `GET /events` do State Service local
 * (item 2.3). Consumido pelo Cockpit (`CockpitNextController`) e por
 * `ArtifactValidationProvider` (roadmap `mod-state-service`, item 3.2, Wave
 * 3) — cada evento recebido é tratado como "algo mudou, busque o estado
 * atual de novo" (o SSE não tem replay/histórico, ver feature-report do
 * item 2.3), nunca como delta autoritativo — quem consome decide o que
 * refazer.
 *
 * Duas situações que este cliente resolve, das quais nenhuma é "serviço
 * fora do ar" no sentido do item 3.1 (CLI, processo externo): aqui o
 * `StateServiceServer` roda no MESMO processo (Extension Host), então:
 *
 *   1. Timing de subida: `StateServiceServer.start()` é assíncrono; o
 *      Cockpit pode ativar antes do servidor terminar de subir. `discover`
 *      é chamado a cada tentativa de conexão (não uma vez só) — se ainda não
 *      há `server.json`, a primeira tentativa falha e o backoff abaixo cobre
 *      o "retry curto" sem exigir que quem construiu o cliente já saiba a
 *      porta.
 *   2. Desconexão (servidor reiniciou, conexão caiu): reconecta sozinho,
 *      backoff exponencial simples (dobra a cada tentativa, com teto), reseta
 *      pra 0 assim que uma conexão é aceita de novo.
 *
 * Não interpreta o conteúdo de `data: <json>` além de extrair a string bruta
 * — `onEvent` recebe o payload cru (`onEvent: (raw: string) => void`),
 * quem consome decide o que fazer (os dois vocabulários de evento,
 * `TelemetryEvent`/`RunEvent`, coexistem sem unificação nesta wave, ver
 * feature-report do item 2.3).
 */
import * as http from "http";
import { type StateServiceInfo } from "./state-service-info";

export interface StateServiceSseClientOptions {
  /** Descobre porta/token pra tentar a próxima conexão — chamado a cada tentativa (não só na primeira), cobre o servidor subir depois da primeira falha. `null` = ainda não há `server.json`. */
  discover: () => StateServiceInfo | null;
  /** Uma linha `data: <json>` completa, sem o prefixo `data: ` nem o `\n\n` final. */
  onEvent: (raw: string) => void;
  /** Diagnóstico opcional — não afeta o comportamento de reconexão. */
  onConnectionChange?: (connected: boolean) => void;
  /** Injetável para teste — default `http.request`. */
  httpRequest?: typeof http.request;
  /** Atraso da 1ª tentativa de reconexão, em ms — default 250. Dobra a cada tentativa subsequente até `maxRetryDelayMs`. */
  initialRetryDelayMs?: number;
  /** Teto do backoff — default 5000ms. */
  maxRetryDelayMs?: number;
}

const DEFAULT_INITIAL_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

/** Cliente SSE com reconexão automática (backoff exponencial) e re-descoberta de porta/token a cada tentativa. */
export class StateServiceSseClient {
  private _req: http.ClientRequest | null = null;
  private _stopped = true;
  private _retryAttempt = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly _options: StateServiceSseClientOptions) {}

  /** `true` enquanto uma requisição HTTP de fato estiver em voo (não distingue "conectando" de "conectado" — só usado por teste). */
  get isConnecting(): boolean {
    return this._req !== null;
  }

  start(): void {
    this._stopped = false;
    this._connect();
  }

  /** Idempotente — para a conexão ativa (se houver) e cancela qualquer retry agendado. Chamável várias vezes sem erro. */
  stop(): void {
    this._stopped = true;
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    if (this._req) {
      this._req.destroy();
      this._req = null;
    }
  }

  private _connect(): void {
    const info = this._options.discover();
    if (!info) {
      this._scheduleRetry();
      return;
    }

    const httpRequest = this._options.httpRequest ?? http.request;
    let buffer = "";

    const req = httpRequest({
      host: "127.0.0.1",
      port: info.port,
      path: "/events",
      method: "GET",
      headers: { Authorization: `Bearer ${info.token}` },
    });
    this._req = req;

    req.on("response", (res) => {
      this._retryAttempt = 0;
      this._options.onConnectionChange?.(true);

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");
        const messages = buffer.split("\n\n");
        buffer = messages.pop() ?? "";
        for (const message of messages) {
          const dataLine = message.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) this._options.onEvent(dataLine.slice("data: ".length));
        }
      });
      res.on("end", () => this._handleDisconnect());
      res.on("error", () => this._handleDisconnect());
    });

    req.on("error", () => this._handleDisconnect());
    req.end();
  }

  private _handleDisconnect(): void {
    this._req = null;
    if (this._stopped) return;
    this._options.onConnectionChange?.(false);
    this._scheduleRetry();
  }

  private _scheduleRetry(): void {
    if (this._stopped) return;
    const initial = this._options.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS;
    const max = this._options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    const delay = Math.min(initial * 2 ** this._retryAttempt, max);
    this._retryAttempt++;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = undefined;
      if (!this._stopped) this._connect();
    }, delay);
  }
}
