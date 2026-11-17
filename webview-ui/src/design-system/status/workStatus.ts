import type { PlanItemStatus } from "@data";

/**
 * Vocabulário visual de status do DS v2 (§3.3), mais os dois status de
 * trabalho da ADR-0022 que a v2 não desenhou como coluna: `failed` e
 * `cancelled`. Lógica pura: os componentes (StatusGlyph, StatusBadge,
 * TaskCard) só desenham o que sai daqui.
 *
 * Cada status tem glifo de forma própria e rótulo em texto: cor nunca
 * trabalha sozinha (princípio 2 da v2).
 */
export type WorkStatus = "done" | "working" | "you" | "queue" | "blocked" | "future" | "failed" | "cancelled";

export const WORK_STATUSES: readonly WorkStatus[] = ["done", "working", "you", "queue", "blocked", "future", "failed", "cancelled"];

/** Família de tokens `--jt-status-<tom>-{fg,line,bg}` de cada status. */
export type StatusTone = "done" | "working" | "you" | "queue" | "blocked" | "future";

export interface WorkStatusInfo {
  /** Rótulo pt-BR (DS v2 §3.3; ADR-0022 §7 para falhou e cancelado). */
  label: string;
  /** Família de cor. `failed` usa a do bloqueio (ADR-0022: "mesma família de cor"). */
  tone: StatusTone;
  /** O status só faz sentido com o motivo em texto (ADR-0022: blocked, failed e cancelled exigem `reason`). */
  needsReason: boolean;
  /** Fechado: entra no grupo dos concluídos (cancelled vai riscado). */
  closed: boolean;
}

export const WORK_STATUS_INFO: Record<WorkStatus, WorkStatusInfo> = {
  done: { label: "Feito", tone: "done", needsReason: false, closed: true },
  working: { label: "Trabalhando", tone: "working", needsReason: false, closed: false },
  you: { label: "Espera você", tone: "you", needsReason: false, closed: false },
  queue: { label: "Na fila", tone: "queue", needsReason: false, closed: false },
  blocked: { label: "Bloqueado", tone: "blocked", needsReason: true, closed: false },
  future: { label: "Depois", tone: "future", needsReason: false, closed: false },
  failed: { label: "Falhou", tone: "blocked", needsReason: true, closed: false },
  cancelled: { label: "Cancelado", tone: "future", needsReason: true, closed: true },
};

/**
 * `PlanItemStatus` (5 status do PhaseMap/PhaseBoard) → status v2 (§3.3):
 * pending vira fila, ou "depois" quando está depois de um gate não
 * aprovado; running → trabalhando; review → espera você.
 */
export function workStatusFromPlanItem(status: PlanItemStatus, opts: { afterOpenGate?: boolean } = {}): WorkStatus {
  switch (status) {
    case "pending":
      return opts.afterOpenGate ? "future" : "queue";
    case "running":
      return "working";
    case "review":
      return "you";
    case "done":
      return "done";
    case "blocked":
      return "blocked";
  }
}

const PLAN_ITEM_STATUSES = new Set<string>(["pending", "running", "review"]);

/** Aceita o status v2 ou o `PlanItemStatus` legado (os dois só coincidem em done e blocked). */
export function toWorkStatus(status: WorkStatus | PlanItemStatus): WorkStatus {
  return PLAN_ITEM_STATUSES.has(status) ? workStatusFromPlanItem(status as PlanItemStatus) : (status as WorkStatus);
}

/**
 * Texto completo de um status, para leitor de tela e dica: "Bloqueado:
 * bloqueada por T0.2", "Falhou: timeout no CI". Sem motivo, só o rótulo.
 */
export function describeWorkStatus(status: WorkStatus, reason?: string): string {
  const { label } = WORK_STATUS_INFO[status];
  const r = reason?.trim();
  return r ? `${label}: ${r}` : label;
}
