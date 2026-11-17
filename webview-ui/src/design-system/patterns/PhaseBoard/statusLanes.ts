import type { PlanItemStatus } from "@data";
import type { BoardLane } from "./PhaseBoard";

/** As 5 colunas padrão do `PhaseBoard` — `PhaseBoard` só renderiza as que têm card. */
export const STATUS_LANES: BoardLane<PlanItemStatus>[] = [
  { key: "pending", label: "Pendente" },
  { key: "running", label: "Rodando" },
  { key: "review", label: "Aguarda você" },
  { key: "blocked", label: "Bloqueado" },
  { key: "done", label: "Concluído" },
];
