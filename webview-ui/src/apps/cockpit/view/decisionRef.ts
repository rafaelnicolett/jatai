/**
 * decisionRef.ts — a que decisão humana um item da tela se refere. O "Agora",
 * o card "Espera você" do quadro, a ponte da trilha e o item da linha do tempo
 * de gates apontam para o MESMO painel de decisão (DS v2 §4.7: é o único lugar
 * onde se decide), e este tipo é o que liga uns aos outros.
 */
export type DecisionRef =
  /** D1 de um repositório. */
  | { kind: "gate"; gate: "d1"; repoId: string }
  /** D2 ou D3 de uma iniciativa. */
  | { kind: "gate"; gate: "d2" | "d3"; initiativeId: string }
  /** Fase de entrega em revisão (HITL): checklist humano e "Aprovar fase". Só a iniciativa ativa. */
  | { kind: "phase"; phaseId: string }
  /** Item de onda ou épico concluído que exige aprovação humana. */
  | { kind: "approval"; initiativeId: string; wave: string; item: string }
  /** Item de sprint em revisão. */
  | { kind: "sprint-item"; sprintItemId: string }
  /** Decisão pedida por um agente (`decision-requested` sem `decision-made`). `key` é a que o mapa usa para apagar a guarda. */
  | { kind: "decision"; key: string }
  /** Fase do Foundation que o agente terminou e espera a confirmação humana. */
  | { kind: "foundation-phase"; phaseId: string; repoId?: string };

/** Identificador estável do pedido: serve de `id` no DOM e de chave de seleção. */
export function refKey(ref: DecisionRef): string {
  switch (ref.kind) {
    case "gate":
      return ref.gate === "d1" ? `gate:d1:${ref.repoId}` : `gate:${ref.gate}:${ref.initiativeId}`;
    case "phase":
      return `phase:${ref.phaseId}`;
    case "approval":
      return `approval:${ref.initiativeId}:${ref.wave}:${ref.item}`;
    case "sprint-item":
      return `sprint-item:${ref.sprintItemId}`;
    case "decision":
      return `decision:${ref.key}`;
    case "foundation-phase":
      return `foundation-phase:${ref.repoId ?? "workspace"}:${ref.phaseId}`;
  }
}

export function sameRef(a: DecisionRef | null | undefined, b: DecisionRef | null | undefined): boolean {
  return !!a && !!b && refKey(a) === refKey(b);
}
