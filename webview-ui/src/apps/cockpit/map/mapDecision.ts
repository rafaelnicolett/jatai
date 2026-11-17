import { useEffect } from "react";
import { cockpitStore, type DecisionRequest } from "../../../store/CockpitStore";
import { useCockpitSelector } from "../../../store/useCockpitSelector";
import type { DecisionRef } from "../view/decisionRef";
import type { AgoraWaiting } from "../view/deriveAgora";

/**
 * A guarda acesa do mapa leva ao painel de decisão do Cockpit (F5.3): o mapa só
 * acompanha e nunca decide (R6), então ele entrega o pedido ao Cockpit, que é o
 * único lugar onde se decide (DS v2 §4.7).
 *
 * `decisionFor` acha, entre o que espera a pessoa na tela do Cockpit, a decisão
 * que a guarda aponta. A guarda sabe a tarefa; o Cockpit chama a mesma coisa
 * pela mesma chave: a de uma decisão pedida por um agente é o id da tarefa (a
 * chave que apaga a guarda no `deriveColmeia`), e a de uma aprovação de tarefa
 * é `onda/item`, o próprio id da tarefa.
 */
export function decisionFor(request: DecisionRequest, waiting: readonly AgoraWaiting[]): DecisionRef | null {
  const refs = waiting.map((w) => w.ref);
  if (request.kind === "approval") {
    return refs.find((r) => r.kind === "approval" && `${r.wave}/${r.item}` === request.taskId) ?? null;
  }
  const decisions = refs.filter((r): r is Extract<DecisionRef, { kind: "decision" }> => r.kind === "decision");
  if (request.taskId) return decisions.find((r) => r.key === request.taskId) ?? null;
  // Uma decisão pedida sem tarefa tem por chave o id da execução, que o mapa não sabe: só vale se for a única.
  return decisions.length === 1 ? decisions[0]! : null;
}

/**
 * Lado da tela do Cockpit: consome o pedido que o mapa deixou no store. Espera a
 * tela mostrar a iniciativa do pedido (o `ShellRoot` troca a visão para ela) e,
 * achada a decisão, abre o painel; o pedido sai do store de qualquer jeito, para
 * não abrir sozinho mais tarde. Sem decisão correspondente (alguém já decidiu),
 * o Cockpit fica à frente com o "Agora" à vista.
 */
export function useMapDecisionRequest(viewedInitiativeId: string | undefined, waiting: readonly AgoraWaiting[], open: (ref: DecisionRef) => void): void {
  const request = useCockpitSelector((state) => state.pendingDecision);
  useEffect(() => {
    if (!request) return;
    if (request.initiativeId && request.initiativeId !== viewedInitiativeId) return;
    cockpitStore.clearDecision();
    const ref = decisionFor(request, waiting);
    if (ref) open(ref);
  }, [request, viewedInitiativeId, waiting, open]);
}
