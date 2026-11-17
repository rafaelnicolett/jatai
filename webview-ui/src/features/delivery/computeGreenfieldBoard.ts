/**
 * computeGreenfieldBoard.ts
 *
 * Adapter puro do formato "greenfield" de iniciativa (PHASE_ORDER linear, sem
 * repositório) — projeta `DeliveryPlan`/`DeliveryState`/`SprintItem[]` já
 * carregados no vocabulário genérico que `PhaseMap`/`PhaseBoard` consomem.
 * Nunca reparseia YAML — tudo aqui já chegou pronto via `@data`.
 */

import { PHASE_CONTRACTS, type DeliveryPlan, type DeliveryState, type DeliveryPhaseStatus, type PlanItemStatus, type SprintGroup, type SprintItem, type SprintItemStatus } from "@data";
import type { BoardCard } from "../../design-system/patterns";

/**
 * `DeliveryPhaseStatus` (vocabulário do YAML, 4 valores) → `PlanItemStatus`
 * (vocabulário de lane do board, 5 valores) — mesmo mapeamento que
 * `statusFromDeliveryState` (`delivery-plan.ts`) já usa pra fase inteira:
 * `skipped` também vira `done` (fechou o board igual, só não produziu
 * artefato). Wave-3 item 3.8: cada artefato reportado por
 * `deliveryState.phases[phaseKey].artifacts` pode trazer o PRÓPRIO `status`
 * (opcional) — quando não traz, o card cai no status da fase inteira
 * (`item.status`), comportamento idêntico ao de antes desta função existir.
 */
function artifactStatusToLane(status: DeliveryPhaseStatus): PlanItemStatus {
  switch (status) {
    case "done":        return "done";
    case "skipped":      return "done";
    case "in-progress":  return "running";
    default:             return "pending";
  }
}

/**
 * Status agregado de UMA sprint — pro card do seletor de sprint. Prioridade:
 * bloqueado (precisa de decisão) > aguarda você (revisão) > rodando (ao
 * vivo) > concluído (só se TODOS os itens não-descoped estiverem done) >
 * pendente. Itens `descoped` nunca entram na conta — não competem por
 * atenção, igual ao board.
 */
export function sprintAggregateStatus(sprint: SprintGroup): PlanItemStatus {
  const items = sprint.items.filter((i) => i.status !== "descoped");
  if (items.length === 0) return "pending";
  if (items.some((i) => i.status === "blocked")) return "blocked";
  if (items.some((i) => i.status === "review")) return "review";
  if (items.some((i) => i.status === "in-progress")) return "running";
  if (items.every((i) => i.status === "done")) return "done";
  return "pending";
}

/** Último segmento de um path — usado como `id` (curto, mono) do card. */
function basename(relPath: string): string {
  const clean = relPath.replace(/\/+$/, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

/**
 * Cards de output de UMA fase greenfield (nunca `sprint-run` — use
 * `sprintBoardCards` pra essa, que tem uma fonte de dado e uma ação
 * completamente diferentes). 1 card por `PHASE_CONTRACTS[phaseKey].outputs`;
 * quando o agente já reportou `deliveryState.phases[phaseKey].artifacts`
 * (não vazio), prefere essa lista real em vez do contrato estático — é o que
 * a fase de fato produziu, não só o que ela promete produzir. O `PlanItem`
 * correspondente (`plan.items.find(i => i.key === phaseKey)`) já resolveu o
 * status certo — reaproveitado tal e qual, nunca recalculado aqui.
 */
export function greenfieldBoardCards(phaseKey: string, plan: DeliveryPlan, deliveryState: DeliveryState | null): BoardCard[] {
  if (phaseKey === "sprint-run") return [];

  const item = plan.items.find((i) => i.key === phaseKey);
  const contract = PHASE_CONTRACTS[phaseKey];
  if (!item || !contract) return [];

  const reportedArtifacts = deliveryState?.phases[phaseKey]?.artifacts;

  if (reportedArtifacts && reportedArtifacts.length > 0) {
    return reportedArtifacts.map((artifact, i) => {
      const matchedOutput = contract.outputs.find((o) => o.relPath === artifact.path);
      const lane = artifact.status ? artifactStatusToLane(artifact.status) : item.status;
      return {
        key: `${phaseKey}-artifact-${i}`,
        id: basename(artifact.path),
        title: matchedOutput?.label ?? artifact.note ?? artifact.path,
        lane,
        status: lane,
      };
    });
  }

  return contract.outputs.map((output) => ({
    key: `${phaseKey}-${output.id}`,
    id: output.relPath ? basename(output.relPath) : output.id,
    title: output.label,
    lane: item.status,
    status: item.status,
  }));
}

/** `SprintItemStatus` → `PlanItemStatus` do vocabulário de lanes do board — `descoped` não mapeia (filtrado antes). */
const SPRINT_STATUS_TO_LANE: Record<Exclude<SprintItemStatus, "descoped">, PlanItemStatus> = {
  backlog: "pending",
  "in-progress": "running",
  review: "review",
  blocked: "blocked",
  done: "done",
};

/**
 * Cards de `sprint-run` — fonte é `SprintItem[]` (sprint selecionada), não
 * `PHASE_CONTRACTS`. Itens `descoped` são omitidos (não competem por atenção
 * — não fazem parte do vocabulário de 5 status do board). Item `review` ganha
 * `approve` sem fricção (`SprintItem` não carrega campo de risco hoje); item
 * `blocked` usa `blockedReason` como `meta`.
 */
export function sprintBoardCards(items: SprintItem[], onApprove: (itemId: string) => void, approvingId: string | null): BoardCard[] {
  return items
    .filter((item): item is SprintItem & { status: Exclude<SprintItemStatus, "descoped"> } => item.status !== "descoped")
    .map((item) => {
      const lane = SPRINT_STATUS_TO_LANE[item.status];
      const card: BoardCard = {
        key: item.id,
        id: item.id,
        title: item.title,
        lane,
        status: lane,
      };
      if (item.status === "review") {
        card.approve = { onApprove: () => onApprove(item.id), disabled: approvingId === item.id };
      } else if (item.status === "blocked" && item.blockedReason) {
        card.meta = item.blockedReason;
      }
      return card;
    });
}
