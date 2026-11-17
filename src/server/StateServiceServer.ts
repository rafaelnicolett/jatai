/**
 * StateServiceServer.ts
 *
 * API HTTP local do State Service (roadmap `mod-state-service`, item 2.2,
 * Wave 2). `node:http` puro — sem framework novo (Express etc.), pra manter
 * a extensão leve; um router mínimo escrito à mão é suficiente pro punhado
 * de endpoints desta wave.
 *
 * Bind SEMPRE em `127.0.0.1` — nunca `0.0.0.0`/rede externa (achado do
 * `security-report.md` referenciado no roadmap). Porta configurável — `0`
 * deixa o SO escolher uma porta livre; a porta efetivamente escolhida fica
 * disponível em `.port` depois de `start()` resolver, usada pelo servidor
 * MCP (item 2.4) via `server.json`.
 *
 * AUTENTICAÇÃO (item 2.5): todo endpoint exige o header
 * `Authorization: Bearer <token>`, EXCETO `GET /health` — decisão
 * deliberada: `/health` só confirma "estou vivo" (`{ ok: true }`), não
 * expõe nenhum dado de estado do workspace, e um cliente (ex.: um health
 * check externo, ou o próprio Cockpit antes de ter o token em mãos) precisa
 * de um jeito de perguntar "o serviço está de pé?" sem já precisar do
 * segredo. O `token` é obrigatório nas opções do construtor (nunca há modo
 * "sem auth") — gerado uma vez por ativação da extensão
 * (`generateStateServiceToken`, `state-service-auth.ts`), registro canônico
 * em `vscode.SecretStorage`, cópia em `server.json` só para o processo MCP
 * standalone alcançar (ver `state-service-info.ts` para a discussão do
 * trade-off de segurança dessa cópia). Requisição sem o header, ou com
 * valor errado, recebe `401` com corpo JSON `{ ok: false, error }` — nunca
 * vaza se foi "token errado" vs "token ausente", mensagem única.
 *
 * ENDPOINTS DE ESCRITA (item 3.1, roadmap `mod-state-service`, wave 3 —
 * Strangler Fig): mapeiam 1:1 os verbos que `cli/commands/initiatives.ts`/
 * `cli/commands/delivery-state.ts` já expõem via os métodos `*Atomic` de
 * `StateRepository` — é o MESMO motor de escrita (`atomicWrite`, lock de
 * arquivo), só alcançado via HTTP em vez de `argv`. Desde a F3.3 cada
 * endpoint só traduz HTTP ↔ `StateCommands` (`src/state/application`), o
 * MESMO caso de uso que o fallback do CLI roda (validação, escrita e evento
 * num lugar só — nada duplicado) e devolve o MESMO formato de
 * sucesso/erro que `printSuccess`/`printUsageError` já produzem no CLI
 * (`{ok:true, path, changed, ...}` / `{ok:false, error:{code,message,...}}`),
 * só que como corpo JSON HTTP em vez de linha de stdout. Erro de validação →
 * `400`; `*_NOT_FOUND` (iniciativa inexistente) → `404`; corpo não-JSON →
 * `400`; qualquer exceção inesperada → `500`. "Validação de schema em toda
 * escrita" (item 2.5 original do roadmap, adiado até aqui existir escrita
 * de verdade) é isto.
 *
 * EVENTO DE ESCRITA (item 3.2, achado corrigido aqui — antes nenhum dos 6
 * endpoints publicava nada no `EventBus`, ver `EventBus.ts` "Fonte 3"): toda
 * resposta `200` de um dos 6 endpoints acima publica um `RunEvent`
 * (`event_type: "artifact-written"`, o mesmo vocabulário que `RunsWatcher`
 * já usa — não introduz um 3º vocabulário de evento) via `_publishWrite`.
 * Falha de validação (400/404) ou exceção (500) NUNCA publica.
 *
 * Endpoints:
 *   GET  /health          → { ok: true } (público, sem auth)
 *   GET  /initiatives     → { ok: true, state: InitiativesState | null } (auth)
 *   GET  /delivery-state[?initiativeId=<id>] → { ok: true, state: DeliveryState | null } (auth)
 *   GET  /events          → SSE (item 2.3) — ver abaixo (auth).
 *   POST /initiatives                              → cria/upsert (auth)
 *   POST /initiatives/:id/switch-active            → troca `active:` (auth)
 *   POST /initiatives/:id/bump-phase               → bump `current_phase` (auth)
 *   POST /initiatives/:id/wave-items/:wave/:item   → upsert de wave item (auth)
 *   POST /delivery-state/upsert-phase              → upsert status/completed_at/artifacts de uma fase (auth)
 *   POST /delivery-state/upsert-checklist          → upsert de 1 item de checklist (auth)
 *   POST /gates/approve                            → aprovação humana de D1/D2/D3 (auth; G2, ADR-0024)
 *   POST /runs/append                              → evento de atividade de agente em runs/*.jsonl (auth; F5.2, contrato agent-activity)
 * Qualquer outro método/rota → 404/405 com o mesmo envelope `{ ok: false, error }`.
 *
 * `GET /events` (item 2.3, roadmap `mod-state-service`): assina o `EventBus`
 * interno (Fonte 1 in-process + Fonte 2 `RunsWatcher` fora
 * do processo, já deduplicadas entre si) e transmite cada evento como
 * Server-Sent Events — decisão travada em ADR-0005 (SSE, não WebSocket: caso
 * de uso é unidirecional State Service → cliente). Ao conectar, escreve os
 * headers SSE; a cada evento publicado no bus depois da conexão, escreve
 * `data: <json>\n\n`. Sem replay — quem conectar não vê nada anterior à
 * conexão (ver limitações no feature-report do item 2.3). Exige o mesmo
 * header de auth que os outros endpoints (não é mais exceção). Ninguém
 * consome isto de verdade ainda — a migração do Cockpit é wave 3.2, item
 * separado.
 *
 * Descoberta de porta pro servidor MCP (item 2.4): `start()` escreve
 * `.github/artifacts/.state-service/server.json` (`{ port, pid, startedAt,
 * token }`, ver `state-service-info.ts`) depois de resolver a porta;
 * `stop()` apaga — é a única forma de um processo Node separado (o servidor
 * MCP, spawned pelo cliente MCP, sem acesso a `context.globalState`/
 * `SecretStorage`) descobrir a porta E o token.
 */

