/**
 * api-contract.pure.ts — as regras puras da API pública de extensão (F2.5,
 * ADR-0023): o que é um registro válido, quem pode registrar, o que a pessoa
 * vê no pedido de consentimento, o que fica guardado por workspace e o que
 * cada porta pode receber.
 *
 * Sem `fs`, `path` ou `vscode`: a casca (`src/extension/api/`) lê o estado do
 * editor e chama estas funções. Os testes da feature exercitam este módulo
 * diretamente, e os cenários em `api-de-extensao.feature` são a especificação.
 */

import { validateRunEvent } from "../contracts/agent-activity.pure";
import type { RunEvent } from "../contracts/run-events-contract.pure";
import { BRAND } from "../brand/brand.pure";

// ── Portas e declaração do provedor ─────────────────────────────────────────

/** As três portas da API, na ordem em que o pedido de consentimento as apresenta. */
export const PROVIDER_PORTS = ["telemetry", "remote-sync", "templates"] as const;
export type ProviderPort = (typeof PROVIDER_PORTS)[number];

/** Rótulo humano de cada porta (o pedido e "Extensões conectadas" usam este). */
export const PROVIDER_PORT_LABEL: Record<ProviderPort, string> = {
  telemetry: "telemetria",
  "remote-sync": "sincronização de artefatos",
  templates: "templates",
};

export interface ProviderMeta {
  /** Id da extensão que registra, no formato `publisher.name`. */
  id: string;
  displayName: string;
  purpose: string;
  /** Domínios de destino (sem esquema, sem porta, sem caminho). */
  destinations: string[];
}

/** O que cada porta entrega e o que ela nunca entrega (ADR-0023 §4). */
export const PORT_DATA: Record<ProviderPort, { leaves: string; neverLeaves: string }> = {
  telemetry: {
    leaves: "o caminho relativo do artefato que o evento cita",
    neverLeaves: "conteúdo de arquivos",
  },
  "remote-sync": {
    leaves: "só os arquivos de .github/artifacts/ que você marcar",
    neverLeaves: "o token do servidor local",
  },
  templates: {
    leaves: "só o identificador do template e a versão pedida",
    neverLeaves: "qualquer dado do seu workspace",
  },
};

/** O resultado de uma recusa: `field` é o que o erro cita (o `.feature` confere). */
export interface ProviderRegistrationError {
  field: string;
  message: string;
}

export type MetaValidation = { ok: true } | ({ ok: false } & ProviderRegistrationError);

const EXTENSION_ID = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Um destino é um domínio: sem esquema, sem porta, sem caminho, sem IP. */
export function isValidDestination(destination: unknown): destination is string {
  if (typeof destination !== "string") return false;
  if (destination !== destination.trim() || destination.length === 0) return false;
  if (destination.includes("://") || destination.includes("/")) return false;
  if (destination.includes(":") || destination.includes("@") || destination.includes(" ")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(destination)) return false;
  return HOSTNAME.test(destination);
}

/** Os métodos que uma implementação precisa ter para a porta — o erro cita o que falta. */
const REQUIRED_METHODS: Record<ProviderPort, readonly string[]> = {
  telemetry: ["push"],
  "remote-sync": ["pushArtifact"],
  templates: ["getManifest", "getZip"],
};

type Capability = Record<string, unknown>;

/**
 * Valida a declaração e a implementação de um registro. A ordem importa: o
 * que a pessoa lê primeiro (nome, finalidade) vem antes do formato do destino,
 * e a capacidade por último.
 */
export function validateProviderRegistration(port: ProviderPort, provider: unknown, meta: unknown): MetaValidation {
  const input = (meta && typeof meta === "object" ? meta : {}) as Partial<ProviderMeta>;

  if (typeof input.id !== "string" || !EXTENSION_ID.test(input.id)) {
    return { ok: false, field: "id", message: `id de extensão inválido: '${String(input.id ?? "")}' — use publisher.nome` };
  }
  if (typeof input.displayName !== "string" || input.displayName.trim().length === 0) {
    return { ok: false, field: "displayName", message: "displayName não pode ficar em branco" };
  }
  if (typeof input.purpose !== "string" || input.purpose.trim().length === 0) {
    return { ok: false, field: "purpose", message: "purpose não pode ficar em branco" };
  }
  if (!Array.isArray(input.destinations) || input.destinations.length === 0) {
    return { ok: false, field: "destinations", message: "destinations precisa de pelo menos um domínio" };
  }
  for (const destination of input.destinations) {
    if (!isValidDestination(destination)) {
      return {
        ok: false,
        field: String(destination),
        message: `destino inválido: '${String(destination)}' — informe só o domínio, sem esquema, porta ou caminho`,
      };
    }
  }
  if (new Set(input.destinations).size !== input.destinations.length) {
    return { ok: false, field: "destinations", message: "destinations repete um domínio" };
  }

  const capability = (provider && typeof provider === "object" ? provider : {}) as Capability;
  for (const method of REQUIRED_METHODS[port]) {
    if (typeof capability[method] !== "function") {
      return {
        ok: false,
        field: method,
        message: `o provedor não sabe receber: falta o método '${method}' para a porta ${PROVIDER_PORT_LABEL[port]}`,
      };
    }
  }

  return { ok: true };
}

