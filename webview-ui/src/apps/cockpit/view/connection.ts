/**
 * connection.ts — o estado da conexão do Cockpit com o host, em funções
 * puras (G9). O "conectando…" que não terminava nunca vira uma espera com
 * prazo: passado o prazo sem snapshot, a tela explica e oferece "Tentar de
 * novo". O host avisa "nenhuma pasta aberta" por `shell/degraded` (fonte
 * `workspace`), e a tela distingue esse caso da espera comum.
 */
import type { DataSourceIssue } from "@shared/cockpit-protocol";

/** Quanto o Cockpit espera o primeiro snapshot antes de explicar e oferecer "Tentar de novo". */
export const BOOT_DEADLINE_MS = 8_000;

/** Acima de quantos segundos sem snapshot novo o dado passa a ser tratado como obsoleto (o mesmo limiar do chip global: 3 × o poll de 4 s). */
export const STALE_AFTER_SECONDS = 12;

/** A fonte do aviso que o host manda quando o editor não tem pasta aberta. */
export const NO_FOLDER_SOURCE = "workspace";

export type ConnectionState =
  | { kind: "ready" }
  | { kind: "connecting" }
  | { kind: "timeout"; waitedSeconds: number }
  | { kind: "no-folder"; message: string }
  | { kind: "unconfigured" };

export interface ConnectionInput {
  status: "booting" | "ready";
  /** Existe config válido no workspace. */
  configured: boolean;
  degraded: DataSourceIssue[];
  /** Há quanto tempo o painel abriu sem snapshot. */
  waitedMs: number;
}

export function deriveConnection({ status, configured, degraded, waitedMs }: ConnectionInput): ConnectionState {
  const noFolder = degraded.find((d) => d.source === NO_FOLDER_SOURCE);
  if (noFolder) return { kind: "no-folder", message: noFolder.message };
  if (status === "booting") {
    return waitedMs >= BOOT_DEADLINE_MS ? { kind: "timeout", waitedSeconds: Math.round(waitedMs / 1000) } : { kind: "connecting" };
  }
  return configured ? { kind: "ready" } : { kind: "unconfigured" };
}

/** Segundos desde o último snapshot, só quando passaram do limiar de obsoleto; senão `null`. */
export function staleSeconds(generatedAt: string | null, nowMs: number): number | null {
  if (!generatedAt) return null;
  const seconds = Math.max(0, Math.round((nowMs - new Date(generatedAt).getTime()) / 1000));
  return seconds > STALE_AFTER_SECONDS ? seconds : null;
}
