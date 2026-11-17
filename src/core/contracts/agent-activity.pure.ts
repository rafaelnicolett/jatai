/**
 * agent-activity.pure.ts — o validador de escrita do contrato agent-activity
 * (F5.2, ADR-0020; desenho em `mapa/contrato-agent-activity.md`).
 *
 * Expand-Contract, só a fase Expand: `RunEvent` continua valendo byte a byte
 * (`run-events-contract.pure.ts`); aqui entra a regra de quem GRAVA. Todo
 * produtor (StateCommands, CLI `runs append`, tool MCP `append_run_event`,
 * observador de artefatos) passa por `validateRunEvent` antes do append.
 *
 * Privacidade (R8, ADR-0015):
 * - só os campos do contrato sobrevivem; qualquer outro é descartado;
 * - `metadata` aceita só `reason`, `task`, `path` e `count`;
 * - `message` é cortada em 140 caracteres;
 * - `artifact_path` é caminho relativo à raiz do workspace, sem `..`: nunca
 *   conteúdo, nunca um caminho de fora;
 * - `by` só existe em `decision-made`, `gate-approved` e `item-approved`.
 *
 * Erros no envelope de sempre (`FieldError`): tipo, actor ou harness fora do
 * vocabulário → `INVALID_ENUM`; campo obrigatório ausente → `MISSING_FLAG`;
 * caminho inválido ou valor longo demais → `USAGE`.
 *
 * Fora do bundle do webview de propósito: o zod fica só na casca que grava.
 */
import { z } from "zod";
import {
  RUN_EVENT_ACTORS,
  RUN_EVENT_HARNESSES,
  RUN_EVENT_MESSAGE_MAX,
  RUN_EVENT_TYPES,
  RUN_EVENT_TYPES_WITH_AUTHOR,
  type RunEvent,
} from "./run-events-contract.pure";
import type { FieldError, FieldResult } from "../validation/validation";

/**
 * O que um agente pode registrar pelos canais de agente (`runs append` no CLI,
 * que os hooks do kit chamam, e a tool MCP `append_run_event`). Os tipos de
 * decisão humana (`gate-approved`, `item-approved`, `decision-made`) ficam de
 * fora: só o `StateCommands` os grava, a partir da decisão registrada no
 * estado (ADR-0024: agentes leem o gate, nunca aprovam). Um agente pode PEDIR
 * uma decisão (`decision-requested`), nunca tomá-la.
 */
export const AGENT_RUN_EVENT_TYPES = ["agent-started", "agent-progress", "agent-done", "artifact-written", "blocked", "decision-requested"] as const;

/** Teto dos campos de identificação (ids, nome de quem decidiu, caminho): o bastante para um id real, pouco para esconder conteúdo. */
export const RUN_EVENT_ID_MAX = 200;

const id = z.string().trim().min(1).max(RUN_EVENT_ID_MAX);

const metadataSchema = z
  .object({
    reason: z.string().optional(),
    task: id.optional(),
    path: id.optional(),
    count: z.number().int().nonnegative().optional(),
  })
  .strip();

const runEventSchema = z
  .object({
    run_id: id,
    event_type: z.enum(RUN_EVENT_TYPES),
    timestamp: z.string().trim().min(1).max(64),
    phase_id: id.optional(),
    agent_id: id.optional(),
    repo_id: id.optional(),
    message: z.string().optional(),
    metadata: metadataSchema.optional(),
    initiative_id: id.optional(),
    task_id: id.optional(),
    artifact_path: id.optional(),
    actor: z.enum(RUN_EVENT_ACTORS).optional(),
    by: id.optional(),
    harness: z.enum(RUN_EVENT_HARNESSES).optional(),
  })
  .strip();

/** `true` se `p` é um caminho relativo à raiz do workspace, sem subir de pasta (`..`) e sem raiz, unidade ou caractere de controle. */
export function isWorkspaceRelativePath(p: string): boolean {
  if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) return false;
  if ([...p].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return false;
  return p.split(/[\\/]/).every((segment) => segment !== "..");
}