import * as http from "http";
import type { StateRepository } from "../cli/lib/StateRepository";
import { EventBus, stateServiceEventBus } from "./EventBus";
import { removeStateServiceInfo, writeStateServiceInfo } from "./state-service-info";
import { isBearerTokenValid } from "./state-service-auth";
import type { FieldError } from "../core/validation/validation";
import { StateCommands, type StateCommandResult } from "../state/application/StateCommands";
import { gitUserName, type ApproverNameSource } from "../state/identity/git-user-name";
import { appendRunEvent } from "../state/runs/run-event-log";
import type { RunEvent } from "../data/run-events-contract.pure";
import { BRAND } from "../data/brand.pure";

export interface StateServiceServerOptions {
  /** Raiz do workspace cujo estado esta instância expõe. */
  root: string;
  /** Fonte de leitura e escrita — em produção, o singleton `stateRepository` (`YamlStateRepository`; o YAML é a única fonte, ADR-0017). */
  repository: StateRepository;
  /** `0` (padrão) = SO escolhe porta livre. */
  port?: number;
  /** Bus assinado por `GET /events` — default no singleton compartilhado (`stateServiceEventBus`), injetável para teste. */
  eventBus?: EventBus;
  /** Token Bearer exigido em todo endpoint exceto `/health` (item 2.5) — gerado uma vez por ativação (`generateStateServiceToken`), sem default: nunca há modo "sem auth". */
  token: string;
  /** Quem aprova um gate quando o corpo não traz `by` (ADR-0024): default o `user.name` do git do workspace. Injetável para teste. */
  approverName?: ApproverNameSource;
  /** Gravação dos eventos agent-activity de cada escrita (F5.2): default `appendRunEvent`, em `runs/*.jsonl` sob lock. */
  recordEvent?: typeof appendRunEvent;
}

/** Corpo de erro devolvido quando o header `Authorization: Bearer <token>` está ausente ou não bate com o token desta instância. Mensagem única (não distingue "ausente" de "errado") — não vaza informação sobre o token esperado. */
export const UNAUTHORIZED_ERROR = "UNAUTHORIZED: header 'Authorization: Bearer <token>' ausente ou inválido";

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