// ── Consentimento por workspace ─────────────────────────────────────────────

export type ConsentStatus = "pending" | "allowed" | "denied" | "revoked";

export interface ConsentRecord {
  status: ConsentStatus;
  /** Só um provedor por porta fica ligado (`true`); os demais podem estar autorizados e desligados. */
  enabled: boolean;
  /** Destinos aceitos na decisão — um destino novo faz o pedido voltar. */
  destinations: string[];
}

export type ConsentBook = Partial<Record<ProviderPort, Record<string, ConsentRecord>>>;

export type ConsentDecision =
  | { kind: "activate" }
  /** Já recusado ou revogado neste workspace: não pergunta de novo. */
  | { kind: "silent" }
  | { kind: "ask"; changed: boolean };

const emptyPort = (): Record<string, ConsentRecord> => ({});

function cloneBook(book: ConsentBook): ConsentBook {
  const out: ConsentBook = {};
  for (const port of PROVIDER_PORTS) {
    const records = book[port];
    out[port] = records
      ? Object.fromEntries(Object.entries(records).map(([id, r]) => [id, { ...r, destinations: [...r.destinations] }]))
      : emptyPort();
  }
  return out;
}

const sameDestinations = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, i) => value === right[i]);
};

/** O que fazer quando uma extensão registra: não pergunta duas vezes o que já foi decidido. */
export function consentDecision(book: ConsentBook, port: ProviderPort, meta: ProviderMeta): ConsentDecision {
  const record = book[port]?.[meta.id];
  if (!record || record.status === "pending") return { kind: "ask", changed: false };
  if (record.status === "allowed") {
    return sameDestinations(record.destinations, meta.destinations) ? { kind: "activate" } : { kind: "ask", changed: true };
  }
  return { kind: "silent" };
}

/** A decisão de permitir (ligado ou só autorizado, quando já há outra extensão ligada na porta). */
export function grantConsent(book: ConsentBook, port: ProviderPort, meta: ProviderMeta, enabled: boolean): ConsentBook {
  const next = cloneBook(book);
  const records = next[port]!;
  if (enabled) for (const [id, record] of Object.entries(records)) records[id] = { ...record, enabled: false };
  records[meta.id] = { status: "allowed", enabled, destinations: [...meta.destinations] };
  return next;
}

export function denyConsent(book: ConsentBook, port: ProviderPort, meta: ProviderMeta): ConsentBook {
  const next = cloneBook(book);
  next[port]![meta.id] = { status: "denied", enabled: false, destinations: [...meta.destinations] };
  return next;
}

/** O pedido foi mostrado e a pessoa fechou sem decidir: aparece como aguardando na lista. */
export function markConsentPending(book: ConsentBook, port: ProviderPort, meta: ProviderMeta): ConsentBook {
  const next = cloneBook(book);
  next[port]![meta.id] = { status: "pending", enabled: false, destinations: [...meta.destinations] };
  return next;
}

export function revokeConsent(book: ConsentBook, port: ProviderPort, id: string): ConsentBook {
  const next = cloneBook(book);
  const record = next[port]?.[id];
  if (record) next[port]![id] = { ...record, status: "revoked", enabled: false };
  return next;
}

/** Liga/desliga uma extensão autorizada. Ligar desliga a outra da mesma porta (um provedor ativo por porta). */
export function setConsentEnabled(book: ConsentBook, port: ProviderPort, id: string, enabled: boolean): ConsentBook {
  const next = cloneBook(book);
  const record = next[port]?.[id];
  if (!record || record.status !== "allowed") return next;
  if (enabled) for (const [other, r] of Object.entries(next[port]!)) next[port]![other] = { ...r, enabled: false };
  next[port]![id] = { ...record, enabled };
  return next;
}

/** O id ligado na porta, se houver. */
export function activeProviderId(book: ConsentBook, port: ProviderPort): string | null {
  for (const [id, record] of Object.entries(book[port] ?? {})) {
    if (record.status === "allowed" && record.enabled) return id;
  }
  return null;
}

// ── O pedido de consentimento ───────────────────────────────────────────────

