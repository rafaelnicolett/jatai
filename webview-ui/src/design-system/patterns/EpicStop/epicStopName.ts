/** Estado de um épico na trilha (DS v2 §4.2): as marcas de estado da parada. */
export type EpicStopStatus = "queue" | "working" | "you" | "blocked" | "done" | "future";

const STATUS_TEXT: Partial<Record<EpicStopStatus, string>> = {
  done: "concluído",
  you: "decisão esperando você",
  blocked: "bloqueado",
  working: "em andamento",
  future: "depois",
};

export interface EpicStopNameInput {
  /** O que a parada representa: "Epic" (padrão), "Onda", "Repositório", "Fase" ou "Sprint". */
  unit?: string;
  n: number;
  label: string;
  status?: EpicStopStatus;
  progress?: number;
  here?: boolean;
}

/**
 * Nome acessível da parada (§4.2): "Epic 0 · Fundação · 18% · em andamento ·
 * a missão está aqui". O rótulo visível é curto; o nome leva o estado e o
 * progresso em texto, para nada depender do anel ou da cor.
 */
export function epicStopName({ unit = "Epic", n, label, status, progress, here }: EpicStopNameInput): string {
  const parts = [`${unit} ${n}`, label];
  if (typeof progress === "number" && Number.isFinite(progress)) parts.push(`${Math.round(Math.min(100, Math.max(0, progress)))}%`);
  const st = status ? STATUS_TEXT[status] : undefined;
  if (st) parts.push(st);
  if (here) parts.push("a missão está aqui");
  return parts.join(" · ");
}
