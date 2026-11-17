/**
 * state-service-client.ts — o cliente HTTP único do State Service (ADR-0017,
 * F3.3).
 *
 * Antes havia três implementações quase iguais de "descobrir `server.json` →
 * `fetch` com Bearer → envelope": a de leitura (`server/state-service-read-client.ts`,
 * MCP e Cockpit), a de escrita (`server/state-service-write-client.ts`, MCP)
 * e a do CLI (`cli/lib/state-service-cli-client.ts`, com timeout e fallback).
 * Agora o algoritmo mora em `requestStateService`, e as três APIs públicas
 * são políticas finas sobre ele:
 *
 * - leitura e escrita (MCP, Cockpit): sem timeout, nunca lançam; falha vira
 *   `{ ok: false, error: STATE_SERVICE_NOT_RUNNING_ERROR }` (ADR-0004: o MCP
 *   não tem fallback);
 * - CLI (`tryStateServiceWrite`): timeout de 300 ms e `{ ok: false }` como
 *   sinal para o fallback de escrita direta em YAML, que é permanente
 *   (ADR-0003, mantido pela ADR-0017).
 *
 * Os caminhos antigos continuam exportando a mesma API (barrels), com o mesmo
 * `init` de `fetch`, as mesmas mensagens de log e os mesmos envelopes.
 */
import { discoverStateService, type StateServiceDiscoveryOptions } from "../../server/state-service-discovery";
import { BRAND } from "../../core/brand/brand.pure";

// ── Núcleo: descoberta + fetch com Bearer ───────────────────────────────────

export type StateServiceRequestOptions = StateServiceDiscoveryOptions & {
  /** Injetável para teste — default `fetch` global do Node 18+ (lido na hora da chamada). */
  fetchImpl?: typeof fetch;
  /** Prazo em ms (AbortController). Ausente = sem prazo. */
  timeoutMs?: number;
};

/**
 * `reached: true` = a chamada HTTP completou (qualquer status) e o corpo é
 * JSON. `reached: false` = sem `server.json` (`error` ausente) ou a chamada
 * falhou (timeout, conexão recusada, corpo não-JSON: `error` presente).
 */
export type StateServiceRequestResult =
  | { reached: true; body: Record<string, unknown> }
  | { reached: false; error?: unknown };