/** `*_NOT_FOUND` (iniciativa inexistente) vira 404; qualquer outro `FieldError` (validação) vira 400 — mesma distinção que o CLI já faz via `printUsageError`/exit code, adaptada pra status HTTP. */
function statusForFieldError(code: string): number {
  return code.endsWith("_NOT_FOUND") ? 404 : 400;
}

function sendFieldError(res: http.ServerResponse, error: FieldError): void {
  sendJson(res, statusForFieldError(error.code), { ok: false, error });
}

/** Equivalente HTTP de `asString` do CLI (`commands/*.ts`) — só aceita string de verdade do corpo JSON. */
function asHttpString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Filtra um array JSON pros elementos que são string — equivalente ao array já vindo de `--flag` repetido no CLI. */
function asHttpStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

/** Equivalente HTTP de `--requires-approval` (flag booleana opt-in do CLI) — só aceita booleano de verdade do corpo JSON; ausente/qualquer outra coisa vira `undefined` (não toca no campo). */
function asHttpBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Teto do corpo JSON de uma escrita (A16c). Os endpoints recebem poucos campos curtos; 1 MiB sobra. */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

/** Mensagem do erro com que `readJsonBody` rejeita um corpo acima de `MAX_JSON_BODY_BYTES`. */
const BODY_TOO_LARGE = "BODY_TOO_LARGE";

/**
 * Lê e parseia o corpo da requisição como JSON — rejeita (não resolve) se não for JSON válido; corpo vazio vira `{}`.
 * Corpo acima de `MAX_JSON_BODY_BYTES` rejeita assim que passa do limite; o resto é drenado sem acumular em memória.
 */
