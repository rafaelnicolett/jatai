/**
 * deriveGates.ts — a linha do tempo de gates (DS v2 §4.6): quais foram
 * aprovados, quando e por quem, e qual espera você. Puro, sobre o
 * `ViewContext` e a trilha. O estado de cada gate vem de `flows.ts`, a mesma
 * fonte das pontes da trilha, então as duas telas nunca discordam.
 */
import type { GateStatus } from "../../../design-system/patterns";
import type { DecisionRef } from "./decisionRef";
import { d1Rows } from "./flows";
import type { TrackModel } from "./deriveTrack";
import type { ViewContext } from "./viewTarget";

export interface GateItemModel {
  /** Chave do selo: "D1", "D2", "D3", "G1", "G2". */
  badge: string;
  title: string;
  status: GateStatus;
  /** "✓ aprovado em 25/08 por Fulana", "espera você", "falta quality, debt". */
  meta: string;
  /** A decisão que o botão "Revisar o gate" abre (só no gate que espera você). */
  review?: DecisionRef;
}

export interface GatesModel {
  items: GateItemModel[];
  /** Sem gates: o texto do estado vazio. */
  empty?: string;
}

const TITLES: Record<string, string> = {
  D2: "Planejamento → Execução",
  D3: "Execução → Operação",
  G1: "Upstream → Downstream",
  G2: "Downstream → Operação",
};

/** `2026-11-14T12:00:00Z` → `14/11`: o dia como foi gravado, sem converter fuso. */
export function shortDate(iso: string | undefined): string | undefined {
  const m = iso?.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : undefined;
}

function approvedMeta(at: string | undefined, by: string | undefined): string {
  const day = shortDate(at);
  return `✓ aprovado${day ? ` em ${day}` : ""}${by ? ` por ${by}` : ""}`;
}

function metaOf(status: GateStatus, reason: string | undefined, approved: string): string {
  switch (status) {
    case "approved":
      return approved;
    case "waiting":
      return "espera você";
    default:
      return reason ?? "depois";
  }
}

export function deriveGates(ctx: ViewContext, track: TrackModel): GatesModel {
  if (track.kind === "empty") return { items: [], empty: "Esta iniciativa ainda não tem gates." };
  if (track.kind === "waves") return { items: [], empty: "Esta iniciativa ainda não tem gates." };

  const rows = d1Rows(ctx);
  const items: GateItemModel[] = [];

  for (const bridge of track.bridges) {
    const { gate } = bridge;
    if (gate === "D1") {
      // Na Descoberta cada repositório tem o seu D1; na iniciativa, um item só, que abre o primeiro que espera.
      if (track.kind === "discovery") {
        for (const row of rows) {
          const rowStatus: GateStatus = row.approved ? "approved" : row.closed ? "waiting" : "future";
          items.push({
            badge: "D1",
            title: `Descoberta · ${row.repoId}`,
            status: rowStatus,
            meta: metaOf(rowStatus, row.open.length > 0 ? `falta ${row.open.map((o) => o.key).join(", ")}` : undefined, approvedMeta(row.approvedAt, row.approvedBy)),
            ...(rowStatus === "waiting" ? { review: { kind: "gate", gate: "d1", repoId: row.repoId } as const } : {}),
          });
        }
        continue;
      }
      const waiting = rows.find((r) => !r.approved && r.closed);
      const last = [...rows].filter((r) => r.approved).sort((a, b) => (a.approvedAt ?? "").localeCompare(b.approvedAt ?? "")).pop();
      items.push({
        badge: "D1",
        title: `Descoberta · ${rows.length} ${rows.length === 1 ? "repositório" : "repositórios"}`,
        status: bridge.status,
        meta: metaOf(bridge.status, bridge.reason, approvedMeta(last?.approvedAt, last?.approvedBy)),
        ...(bridge.status === "waiting" && waiting ? { review: { kind: "gate", gate: "d1", repoId: waiting.repoId } as const } : {}),
      });
      continue;
    }

    const initiative = ctx.initiative;
    const record = gate === "D2" ? initiative?.gate_d2 : gate === "D3" ? initiative?.gate_d3 : undefined;
    const initiativeId = initiative?.id;
    items.push({
      badge: gate,
      title: TITLES[gate] ?? gate,
      status: bridge.status,
      meta: metaOf(bridge.status, bridge.reason, approvedMeta(record?.human_approved_at ?? record?.approved_at, record?.by)),
      ...(bridge.status === "waiting" && initiativeId && (gate === "D2" || gate === "D3")
        ? { review: { kind: "gate", gate: gate === "D2" ? "d2" : "d3", initiativeId } as const }
        : {}),
    });
  }

  return items.length > 0 ? { items } : { items, empty: "Esta iniciativa ainda não tem gates." };
}