/** Uma chamada ao State Service. Nunca lança. */
export async function requestStateService(
  method: "GET" | "POST",
  urlPath: string,
  body: unknown,
  options?: StateServiceRequestOptions
): Promise<StateServiceRequestResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const info = discoverStateService(options);
  if (!info) return { reached: false };

  const controller = options?.timeoutMs !== undefined ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options!.timeoutMs) : undefined;
  const init: RequestInit =
    method === "GET"
      ? { headers: { Authorization: `Bearer ${info.token}` } }
      : {
          method: "POST",
          headers: { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        };
  if (controller) init.signal = controller.signal;

  try {
    const res = await fetchImpl(`http://127.0.0.1:${info.port}${urlPath}`, init);
    return { reached: true, body: (await res.json()) as Record<string, unknown> };
  } catch (err) {
    return { reached: false, error: err };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Leitura (MCP e Cockpit) ─────────────────────────────────────────────────

export interface StateServiceEnvelope {
  ok: boolean;
  state?: unknown;
  error?: string;
}

export type StateServiceClientOptions = StateServiceDiscoveryOptions & {
  /** Injetável para teste — default `fetch` global do Node 18+. */
  fetchImpl?: typeof fetch;
};

export const STATE_SERVICE_NOT_RUNNING_ERROR =
  `State Service não está rodando — abra a ${BRAND.displayName} no VS Code primeiro (o servidor MCP descobre a porta via .github/artifacts/.state-service/server.json, escrito pela extensão enquanto ela está ativa).`;

/**
 * Chama um endpoint de leitura. Devolve o envelope `{ ok, state? }`/`{ ok,
 * error? }` da própria API HTTP, tal como veio. Só sintetiza
 * `STATE_SERVICE_NOT_RUNNING_ERROR` quando não há `server.json` ou a chamada
 * falha.
 */
async function readStateService(urlPath: string, options?: StateServiceClientOptions): Promise<StateServiceEnvelope> {
  const result = await requestStateService("GET", urlPath, undefined, options);
  if (result.reached) return result.body as unknown as StateServiceEnvelope;
  if (result.error !== undefined) console.error(`[${BRAND.name}] falha ao chamar o State Service (${urlPath}):`, result.error);
  return { ok: false, error: STATE_SERVICE_NOT_RUNNING_ERROR };
}

/** Mapeia 1:1 `GET /initiatives`. */
export function getInitiatives(options?: StateServiceClientOptions): Promise<StateServiceEnvelope> {
  return readStateService("/initiatives", options);
}

/** Mapeia 1:1 `GET /delivery-state[?initiativeId=<id>]`. */
export function getDeliveryState(initiativeId?: string, options?: StateServiceClientOptions): Promise<StateServiceEnvelope> {
  const query = initiativeId ? `?initiativeId=${encodeURIComponent(initiativeId)}` : "";
  return readStateService(`/delivery-state${query}`, options);
}

/** Mapeia 1:1 `GET /health`. */
export function checkStateServiceHealth(options?: StateServiceClientOptions): Promise<StateServiceEnvelope> {
  return readStateService("/health", options);
}

// ── Escrita (MCP) ───────────────────────────────────────────────────────────

/** Envelope de resposta de um endpoint de escrita — formato varia por endpoint (`path`/`changed`/`id`/`wave`/`item`/`phase`/`status`/`checked`), sempre com `ok` e, no erro, `error` (string sintetizada por este cliente, ou o `FieldError`/string que o State Service já devolve). */
export type StateServiceWriteEnvelope = { ok: boolean } & Record<string, unknown>;

export type StateServiceWriteClientOptions = StateServiceDiscoveryOptions & {
  /** Injetável para teste — default `fetch` global do Node 18+. */
  fetchImpl?: typeof fetch;
};

/** `POST` sem fallback (ADR-0004): propaga o corpo do State Service tal como veio. Nunca lança. */
async function postStateService(urlPath: string, body: unknown, options?: StateServiceWriteClientOptions): Promise<StateServiceWriteEnvelope> {
  const result = await requestStateService("POST", urlPath, body, options);
  if (result.reached) return result.body as StateServiceWriteEnvelope;
  if (result.error !== undefined) console.error(`[${BRAND.name}] falha ao chamar o State Service (POST ${urlPath}):`, result.error);
  return { ok: false, error: STATE_SERVICE_NOT_RUNNING_ERROR };
}

export interface UpsertInitiativeInput {
  id: string;
  name?: string;
  status?: string;
  stream?: string;
  currentPhase?: string;
  mode?: string;
  type?: string;
  owner?: string;
  priority?: string;
  createdAt?: string;
  /** Motivo (ADR-0022): obrigatório com `status: cancelled`. */
  reason?: string;
  /** Mapeia pra `setActive` no `StateRepository` — só `true` conta (mesma regra de `body.active === true` no `StateServiceServer`). */
  active?: boolean;
}

/** Mapeia 1:1 `POST /initiatives`. */
export function upsertInitiative(input: UpsertInitiativeInput, options?: StateServiceWriteClientOptions): Promise<StateServiceWriteEnvelope> {
  return postStateService("/initiatives", input, options);
}

/** Mapeia 1:1 `POST /initiatives/:id/switch-active`. Sem corpo — o `id` vai na rota. */
export function switchActiveInitiative(id: string, options?: StateServiceWriteClientOptions): Promise<StateServiceWriteEnvelope> {
  return postStateService(`/initiatives/${encodeURIComponent(id)}/switch-active`, {}, options);
}

/** Mapeia 1:1 `POST /initiatives/:id/bump-phase`. */
export function bumpInitiativePhase(id: string, phase: string, options?: StateServiceWriteClientOptions): Promise<StateServiceWriteEnvelope> {
  return postStateService(`/initiatives/${encodeURIComponent(id)}/bump-phase`, { phase }, options);
}

export interface UpsertWaveItemInput {
  status: string;
  repo?: string;
  completedAt?: string;
  artifacts?: string[];
  summary?: string;
  commit?: string;
  knownBugsPinned?: string[];
  mergeBlock?: string;
  /** Marca o item como gate que exige aprovação humana (ver `WaveItemStatusEntry.requires_approval`) — raro, opt-in. */
  requiresApproval?: boolean;
  /** Motivo (ADR-0022): obrigatório com `blocked`, `failed` e `cancelled`. */
  reason?: string;
  /** `"epic"` grava em `epic_status` em vez de `wave_status` (ADR-0006) — default `"wave"` no endpoint, retrocompat total. */
  group?: "wave" | "epic";
}

/** Mapeia 1:1 `POST /initiatives/:id/wave-items/:wave/:item`. */
export function upsertWaveItem(
  id: string,
  wave: string,
  item: string,
  input: UpsertWaveItemInput,
  options?: StateServiceWriteClientOptions
): Promise<StateServiceWriteEnvelope> {
  return postStateService(`/initiatives/${encodeURIComponent(id)}/wave-items/${encodeURIComponent(wave)}/${encodeURIComponent(item)}`, input, options);
}

export interface UpsertDeliveryPhaseInput {
  /** `true` = escopo global (`--global`); ignorado se ausente/falsy — ver `resolveDeliveryStateScope`. */
  global?: boolean;
  /** Escopo por iniciativa — obrigatório se `global` não for `true`. */
  initiativeId?: string;
  phase: string;
  status: string;
  /** Motivo (ADR-0022): obrigatório com `blocked`, `failed` e `cancelled`. */
  reason?: string;
  agent?: string;
  completedAt?: string;
  artifacts?: string[];
}

/** Mapeia 1:1 `POST /delivery-state/upsert-phase`. */
export function upsertDeliveryPhase(input: UpsertDeliveryPhaseInput, options?: StateServiceWriteClientOptions): Promise<StateServiceWriteEnvelope> {
  return postStateService("/delivery-state/upsert-phase", input, options);
}

export interface UpsertDeliveryChecklistItemInput {
  /** `true` = escopo global (`--global`); ignorado se ausente/falsy — ver `resolveDeliveryStateScope`. */
  global?: boolean;
  /** Escopo por iniciativa — obrigatório se `global` não for `true`. */
  initiativeId?: string;
  phase: string;
  item: string;
  checked: boolean;
  /** Default `"human_checklist"` no `StateServiceServer` se omitido. */
  section?: string;
}

/** Mapeia 1:1 `POST /delivery-state/upsert-checklist`. */
export function upsertDeliveryChecklistItem(
  input: UpsertDeliveryChecklistItemInput,
  options?: StateServiceWriteClientOptions
): Promise<StateServiceWriteEnvelope> {
  return postStateService("/delivery-state/upsert-checklist", input, options);
}

/**
 * Evento de atividade de agente (F5.2, contrato agent-activity), com os nomes
 * de campo do contrato. Mesmo corpo do `POST /runs/append` e da linha do CLI
 * `runs append`. Sem `by`: agente não registra decisão humana (ADR-0024).
 */
export type RunEventInput = {
  event_type: string;
  agent_id?: string;
  phase_id?: string;
  initiative_id?: string;
  task_id?: string;
  repo_id?: string;
  artifact_path?: string;
  harness?: string;
  actor?: string;
  message?: string;
  reason?: string;
};

/** Mapeia 1:1 `POST /runs/append`. */
export function postRunEvent(input: RunEventInput, options?: StateServiceWriteClientOptions): Promise<StateServiceWriteEnvelope> {
  return postStateService("/runs/append", input, options);
}

// ── CLI: prazo curto + sinal de fallback ────────────────────────────────────

/**
 * Prazo de conexão/resposta antes de o CLI cair no fallback de escrita direta
 * em YAML. O CLI roda num terminal de agente, muitas vezes sem o VS Code
 * aberto; 300 ms sobra para um servidor em loopback e não atrasa o caso comum
 * (serviço fora do ar). A 1ª chamada logo depois do boot pode estourar o prazo
 * e cair no fallback; a escrita nunca falha por isso.
 */
export const STATE_SERVICE_CLI_TIMEOUT_MS = 300;

export type StateServiceCliClientOptions = StateServiceDiscoveryOptions & {
  /** Injetável para teste — default `fetch` global do Node 18+. */
  fetchImpl?: typeof fetch;
  /** Timeout em ms — default `STATE_SERVICE_CLI_TIMEOUT_MS`. */
  timeoutMs?: number;
};

export interface StateServiceWriteResult {
  /**
   * `true` = a chamada HTTP se completou (qualquer status); `body` é o MESMO
   * envelope que o CLI produziria direto. `false` = State Service indisponível
   * (sem `server.json`, timeout, erro de rede): sinal para o fallback.
   */
  ok: boolean;
  /** Corpo JSON da resposta — só presente quando `ok:true`. */
  body?: Record<string, unknown>;
}

/** `POST` de escrita do CLI. Nunca lança; `{ ok: false }` = use o fallback em YAML. */
export async function tryStateServiceWrite(
  urlPath: string,
  body: unknown,
  options?: StateServiceCliClientOptions
): Promise<StateServiceWriteResult> {
  const result = await requestStateService("POST", urlPath, body, {
    ...options,
    timeoutMs: options?.timeoutMs ?? STATE_SERVICE_CLI_TIMEOUT_MS,
  });
  if (result.reached) return { ok: true, body: result.body };
  if (result.error !== undefined) {
    console.error(`[${BRAND.name}] CLI: State Service indisponível para POST ${urlPath} — usando fallback de escrita direta em YAML:`, result.error);
  }
  return { ok: false };
}
