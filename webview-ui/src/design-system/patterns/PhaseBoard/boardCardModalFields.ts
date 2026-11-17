import type { BoardCard } from "./PhaseBoard";

export interface BoardCardModalField {
  label: string;
  value: string;
}

/**
 * Campos a mostrar no modal de detalhe de um `BoardCard`, na ordem em que
 * aparecem — diferente do rodapé compacto (`CardFooter`), que escolhe SÓ UM
 * de aprovar/desde-quando/meta pra não estourar a altura do card (ver
 * `CardFooter` em `PhaseBoard.tsx`). O modal não tem essa restrição de
 * espaço vertical: mostra tudo que o card carrega, mesmo quando o rodapé
 * escondeu `meta` por causa de um botão "Aprovar" presente ao mesmo tempo
 * (caso real: item `done` + `requires_approval` + `completed_at`, onde hoje
 * o rodapé do card compacto nunca mostra a data de conclusão).
 */
export function boardCardModalFields<L extends string>(card: BoardCard<L>): BoardCardModalField[] {
  const fields: BoardCardModalField[] = [];
  if (card.meta) fields.push({ label: "Detalhes", value: card.meta });
  if (card.since) fields.push({ label: "Desde", value: card.since });
  if (card.details?.commit) fields.push({ label: "Commit", value: card.details.commit });
  if (card.details?.artifacts && card.details.artifacts.length > 0) {
    fields.push({ label: "Artefatos", value: card.details.artifacts.join("\n") });
  }
  if (card.details?.knownBugs && card.details.knownBugs.length > 0) {
    fields.push({ label: "Known bugs", value: card.details.knownBugs.join("\n") });
  }
  return fields;
}
