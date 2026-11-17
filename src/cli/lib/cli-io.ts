/**
 * cli-io.ts
 *
 * Contrato de saída do `helyx-state` — sempre JSON de uma linha no stdout,
 * nunca prosa. Exit codes: 0 sucesso, 1 erro de uso/validação (o agente
 * mandou algo inválido), 2 erro interno (fs, lock). Nunca degrada
 * silenciosamente como os parsers de leitura em `src/data/*-contract.pure.ts`
 * fazem — aqui, entrada fora do enum é recusada, não absorvida.
 *
 * `requireEnum`/`requireFlag`/`requireBooleanFlag` são wrappers finos sobre
 * os validadores PUROS de `./validation.ts` (roadmap `mod-state-service`,
 * item 3.1 — extraídos pra serem reusados por `StateServiceServer`, que
 * precisa da MESMA regra sem chamar `process.exit`). O comportamento
 * observável destas três funções não mudou — só a implementação interna.
 */
import { validateBooleanFlag, validatePathSegmentId, validatePhaseId, validateRequiredEnum, validateRequiredFlag, validateStatusReason, type FieldError } from "./validation";

export interface CliErrorPayload {
  code: string;
  message: string;
  [key: string]: unknown;
}

/** Encerra o processo com sucesso — sempre a última coisa que um comando chama. */
export function printSuccess(payload: { path: string; changed: boolean; [key: string]: unknown }): never {
  process.stdout.write(`${JSON.stringify({ ok: true, ...payload })}\n`);
  process.exit(0);
}

/** Erro de uso/validação — entrada do agente não bate o contrato. Exit 1. */
export function printUsageError(code: string, message: string, extra?: Record<string, unknown>): never {
  const error: CliErrorPayload = { code, message, ...(extra ?? {}) };
  process.stdout.write(`${JSON.stringify({ ok: false, error })}\n`);
  process.exit(1);
}

/** Erro interno (fs, lock, bug) — não é culpa do agente chamador. Exit 2. */
export function printInternalError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: "INTERNAL", message } })}\n`);
  process.exit(2);
}

/** Repassa um `FieldError` puro (de `./validation.ts`) pro contrato `printUsageError` — mesma forma `{code, message, ...extra}` de sempre. */
function raiseFieldError(error: FieldError): never {
  const { code, message, ...extra } = error;
  printUsageError(code, message, extra);
}

/** Valida `value` contra um array runtime de valores permitidos (ex. `DELIVERY_PHASE_STATUSES`) — chama `printUsageError` e encerra o processo se inválido. */
export function requireEnum<T extends string>(field: string, value: string | undefined, allowed: readonly T[]): T {
  const result = validateRequiredEnum(field, value, allowed);
  if (!result.ok) raiseFieldError(result.error);
  return result.value;
}

/** Valida presença de uma flag obrigatória qualquer (sem restrição de enum). */
export function requireFlag(field: string, value: string | undefined): string {
  const result = validateRequiredFlag(field, value);
  if (!result.ok) raiseFieldError(result.error);
  return result.value;
}

/** Flag obrigatória cujo valor vira nome de pasta (id de iniciativa): presença + um único segmento de caminho (A20). */
export function requirePathSegmentId(field: string, value: string | undefined): string {
  const present = requireFlag(field, value);
  const result = validatePathSegmentId(field, present);
  if (!result.ok) raiseFieldError(result.error);
  return result.value;
}

/** `--phase` do delivery-state: presença + id em `[A-Za-z0-9_-]` (M2 — o id entra em regex e vira chave YAML). */
export function requirePhaseId(field: string, value: string | undefined): string {
  const present = requireFlag(field, value);
  const result = validatePhaseId(field, present);
  if (!result.ok) raiseFieldError(result.error);
  return result.value;
}

/** `--reason` de um status de trabalho (ADR-0022): obrigatório com `blocked`, `failed` e `cancelled`. */
export function requireStatusReason(status: string | undefined, reason: string | undefined): string | undefined {
  const result = validateStatusReason(status, reason);
  if (!result.ok) raiseFieldError(result.error);
  return result.value;
}

/** Parseia `--checked true|false` com rejeição de qualquer outro valor (nunca `Boolean("false") === true`). */
export function requireBooleanFlag(field: string, value: string | undefined): boolean {
  const result = validateBooleanFlag(field, value);
  if (!result.ok) raiseFieldError(result.error);
  return result.value;
}

/**
 * Encerra o processo repassando um envelope JÁ formatado no formato
 * `{ok:true, ...}`/`{ok:false, error:{code,message,...}}` — usado quando o
 * State Service HTTP já respondeu e o CLI só precisa repassar (roadmap item
 * 3.1): nenhuma reformatação, o endpoint já devolve exatamente o que
 * `printSuccess`/`printUsageError` produziriam. Exit 0 se `envelope.ok`,
 * exit 1 caso contrário — mesmo mapeamento das duas funções que substitui
 * neste caminho.
 */
export function printEnvelope(envelope: Record<string, unknown>): never {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
  process.exit(envelope.ok === true ? 0 : 1);
}
