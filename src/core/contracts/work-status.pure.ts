/**
 * work-status.pure.ts — o vocabulário de trabalho da ADR-0022 (F6.5, G6).
 *
 * Um vocabulário só para fase de delivery e para item de onda/task:
 *
 * | Status        | Terminal | Exige `reason` |
 * |---------------|----------|----------------|
 * | `pending`     | não      | —              |
 * | `in-progress` | não      | —              |
 * | `blocked`     | não      | sim            | algo de fora impede o avanço
 * | `failed`      | não      | sim            | a tentativa deu errado; reexecutar
 * | `done`        | sim      | —              |
 * | `skipped`     | sim      | —              | o pipeline decidiu que não se aplica
 * | `cancelled`   | sim      | sim            | um humano cortou o escopo
 *
 * A iniciativa ganha `cancelled` (com `reason`); o vocabulário dela fica no
 * contrato de iniciativas. O do Foundation e o do sprint-backlog não mudam.
 *
 * Leitura sem rebaixamento silencioso (§5): texto fora do vocabulário vira
 * `unknown`, com o texto original em `status_text`, e nunca é reescrito.
 */

export const WORK_STATUSES = ["pending", "in-progress", "blocked", "failed", "done", "skipped", "cancelled"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** Status que só são aceitos na escrita com um motivo (`reason`). */
export const REASON_REQUIRED_STATUSES = ["blocked", "failed", "cancelled"] as const;

/** Uma fase ou item está fechado quando é `done`, `skipped` ou `cancelled` (§3). */
export const CLOSED_WORK_STATUSES = ["done", "skipped", "cancelled"] as const;

/** O que a leitura devolve para um texto fora do vocabulário. */
export const UNKNOWN_STATUS = "unknown";
export type ReadWorkStatus = WorkStatus | typeof UNKNOWN_STATUS;

export function isWorkStatus(value: string): value is WorkStatus {
  return (WORK_STATUSES as readonly string[]).includes(value);
}

export function statusRequiresReason(status: string): boolean {
  return (REASON_REQUIRED_STATUSES as readonly string[]).includes(status);
}

export function isClosedStatus(status: string): boolean {
  return (CLOSED_WORK_STATUSES as readonly string[]).includes(status);
}

/**
 * Lê um status de trabalho escrito por agente ou à mão. Ausente ou vazio vale
 * `fallback` (como sempre). Texto conhecido vale ele mesmo. Qualquer outro
 * texto vira `unknown`, com o original em `text` para o Cockpit mostrar.
 */
export function readWorkStatus<F extends string>(
  raw: unknown,
  valid: readonly F[],
  fallback: F,
  /** `status_text` já gravado ao lado: o modelo re-serializado (`status: unknown` + `status_text`) volta igual. */
  statusText?: unknown
): { status: F | typeof UNKNOWN_STATUS; text?: string } {
  const s = String(raw ?? "").trim();
  if (s === "") return { status: fallback };
  if ((valid as readonly string[]).includes(s)) return { status: s as F };
  if (s === UNKNOWN_STATUS && typeof statusText === "string" && statusText.trim()) return { status: UNKNOWN_STATUS, text: statusText.trim() };
  return { status: UNKNOWN_STATUS, text: s };
}

/** Um item considerado num gate. */
export interface GateItem {
  key: string;
  status: string;
  reason?: string;
}

/** Fechamento de um gate (§3): fecha quando tudo está fechado; lista cada `cancelled` com o motivo. */
export interface GateClosure {
  closed: boolean;
  /** O que impede o gate: aberto (`pending`, `in-progress`, desconhecido), `blocked` ou `failed`. */
  open: GateItem[];
  /** Cada item cancelado, com o motivo, para o humano ver o que foi cortado. */
  cancelled: GateItem[];
}

export function gateClosure(items: readonly GateItem[]): GateClosure {
  const open = items.filter((i) => !isClosedStatus(i.status));
  const cancelled = items.filter((i) => i.status === "cancelled");
  return { closed: open.length === 0, open, cancelled };
}
