/** Coluna do quadro do épico (DS v2 §4.5). */
export type ColumnStatus = "queue" | "working" | "you" | "done";

/** Ordem fixa das 4 colunas: Fila ○ · Trabalhando ● · Espera você ■ · Feito ✓. */
export const STATUS_COLUMN_ORDER: readonly ColumnStatus[] = ["queue", "working", "you", "done"];

export const STATUS_COLUMN_LABEL: Record<ColumnStatus, string> = {
  queue: "Fila",
  working: "Trabalhando",
  you: "Espera você",
  done: "Feito",
};

/** "3 tarefas" / "1 tarefa". */
export function tasksText(count: number): string {
  return `${count} ${count === 1 ? "tarefa" : "tarefas"}`;
}

/** Sufixo do bloqueio no cabeçalho: "1 bloqueada" / "2 bloqueadas". */
export function blockedText(count: number): string {
  return `${count} ${count === 1 ? "bloqueada" : "bloqueadas"}`;
}
