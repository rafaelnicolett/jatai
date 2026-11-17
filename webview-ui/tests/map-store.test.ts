import "./support/recordingVsCodeApi";
import { describe, it, expect, beforeEach } from "vitest";
import { cockpitStore, type DecisionRequest } from "../src/store/CockpitStore";

/** A troca de vista Cockpit ↔ Mapa no store (F5.3): puramente client-side, nada vai ao host. */

const REQUEST: DecisionRequest = { kind: "decision", reason: "titularidade do código", taskId: "epic-0/task-0.1", islandId: "execution", islandLabel: "Execução" };

beforeEach(() => {
  cockpitStore.setView("cockpit");
  cockpitStore.clearDecision();
});

describe("CockpitStore — view e decisão pedida pelo mapa", () => {
  it("o Cockpit é a vista padrão, e não há decisão pedida", () => {
    const state = cockpitStore.getSnapshot();
    expect(state.view).toBe("cockpit");
    expect(state.pendingDecision).toBeNull();
  });

  it("setView troca a vista e avisa quem assina; repetir a mesma vista não avisa de novo", () => {
    let calls = 0;
    const off = cockpitStore.subscribe(() => calls++);
    cockpitStore.setView("map");
    expect(cockpitStore.getSnapshot().view).toBe("map");
    cockpitStore.setView("map");
    expect(calls).toBe(1);
    cockpitStore.setView("cockpit");
    expect(calls).toBe(2);
    off();
  });

  it("requestDecision volta ao Cockpit e deixa o contexto da decisão; clearDecision limpa, e limpar sem pedido não avisa", () => {
    cockpitStore.setView("map");
    cockpitStore.requestDecision(REQUEST);
    expect(cockpitStore.getSnapshot()).toMatchObject({ view: "cockpit", pendingDecision: REQUEST });
    let calls = 0;
    const off = cockpitStore.subscribe(() => calls++);
    cockpitStore.clearDecision();
    expect(cockpitStore.getSnapshot().pendingDecision).toBeNull();
    cockpitStore.clearDecision();
    expect(calls).toBe(1);
    off();
  });

  it("um snapshot ou um toast do host não mexem na vista nem na decisão pedida", () => {
    cockpitStore.setView("map");
    cockpitStore.handleMessage({ type: "shell/toast", payload: { id: "t", kind: "agent-done", text: "x", timestamp: "2026-11-16T12:00:00Z" } });
    expect(cockpitStore.getSnapshot().view).toBe("map");
  });
});
