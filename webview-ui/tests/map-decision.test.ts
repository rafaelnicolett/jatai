import { describe, it, expect } from "vitest";
import { decisionFor } from "../src/apps/cockpit/map/mapDecision";
import type { DecisionRequest } from "../src/store/CockpitStore";
import type { DecisionRef } from "../src/apps/cockpit/view/decisionRef";
import { refKey } from "../src/apps/cockpit/view/decisionRef";
import type { AgoraWaiting } from "../src/apps/cockpit/view/deriveAgora";

/**
 * Da guarda do mapa à decisão do Cockpit (F5.3): a função pura que acha, entre o
 * que espera a pessoa, a decisão que a guarda acesa aponta.
 */

const waiting = (...refs: DecisionRef[]): AgoraWaiting[] => refs.map((ref) => ({ id: refKey(ref), ref, title: refKey(ref), detail: "" }));
const guard = (over: Partial<DecisionRequest> = {}): DecisionRequest => ({ kind: "decision", reason: "titularidade do código", islandId: "execution", islandLabel: "Execução", ...over });

const D2: DecisionRef = { kind: "gate", gate: "d2", initiativeId: "mod-x" };
const ASK_01: DecisionRef = { kind: "decision", key: "epic-0/task-0.1" };
const ASK_02: DecisionRef = { kind: "decision", key: "epic-0/task-0.2" };
const APPROVE_03: DecisionRef = { kind: "approval", initiativeId: "mod-x", wave: "epic-0", item: "task-0.3" };

describe("decisionFor — a decisão do Cockpit que a guarda acesa aponta", () => {
  it("uma decisão pedida por um agente é achada pelo id da tarefa (a chave que apaga a guarda)", () => {
    expect(decisionFor(guard({ taskId: "epic-0/task-0.2" }), waiting(D2, ASK_01, ASK_02))).toEqual(ASK_02);
  });

  it("uma aprovação de tarefa é achada por `onda/item`, o próprio id da tarefa", () => {
    expect(decisionFor(guard({ kind: "approval", taskId: "epic-0/task-0.3" }), waiting(D2, ASK_01, APPROVE_03))).toEqual(APPROVE_03);
  });

  it("decisão e aprovação não se confundem: o tipo da guarda decide onde procurar", () => {
    expect(decisionFor(guard({ kind: "approval", taskId: "epic-0/task-0.1" }), waiting(ASK_01))).toBeNull();
    expect(decisionFor(guard({ kind: "decision", taskId: "epic-0/task-0.3" }), waiting(APPROVE_03))).toBeNull();
  });

  it("decisão pedida sem tarefa só vale quando é a única decisão esperando; com mais de uma, o Cockpit não adivinha", () => {
    expect(decisionFor(guard(), waiting(D2, ASK_01))).toEqual(ASK_01);
    expect(decisionFor(guard(), waiting(ASK_01, ASK_02))).toBeNull();
  });

  it("quem já decidiu (a decisão saiu da lista) não abre nada", () => {
    expect(decisionFor(guard({ taskId: "epic-0/task-0.1" }), waiting(D2))).toBeNull();
    expect(decisionFor(guard({ taskId: "epic-0/task-0.1" }), [])).toBeNull();
  });
});