function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new Error(BODY_TOO_LARGE));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        resolve(typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export class StateServiceServer {
  private _server: http.Server | null = null;
  private _port = 0;
  private readonly _eventBus: EventBus;
  /** Os casos de uso de escrita (F3.3): o mesmo código que o fallback do CLI roda. Este servidor só traduz HTTP ↔ resultado. */
  private readonly _commands: StateCommands;

  constructor(private readonly _options: StateServiceServerOptions) {
    this._eventBus = _options.eventBus ?? stateServiceEventBus;
    this._commands = new StateCommands({
      root: _options.root,
      repository: _options.repository,
      onWrite: (message, phaseId, metadata): void => this._publishWrite(message, phaseId, metadata),
      approverName: _options.approverName ?? gitUserName,
      recordEvent: _options.recordEvent ?? appendRunEvent,
    });
  }

  /** Porta em uso — `0` antes de `start()` resolver. */
  get port(): number {
    return this._port;
  }

  /** `true` enquanto o servidor estiver de pé (entre `start()` resolvido e `stop()`). */
  get isRunning(): boolean {
    return this._server !== null;
  }

  /** Sobe o servidor em `127.0.0.1`. Resolve com a porta efetivamente escolhida. */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this._handle(req, res));
      server.once("error", reject);
      server.listen(this._options.port ?? 0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        const address = server.address();
        this._port = typeof address === "object" && address !== null ? address.port : 0;
        this._server = server;
        // Ponte de descoberta pro servidor MCP (item 2.4) — processo Node
        // separado, sem acesso a `context.globalState`. Não crítico pro
        // servidor HTTP em si: falha ao escrever é só logada, nunca derruba
        // o `start()` (o State Service continua funcionando via YAML/API
        // mesmo se este arquivo não puder ser criado).
        try {
          writeStateServiceInfo(this._options.root, {
            port: this._port,
            pid: process.pid,
            startedAt: new Date().toISOString(),
            token: this._options.token,
          });
        } catch (err) {
          console.error(`[${BRAND.name}] State Service: falha ao escrever arquivo de descoberta (server.json):`, err);
        }
        resolve(this._port);
      });
    });
  }

  /** Para o servidor — idempotente (`stop()` sem `start()` prévio não lança). */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      const server = this._server;
      if (!server) {
        resolve();
        return;
      }
      this._server = null;
      removeStateServiceInfo(this._options.root);
      server.close(() => resolve());
    });
  }

  /** `true` se o header `Authorization: Bearer <token>` bate com o token desta instância (tempo constante, A16d). */
  private _isAuthorized(req: http.IncomingMessage): boolean {
    return isBearerTokenValid(req.headers.authorization, this._options.token);
  }

  private _handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const method = req.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      // Todo endpoint daqui pra baixo exige auth — só GET /health é público
      // (ver nota de topo do arquivo sobre a decisão). Checado ANTES de
      // decidir se o método/rota existe — não vaza se uma rota existiria
      // pra quem não está autenticado (ver achado no relatório do item 2.5).
      if (!this._isAuthorized(req)) {
        sendJson(res, 401, { ok: false, error: UNAUTHORIZED_ERROR });
        return;
      }

      if (method === "GET") {
        this._handleGet(url, req, res);
        return;
      }

      if (method === "POST") {
        // `_handlePost` é assíncrono (precisa ler o corpo da requisição) —
        // tem seu PRÓPRIO try/catch interno pra erro 500 (o try/catch deste
        // método síncrono já terminou de rodar antes da promise resolver).
        void this._handlePost(url, req, res);
        return;
      }

      sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    } catch (err) {
      console.error(`[${BRAND.name}] State Service HTTP: erro ao atender requisição:`, err);
      sendJson(res, 500, { ok: false, error: "INTERNAL" });
    }
  }

  private _handleGet(url: URL, req: http.IncomingMessage, res: http.ServerResponse): void {
    if (url.pathname === "/initiatives") {
      const state = this._options.repository.loadInitiativesState(this._options.root);
      sendJson(res, 200, { ok: true, state });
      return;
    }

    if (url.pathname === "/delivery-state") {
      const initiativeId = url.searchParams.get("initiativeId") ?? undefined;
      const state = this._options.repository.loadDeliveryState(this._options.root, initiativeId);
      sendJson(res, 200, { ok: true, state });
      return;
    }

    if (url.pathname === "/events") {
      this._handleEvents(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "NOT_FOUND" });
  }

  /**
   * Dispatch dos endpoints de ESCRITA (item 3.1). Lê o corpo (JSON inválido
   * → 400), casa a rota, valida os campos (mesma validação pura do CLI) e
   * chama o método `*Atomic` correspondente do `StateRepository` — o MESMO
   * motor de escrita que o CLI já usa. Qualquer exceção inesperada durante o
   * processamento (não durante a leitura do corpo, já tratada à parte) vira
   * 500 — este método tem seu próprio try/catch porque roda depois de
   * `_handle` (síncrono) já ter retornado.
   */
  private async _handlePost(url: URL, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      const message = err instanceof Error && err.message === BODY_TOO_LARGE
        ? `corpo da requisição excede o limite de ${MAX_JSON_BODY_BYTES} bytes`
        : "corpo da requisição não é JSON válido";
      sendJson(res, 400, { ok: false, error: { code: "INVALID_JSON", message } });
      return;
    }

    try {
      if (url.pathname === "/initiatives") {
        await this._writeInitiative(body, res);
        return;
      }

      let match = url.pathname.match(/^\/initiatives\/([^/]+)\/switch-active$/);
      if (match) {
        await this._switchActiveInitiative(decodeURIComponent(match[1]!), res);
        return;
      }

      match = url.pathname.match(/^\/initiatives\/([^/]+)\/bump-phase$/);
      if (match) {
        await this._bumpInitiativePhase(decodeURIComponent(match[1]!), body, res);
        return;
      }

      match = url.pathname.match(/^\/initiatives\/([^/]+)\/wave-items\/([^/]+)\/([^/]+)$/);
      if (match) {
        await this._upsertWaveItem(decodeURIComponent(match[1]!), decodeURIComponent(match[2]!), decodeURIComponent(match[3]!), body, res);
        return;
      }

      if (url.pathname === "/delivery-state/upsert-phase") {
        await this._upsertDeliveryPhase(body, res);
        return;
      }

      if (url.pathname === "/delivery-state/upsert-checklist") {
        await this._upsertDeliveryChecklist(body, res);
        return;
      }

      if (url.pathname === "/gates/approve") {
        await this._approveGate(body, res);
        return;
      }

      if (url.pathname === "/runs/append") {
        await this._appendRunEvent(body, res);
        return;
      }

      sendJson(res, 404, { ok: false, error: "NOT_FOUND" });
    } catch (err) {
      console.error(`[${BRAND.name}] State Service HTTP: erro ao atender requisição de escrita:`, err);
      sendJson(res, 500, { ok: false, error: "INTERNAL" });
    }
  }

  /**
   * Publica um evento de "escrita de estado" no `EventBus` (item 3.2, achado
   * corrigido aqui — ver nota de topo do arquivo e `EventBus.ts` "Fonte 3").
   * Reaproveita o vocabulário `RunEvent` já usado por `RunsWatcher`:
   * `event_type: "artifact-written"` já significa exatamente isto ("Artefato
   * gravado no disco"), então não introduz um 3º vocabulário de evento (só
   * `TelemetryEvent`/`RunEvent` coexistiam antes, achado do item 2.3).
   * `run_id` não existe de verdade pra uma escrita HTTP avulsa (não é um
   * "run" de agente) — usa a constante `"state-service-write"`, documentando
   * a origem sem fingir uma correlação de run que não existe. Chamar SÓ
   * depois de uma escrita bem-sucedida (nunca em validação/exceção).
   */
  private _publishWrite(message: string, phaseId: string | undefined, metadata: Record<string, unknown>): void {
    const event: RunEvent = {
      run_id: "state-service-write",
      event_type: "artifact-written",
      timestamp: new Date().toISOString(),
      message,
      metadata,
      ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
    };
    // Sem `wasRecentlyPublished`: investigado (ver comentário em `EventBus.ts`)
    // que não há cenário real de dupla-publicação pra esta fonte — RunsWatcher
    // só observa `runs/*.jsonl`, nunca os YAMLs de estado que este método cobre.
    this._eventBus.publish({ source: "state-write", event: event as unknown as Record<string, unknown> });
  }

  /** Traduz o resultado de um `StateCommands` para HTTP: 200 com o envelope, ou 400/404 com o `FieldError`. */
  private _sendCommandResult(res: http.ServerResponse, result: StateCommandResult): void {
    if (result.ok) sendJson(res, 200, result.body);
    else sendFieldError(res, result.error);
  }

  /** `POST /initiatives` — `helyx-state initiatives create`, via HTTP. */
  private async _writeInitiative(body: Record<string, unknown>, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.upsertInitiative({
      id: asHttpString(body.id),
      name: asHttpString(body.name),
      status: asHttpString(body.status),
      stream: asHttpString(body.stream),
      currentPhase: asHttpString(body.currentPhase),
      mode: asHttpString(body.mode),
      type: asHttpString(body.type),
      owner: asHttpString(body.owner),
      priority: asHttpString(body.priority),
      createdAt: asHttpString(body.createdAt),
      reason: asHttpString(body.reason),
      setActive: body.active === true,
    }));
  }

  /** `POST /initiatives/:id/switch-active` — `helyx-state initiatives switch-active`, via HTTP. */
  private async _switchActiveInitiative(id: string, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.switchActiveInitiative({ id }));
  }

  /** `POST /initiatives/:id/bump-phase` — `helyx-state initiatives bump-phase`, via HTTP. */
  private async _bumpInitiativePhase(id: string, body: Record<string, unknown>, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.bumpInitiativePhase({ id, phase: asHttpString(body.phase) }));
  }

  /** `POST /initiatives/:id/wave-items/:wave/:item` — `helyx-state initiatives upsert-wave-item`, via HTTP. */
  private async _upsertWaveItem(id: string, wave: string, item: string, body: Record<string, unknown>, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.upsertWaveItem({
      id,
      wave,
      item,
      status: asHttpString(body.status),
      repo: asHttpString(body.repo),
      completedAt: asHttpString(body.completedAt),
      artifacts: asHttpStringArray(body.artifacts),
      summary: asHttpString(body.summary),
      commit: asHttpString(body.commit),
      knownBugsPinned: asHttpStringArray(body.knownBugsPinned),
      mergeBlock: asHttpString(body.mergeBlock),
      requiresApproval: asHttpBoolean(body.requiresApproval),
      reason: asHttpString(body.reason),
      // ADR-0006: default "wave" — retrocompat total, um cliente HTTP que nunca
      // soube desse campo continua escrevendo em wave_status como sempre.
      group: asHttpString(body.group) === "epic" ? "epic" : "wave",
    }));
  }

  /** `POST /delivery-state/upsert-phase` — `helyx-state delivery-state upsert-phase`, via HTTP. */
  private async _upsertDeliveryPhase(body: Record<string, unknown>, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.upsertDeliveryPhase({
      global: body.global,
      initiativeId: asHttpString(body.initiativeId),
      phase: asHttpString(body.phase),
      status: asHttpString(body.status),
      reason: asHttpString(body.reason),
      agent: asHttpString(body.agent),
      completedAt: asHttpString(body.completedAt),
      artifacts: asHttpStringArray(body.artifacts),
    }));
  }

  /** `POST /delivery-state/upsert-checklist` — `helyx-state delivery-state upsert-checklist`, via HTTP. */
  private async _upsertDeliveryChecklist(body: Record<string, unknown>, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.upsertDeliveryChecklistItem({
      global: body.global,
      initiativeId: asHttpString(body.initiativeId),
      phase: asHttpString(body.phase),
      item: asHttpString(body.item),
      checked: body.checked,
      section: asHttpString(body.section),
    }));
  }

  /**
   * `POST /gates/approve` — `<cli> gates approve`, via HTTP (G2, ADR-0024).
   * Existe para o CLI seguir o mesmo caminho dos outros verbos de escrita
   * (HTTP primeiro, evento de escrita) e para o Cockpit (F4.2). Sem `by` no
   * corpo, quem aprova é o `user.name` do git do workspace; sem ele, a
   * resposta é `400 MISSING_FLAG` com `field: "by"`, e o Cockpit pergunta o
   * nome. Não há tool MCP equivalente, por decisão do titular (ADR-0024):
   * gate é aprovado só por humano.
   */
  private async _approveGate(body: Record<string, unknown>, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.approveGate({
      gate: asHttpString(body.gate),
      initiativeId: asHttpString(body.initiativeId),
      repoId: asHttpString(body.repoId),
      at: asHttpString(body.at),
      by: asHttpString(body.by),
      note: asHttpString(body.note),
    }));
  }

  /**
   * `POST /runs/append` — `<cli> runs append` e a tool MCP `append_run_event`,
   * via HTTP (F5.2, contrato agent-activity §4). O corpo usa os nomes do
   * contrato (`event_type`, `agent_id`, `initiative_id`, `artifact_path`...).
   * Só tipos de agente; o evento entra em `runs/<iniciativa>.jsonl` sob lock,
   * e o `RunsWatcher` o leva ao SSE como qualquer append. Sem `onWrite`: não
   * é escrita de estado, e publicar aqui duplicaria o evento no SSE.
   */
  private async _appendRunEvent(body: Record<string, unknown>, res: http.ServerResponse): Promise<void> {
    this._sendCommandResult(res, await this._commands.appendRunEvent({
      event_type: asHttpString(body.event_type),
      agent_id: asHttpString(body.agent_id),
      phase_id: asHttpString(body.phase_id),
      initiative_id: asHttpString(body.initiative_id),
      task_id: asHttpString(body.task_id),
      repo_id: asHttpString(body.repo_id),
      artifact_path: asHttpString(body.artifact_path),
      harness: asHttpString(body.harness),
      actor: asHttpString(body.actor),
      message: asHttpString(body.message),
      reason: asHttpString(body.reason),
      run_id: asHttpString(body.run_id),
      timestamp: asHttpString(body.timestamp),
    }));
  }

  /**
   * `GET /events` — SSE (item 2.3). Escreve os headers, assina o `EventBus` e
   * repassa cada evento publicado dali em diante. Remove a assinatura assim
   * que o cliente desconecta (`close`/`error`) — sem isso o listener vaza a
   * cada conexão SSE encerrada.
   */
  private _handleEvents(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const unsubscribe = this._eventBus.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Envia os headers pro socket já — sem isto, o Node só os manda junto do
    // primeiro `res.write()` (o primeiro evento), e o cliente nunca saberia
    // que a conexão SSE está de pé antes do primeiro evento chegar.
    res.flushHeaders();

    const cleanup = (): void => {
      unsubscribe();
    };
    req.once("close", cleanup);
    req.once("error", cleanup);
  }
}