export interface ConsentRequestText {
  message: string;
  detail: string;
  /** O que os botões oferecem: o mesmo vocabulário do `.feature`. */
  actions: string[];
}

/**
 * O texto do pedido. `changed` existe quando a extensão já era autorizada e
 * passou a declarar um destino novo — nada é enviado até a nova decisão.
 */
export function consentRequestText(
  port: ProviderPort,
  meta: ProviderMeta,
  opts: { changed?: boolean; anotherActive?: string | null } = {}
): ConsentRequestText {
  const data = PORT_DATA[port];
  const detail = [
    `Para que serve: ${meta.purpose}`,
    `Para onde vão os dados: ${meta.destinations.join(", ")}`,
    `O que sai: ${data.leaves}`,
    `O que nunca sai: ${data.neverLeaves}`,
    "A decisão vale só para este workspace.",
    ...(opts.changed ? ["", "A declaração mudou: há um destino novo. Nada é enviado até você decidir de novo."] : []),
  ].join("\n");

  const actions = opts.anotherActive
    ? ["Ligar esta", "Manter a atual", "Recusar"]
    : ["Permitir", "Recusar"];

  return {
    message: `A extensão "${meta.displayName}" (${meta.id}) quer se conectar à ${PROVIDER_PORT_LABEL[port]} da ${BRAND.displayName}.`,
    detail,
    actions,
  };
}

// ── O que pode sair por cada porta ──────────────────────────────────────────

/** Um e-mail não é nome de pessoa: o contrato admite `by`, mas nunca um endereço. */
const looksLikeEmail = (value: string): boolean => value.includes("@");

/**
 * O evento que chega à extensão: só os campos do contrato agent-activity, já
 * validados e limpos (o mesmo validador da escrita), e sem e-mail em `by`.
 * Evento fora do contrato (tipo desconhecido, campo inválido) devolve `null`.
 */
export function sanitizeRunEventForExtension(input: unknown): RunEvent | null {
  const result = validateRunEvent(input);
  if (!result.ok) return null;
  const event = { ...result.value };
  if (event.by !== undefined && looksLikeEmail(event.by)) delete event.by;
  return event;
}

/**
 * Um arquivo que o envio de artefatos pode oferecer: só `.github/artifacts/`,
 * nunca o token do State Service, os eventos de atividade ou temporários.
 */
export function isSendableArtifact(relPath: string): boolean {
  const rel = relPath.replace(/\\/g, "/");
  if (!rel.startsWith(".github/artifacts/")) return false;
  const rest = rel.slice(".github/artifacts/".length);
  if (rest.length === 0) return false;
  if (rest.startsWith(".state-service/")) return false;
  if (rest.startsWith("runs/")) return false;
  if (/(^|\/)\.DS_Store$/.test(rest)) return false;
  if (/(^|\/)\.gitkeep$/.test(rest)) return false;
  if (/(^|\/)server\.json$/.test(rest)) return false;
  if (/(\.tmp|\.temp|\.lock|\.swp|~)$/i.test(rest)) return false;
  return true;
}

// ── Quem chamou a API ───────────────────────────────────────────────────────

export interface ExtensionLocation {
  id: string;
  path: string;
}

/**
 * O id da extensão que chamou a API, a partir da pilha de chamada do Extension
 * Host: cada extensão roda com os módulos na própria pasta, então o primeiro
 * quadro que cai numa pasta de extensão (que não a Jataí) é o chamador.
 *
 * O VS Code não expõe uma API de "quem chamou". A pilha é a única evidência
 * disponível; quando ela não aponta para nenhuma extensão, devolve `null` e o
 * registro é recusado (nunca aceita a identidade só porque ela foi declarada).
 */
export function callerFromStack(stack: string | undefined, extensions: readonly ExtensionLocation[], selfPath: string): string | null {
  if (!stack) return null;
  const normalizedSelf = selfPath.replace(/\\/g, "/").replace(/\/+$/, "");
  let best: { id: string; length: number } | null = null;

  for (const line of stack.split("\n")) {
    const match = line.match(/(file:\/\/)?([^()\s]+):\d+:\d+/);
    if (!match) continue;
    const frame = decodeURIComponent(match[2]!).replace(/\\/g, "/");
    if (frame === normalizedSelf || frame.startsWith(`${normalizedSelf}/`)) continue;
    for (const extension of extensions) {
      const base = extension.path.replace(/\\/g, "/").replace(/\/+$/, "");
      if (frame !== base && !frame.startsWith(`${base}/`)) continue;
      if (!best || base.length > best.length) best = { id: extension.id, length: base.length };
    }
  }
  return best?.id ?? null;
}
