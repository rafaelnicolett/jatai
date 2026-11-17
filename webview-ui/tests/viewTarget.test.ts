import { describe, it, expect } from "vitest";
import { buildViewContext, resolveViewTarget, sameTarget } from "../src/apps/cockpit/view/viewTarget";
import { buildSnapshot } from "../src/mock/snapshotBuilder";
import { REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml, modernizationSnapshot } from "./support/cockpitFixtures";

/**
 * G15 (`mod-missao-open-source`): navegar para outra iniciativa é só visão.
 * O alvo vive no cliente e o `active:` global do registro nunca é reescrito.
 */
const twoInitiatives = () =>
  buildSnapshot({
    reposYaml: REPOS_YAML,
    foundationYaml: foundationYaml({ d1: "approved" }),
    initiativesYaml: initiativesYaml("mod-x", [
      initiativeYaml({ id: "mod-x", d2: true, scope: ["api"] }),
      initiativeYaml({ id: "hotfix-y", name: "Hotfix Y", type: "hotfix", epics: ["wave-1: Diagnóstico", "wave-2: Correção", "wave-3: Validação"] }),
      initiativeYaml({ id: "feat-z", name: "Feature Z", type: "feature", mode: "greenfield", currentPhase: "business", epics: [] }),
    ]),
    events: [
      { run_id: "r1", event_type: "agent-started", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", agent_id: "@migration-agent", task_id: "epic-0/task-1" },
      { run_id: "r2", event_type: "agent-started", timestamp: "2026-11-16T10:05:00Z", initiative_id: "hotfix-y", agent_id: "@feature-adder" },
    ],
  });

describe("resolveViewTarget", () => {
  it("sem snapshot, não há o que mostrar", () => {
    expect(resolveViewTarget(null, { kind: "initiative", id: "mod-x" })).toBeNull();
  });

  it("uma iniciativa que existe vale ela mesma, mesmo que não seja a ativa", () => {
    expect(resolveViewTarget(twoInitiatives(), { kind: "initiative", id: "hotfix-y" })).toEqual({ kind: "initiative", id: "hotfix-y" });
  });

  it("uma iniciativa que deixou de existir cai na ativa", () => {
    expect(resolveViewTarget(twoInitiatives(), { kind: "initiative", id: "sumiu" })).toEqual({ kind: "initiative", id: "mod-x" });
  });

  it("sem escolha, vale a iniciativa ativa (a entrada do Cockpit é onde a missão está)", () => {
    expect(resolveViewTarget(twoInitiatives(), null)).toEqual({ kind: "initiative", id: "mod-x" });
  });

  it("a Descoberta vale em workspace brownfield, mesmo com iniciativa ativa", () => {
    expect(resolveViewTarget(twoInitiatives(), { kind: "discovery" })).toEqual({ kind: "discovery" });
  });

  it("sem iniciativa, o workspace brownfield abre na Descoberta e o greenfield não tem o que mostrar", () => {
    expect(resolveViewTarget(buildSnapshot({ reposYaml: REPOS_YAML }), null)).toEqual({ kind: "discovery" });
    expect(resolveViewTarget(buildSnapshot({ mode: "greenfield" }), null)).toBeNull();
  });

  it("sameTarget compara por tipo e id", () => {
    expect(sameTarget({ kind: "discovery" }, { kind: "discovery" })).toBe(true);
    expect(sameTarget({ kind: "initiative", id: "a" }, { kind: "initiative", id: "a" })).toBe(true);
    expect(sameTarget({ kind: "initiative", id: "a" }, { kind: "initiative", id: "b" })).toBe(false);
    expect(sameTarget({ kind: "discovery" }, { kind: "initiative", id: "a" })).toBe(false);
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget(null, { kind: "discovery" })).toBe(false);
  });
});

describe("buildViewContext", () => {
  it("REGRESSÃO (G15): ver outra iniciativa não mexe no active do registro", () => {
    const snapshot = twoInitiatives();
    const ctx = buildViewContext(snapshot, { kind: "initiative", id: "hotfix-y" });
    expect(ctx.activeId).toBe("mod-x");
    expect(ctx.isActive).toBe(false);
    expect(ctx.initiative?.id).toBe("hotfix-y");
    expect(snapshot.initiatives?.active).toBe("mod-x");
    // O que o núcleo lê vê a iniciativa vista como "ativa", sem alterar o original.
    expect(ctx.projected.initiatives?.active).toBe("hotfix-y");
    expect(ctx.projected.initiatives).not.toBe(snapshot.initiatives);
  });

  it("a iniciativa ativa usa o snapshot como veio", () => {
    const snapshot = twoInitiatives();
    const ctx = buildViewContext(snapshot, { kind: "initiative", id: "mod-x" });
    expect(ctx.isActive).toBe(true);
    expect(ctx.projected.initiatives).toBe(snapshot.initiatives);
    expect(ctx.projected.deliveryState).toBe(snapshot.deliveryState);
    expect(ctx.events).toBe(snapshot.runEvents);
  });

  it("outra iniciativa não herda o delivery-state nem os eventos da ativa", () => {
    const ctx = buildViewContext(twoInitiatives(), { kind: "initiative", id: "hotfix-y" });
    expect(ctx.projected.deliveryState).toBeNull();
    expect(ctx.events.map((e) => e.agent_id)).toEqual(["@feature-adder"]);
  });

  it("o detalhe completo vale para a ativa e para a que guarda as fases no registro (épicos ou ondas); a de entrega só carrega a ativa", () => {
    const snapshot = twoInitiatives();
    expect(buildViewContext(snapshot, { kind: "initiative", id: "mod-x" }).detailLoaded).toBe(true);
    expect(buildViewContext(snapshot, { kind: "initiative", id: "hotfix-y" }).detailLoaded).toBe(true);
    expect(buildViewContext(snapshot, { kind: "initiative", id: "feat-z" }).detailLoaded).toBe(false);
  });

  it("a Descoberta não tem iniciativa vista", () => {
    const ctx = buildViewContext(modernizationSnapshot(), { kind: "discovery" });
    expect(ctx.initiative).toBeUndefined();
    expect(ctx.isActive).toBe(false);
    expect(ctx.activeId).toBe("mod-x");
  });
});