const ENUM_FIELDS: Record<string, readonly string[]> = {
  event_type: RUN_EVENT_TYPES,
  actor: RUN_EVENT_ACTORS,
  harness: RUN_EVENT_HARNESSES,
};

function issueToFieldError(issue: z.ZodIssue, input: Record<string, unknown>): FieldError {
  const field = issue.path.map(String).join(".");
  const top = String(issue.path[0] ?? "");
  const value = input[top];
  if (value === undefined && issue.path.length === 1) {
    return { code: "MISSING_FLAG", message: `flag obrigatória ausente: --${field}`, field };
  }
  if (top in ENUM_FIELDS && issue.path.length === 1) {
    return { code: "INVALID_ENUM", message: `valor inválido para --${field}: '${String(value)}'`, field, value, allowed: ENUM_FIELDS[top] };
  }
  return { code: "USAGE", message: `valor inválido para --${field}: ${issue.message}`, field };
}

/** O que sobra de um texto livre: sem espaços nas pontas e no máximo `RUN_EVENT_MESSAGE_MAX` caracteres. */
export function cutMessage(message: string): string {
  return [...message.trim()].slice(0, RUN_EVENT_MESSAGE_MAX).join("");
}

/** `metadata` sem chave vazia: o `reason` é texto livre, cortado como a mensagem. Nada sobrando = sem `metadata`. */
function cleanMetadata(metadata: z.infer<typeof metadataSchema> | undefined): RunEvent["metadata"] {
  if (!metadata) return undefined;
  const reason = metadata.reason !== undefined ? cutMessage(metadata.reason) : "";
  const out: Record<string, unknown> = {
    ...(reason ? { reason } : {}),
    ...(metadata.task !== undefined ? { task: metadata.task } : {}),
    ...(metadata.path !== undefined ? { path: metadata.path } : {}),
    ...(metadata.count !== undefined ? { count: metadata.count } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Valida e limpa um evento antes da escrita. Devolve o `RunEvent` só com os
 * campos do contrato (na ordem do contrato) ou o primeiro erro de uso.
 */
export function validateRunEvent(input: unknown): FieldResult<RunEvent> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const parsed = runEventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: issueToFieldError(parsed.error.issues[0]!, raw) };
  const e = parsed.data;

  if (e.artifact_path !== undefined && !isWorkspaceRelativePath(e.artifact_path)) {
    return {
      ok: false,
      error: {
        code: "USAGE",
        message: `valor inválido para --artifact_path: '${e.artifact_path}' — caminho relativo à raiz do workspace, sem '..'`,
        field: "artifact_path",
        value: e.artifact_path,
      },
    };
  }

  const message = e.message !== undefined ? cutMessage(e.message) : undefined;
  const metadata = cleanMetadata(e.metadata);
  const withAuthor = (RUN_EVENT_TYPES_WITH_AUTHOR as readonly string[]).includes(e.event_type);

  const event: RunEvent = {
    run_id: e.run_id,
    event_type: e.event_type,
    timestamp: e.timestamp,
    ...(e.initiative_id !== undefined ? { initiative_id: e.initiative_id } : {}),
    ...(e.task_id !== undefined ? { task_id: e.task_id } : {}),
    ...(e.phase_id !== undefined ? { phase_id: e.phase_id } : {}),
    ...(e.agent_id !== undefined ? { agent_id: e.agent_id } : {}),
    ...(e.repo_id !== undefined ? { repo_id: e.repo_id } : {}),
    ...(e.artifact_path !== undefined ? { artifact_path: e.artifact_path.split("\\").join("/") } : {}),
    ...(e.actor !== undefined ? { actor: e.actor } : {}),
    ...(withAuthor && e.by !== undefined ? { by: e.by } : {}),
    ...(e.harness !== undefined ? { harness: e.harness } : {}),
    ...(message ? { message } : {}),
    ...(metadata ? { metadata } : {}),
  };
  return { ok: true, value: event };
}
