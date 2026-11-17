import type { PlanItem, PlanItemStatus } from "@data";

/** Ordem de leitura natural — o que já passou primeiro, o que falta por último. */
const SEGMENT_ORDER: PlanItemStatus[] = ["done", "running", "review", "blocked", "pending"];

export interface RailSegment {
  status: PlanItemStatus;
  count: number;
  pct: number;
}

export interface RailSummary {
  total: number;
  doneCount: number;
  /** Sempre derivado do MESMO array que pinta a barra — nunca de uma fonte separada, pra número e barra nunca discordarem. */
  reviewCount: number;
  segments: RailSegment[];
}

export function computeRailSegments(items: PlanItem[]): RailSummary {
  const total = items.length;
  const counts: Record<PlanItemStatus, number> = { done: 0, running: 0, review: 0, blocked: 0, pending: 0 };
  for (const item of items) counts[item.status]++;

  const segments = SEGMENT_ORDER.filter((status) => counts[status] > 0).map((status) => ({
    status,
    count: counts[status],
    pct: total > 0 ? (counts[status] / total) * 100 : 0,
  }));

  return { total, doneCount: counts.done, reviewCount: counts.review, segments };
}
