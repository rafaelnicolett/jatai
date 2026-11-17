import { describe, it, expect } from "vitest";
import type { RunEvent } from "@data";
import { deriveView } from "../src/apps/cockpit/map/useColmeia";
import { HOTFIX_ID, MISSAO_ID, colmeiaEvent, hotfixInitiative, missaoInitiative } from "../src/mock/colmeiaScenarios";
import { buildColmeiaSnapshot, started } from "./support/colmeiaWorld";

/**
 * A iniciativa que o mapa mostra (F5.3 com G15): a que o Cockpit está VENDO, e
 * não a ativa do registro. A projeção é a da tela do Cockpit: a iniciativa
 * vista no lugar da ativa e só os eventos dela.
 */

/** A Missão com tudo por fazer: ninguém trabalha até chegar um evento. */
const IDLE = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.1": { status: "pending" }, "task-0.2": { status: "pending" }, "task-0.3": { status: "pending" }, "task-0.4": { status: "pending" } } } } });

const hotfixStarted = colmeiaEvent({ event_type: "agent-started", agent_id: "@feature-adder", task_id: "wave-1/item-1.1", initiative_id: HOTFIX_ID, message: "reproduzindo a tela em branco" });
const missaoStarted = started("@migration-agent", "epic-0/task-0.2", "semeando");

const state = (events: RunEvent[], recent: RunEvent[] = []) => ({
  status: "ready" as const,
  snapshot: buildColmeiaSnapshot({ initiatives: [IDLE, hotfixInitiative()], events }),
  recentRunEvents: recent,
});

const islandIds = (view: ReturnType<typeof deriveView>): string[] => view.vm.islands.map((i) => i.id);
const agents = (view: ReturnType<typeof deriveView>): Array<string | null> => view.vm.bees.map((b) => b.agentId);

describe("deriveView — a iniciativa que o Cockpit está vendo", () => {
  it("sem iniciativa pedida, vale a ativa do registro (a Missão)", () => {
    const view = deriveView(state([missaoStarted]));
    expect(view.vm.initiativeId).toBe(MISSAO_ID);
    expect(islandIds(view)).toEqual(["discovery", "planning", "execution", "operation"]);
  });

  it("pedir a outra iniciativa mostra as ilhas e as pontes dela, no lugar da ativa", () => {
    const s = state([]);
    const view = deriveView(s, {}, HOTFIX_ID);
    expect(view.vm.initiativeId).toBe(HOTFIX_ID);
    expect(islandIds(view)).toEqual(["wave-1", "wave-2", "wave-3"]);
    expect(view.scene.islands.map((i) => i.id)).toEqual(["wave-1", "wave-2", "wave-3"]);
    // O registro não foi tocado: a ativa segue a Missão no snapshot que a vista leu.
    expect(s.snapshot.initiatives?.active).toBe(MISSAO_ID);
    expect(view.snapshot?.initiatives?.active).toBe(MISSAO_ID);
  });

  it("os eventos são os da iniciativa vista: a abelha da Missão não aparece no hotfix, e a do hotfix não aparece na Missão", () => {
    const events = [missaoStarted, hotfixStarted];
    expect(agents(deriveView(state(events), {}, HOTFIX_ID))).toEqual(["@feature-adder"]);
    expect(agents(deriveView(state(events), {}, MISSAO_ID))).toEqual(["@migration-agent"]);
    expect(agents(deriveView(state(events)))).toEqual(["@migration-agent"]);
  });

  it("o evento que chegou só pelo `runEvents-append` também entra na iniciativa vista", () => {
    expect(agents(deriveView(state([], [hotfixStarted]), {}, HOTFIX_ID))).toEqual(["@feature-adder"]);
    expect(agents(deriveView(state([], [hotfixStarted]), {}, MISSAO_ID))).toEqual([]);
  });

  it("pedir a ativa é o mesmo que não pedir nada, e uma iniciativa que deixou de existir cai na ativa", () => {
    const events = [missaoStarted, hotfixStarted];
    const base = deriveView(state(events));
    expect(deriveView(state(events), {}, MISSAO_ID).vm).toEqual(base.vm);
    expect(deriveView(state(events), {}, "iniciativa-que-sumiu").vm).toEqual(base.vm);
    expect(deriveView(state(events), {}, null).vm).toEqual(base.vm);
  });

  it("os detalhes das ilhas acompanham a iniciativa vista (o checklist do hotfix é o das ondas dele, não o da Missão)", () => {
    const view = deriveView(state([]), {}, HOTFIX_ID);
    expect(view.details.map((d) => d.islandId)).toEqual(["wave-1", "wave-2", "wave-3"]);
  });
});
