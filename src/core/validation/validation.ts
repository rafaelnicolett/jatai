/**
 * validation.ts
 *
 * Validadores PUROS (nunca chamam `process.exit`, nunca escrevem em stdout) —
 * extraídos de `cli-io.ts` (`requireFlag`/`requireEnum`/`requireBooleanFlag`)
 * e do `optionalEnum` local de `commands/initiatives.ts` (roadmap
 * `mod-state-service`, item 3.1). Existem pra que a MESMA regra de validação
 * sirva dois consumidores com contratos de saída diferentes:
 *   - o CLI (`cli-io.ts`): consome o resultado e chama `printUsageError`
 *     (JSON de uma linha + `process.exit(1)`);
 *   - `StateServiceServer` (endpoints de escrita, item 3.1): consome o mesmo
 *     resultado e devolve `400`/`404` HTTP com o mesmo formato `{code,
 *     message, ...extra}` dentro de `error`.
 *
 * Preservam byte a byte as mensagens/códigos/campos `extra` que já existiam
 * em `cli-io.ts` antes desta extração — characterization tests em
 * `tests/cli/cli-io.test.ts` continuam pinando o comportamento observável.
 */

import { statusRequiresReason } from "../contracts/work-status.pure";

export interface FieldError {
  code: string;
  message: string;
  [key: string]: unknown;
}

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: FieldError };

/** Presença de uma flag obrigatória qualquer (sem restrição de enum). String vazia conta como ausente — @known-bug preservado (ver `cli-io.test.ts`). */
export function validateRequiredFlag(field: string, value: string | undefined): FieldResult<string> {
  if (value === undefined || value === "") {
    return { ok: false, error: { code: "MISSING_FLAG", message: `flag obrigatória ausente: --${field}`, field } };
  }
  return { ok: true, value };
}

/** Enum OBRIGATÓRIO: `undefined` é MISSING_FLAG, valor fora do array é INVALID_ENUM. */
export function validateRequiredEnum<T extends string>(field: string, value: string | undefined, allowed: readonly T[]): FieldResult<T> {
  if (value === undefined) {
    return { ok: false, error: { code: "MISSING_FLAG", message: `flag obrigatória ausente: --${field}`, field } };
  }
  if (!(allowed as readonly string[]).includes(value)) {
    return { ok: false, error: { code: "INVALID_ENUM", message: `valor inválido para --${field}: '${value}'`, field, value, allowed } };
  }
  return { ok: true, value: value as T };
}

/** Enum OPCIONAL: `undefined` é válido (devolve `undefined`), só valida se um valor foi de fato informado. */
export function validateOptionalEnum<T extends string>(
  field: string,
  value: string | undefined,
  allowed: readonly T[]
): FieldResult<T | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!(allowed as readonly string[]).includes(value)) {
    return { ok: false, error: { code: "INVALID_ENUM", message: `valor inválido para --${field}: '${value}'`, field, value, allowed } };
  }
  return { ok: true, value: value as T };
}

/**
 * Id que vira nome de pasta (`.github/artifacts/initiatives/<id>/`) — A20 /
 * H-BUG-64 / D29. Precisa ser UM segmento de caminho: recusa `/`, `\`, `.` e
 * `..` sozinhos e caracteres de controle (inclusive NUL), com o código `USAGE`
 * que o contrato já tem. Não restringe o charset além disso: os ids reais
 * (`mod-missao-open-source`, `gf-alfa`) passam como sempre.
 */
export function validatePathSegmentId(field: string, value: string): FieldResult<string> {
  const hasControlChar = [...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\") || hasControlChar) {
    return {
      ok: false,
      error: {
        code: "USAGE",
        message: `valor inválido para --${field}: '${value}' — o id vira nome de pasta: sem '/', '\\', '.' ou '..' sozinhos e sem caractere de controle`,
        field,
        value,
      },
    };
  }
  return { ok: true, value };
}

/**
 * Id de fase do delivery-state (M2). O motor de escrita usa o id como
 * cabeçalho YAML e dentro de `new RegExp()`: `fase(1` derrubava a escrita
 * (INTERNAL) e `business|x` regravava a fase `business`. Aceita só
 * `[A-Za-z0-9_-]`, o formato de todos os ids do catálogo; fora disso, `USAGE`.
 */
export function validatePhaseId(field: string, value: string): FieldResult<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return {
      ok: false,
      error: { code: "USAGE", message: `valor inválido para --${field}: '${value}' — id de fase aceita só letras, números, '-' e '_'`, field, value },
    };
  }
  return { ok: true, value };
}

/** `--flag true|false` sem coerção (nunca `Boolean("false") === true`) — @known-bug preservado (case-sensitive, sem 'True'/'1'/'yes'). */
export function validateBooleanFlag(field: string, value: string | undefined): FieldResult<boolean> {
  const flag = validateRequiredFlag(field, value);
  if (!flag.ok) return flag;
  if (flag.value !== "true" && flag.value !== "false") {
    return {
      ok: false,
      error: { code: "INVALID_BOOLEAN", message: `valor inválido para --${field}: '${flag.value}' — esperado 'true' ou 'false'`, field, value: flag.value },
    };
  }
  return { ok: true, value: flag.value === "true" };
}

/**
 * `--reason` de um status de trabalho (ADR-0022 §4). `blocked`, `failed` e
 * `cancelled` sem motivo (ausente ou só espaços) são erro de uso
 * (`MISSING_FLAG`, exit 1 / HTTP 400). Para os outros status o motivo é
 * opcional e devolvido como veio; quem grava decide o que fazer com ele.
 */
export function validateStatusReason(status: string | undefined, reason: string | undefined): FieldResult<string | undefined> {
  const trimmed = reason?.trim();
  if (status !== undefined && statusRequiresReason(status) && !trimmed) {
    return {
      ok: false,
      error: { code: "MISSING_FLAG", message: `flag obrigatória ausente: --reason (o status '${status}' exige motivo)`, field: "reason", status },
    };
  }
  return { ok: true, value: trimmed || undefined };
}
