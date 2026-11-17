import type { PlanItem } from "@data";
import type { MapNode } from "./PhaseMap";

interface PlanItemsToMapNodesOptions {
  /** Inclui itens `kind: "gate"` (ex.: `<repo>/gate-d1`) como nós do mapa. Default: true. */
  includeGates?: boolean;
}

/**
 * Transforma um `PlanItem[]` real (já carregado por `buildFoundationPlan`/
 * `buildDeliveryPlan`) no shape genérico que `PhaseMap` consome — nunca
 * recalcula status, só projeta `key`/`label`/`status`. Preserva a ordem de
 * `items` (que já é a ordem de execução real).
 */
export function planItemsToMapNodes(items: PlanItem[], opts: PlanItemsToMapNodesOptions = {}): MapNode[] {
  const { includeGates = true } = opts;
  return items
    .filter((item) => includeGates || item.kind !== "gate")
    .map((item) => ({ key: item.key, label: item.label, status: item.status, kind: item.kind }));
}
