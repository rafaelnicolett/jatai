import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, useEffect, useMemo } from "react";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarioTitles } from "../../../tests/features/gherkin";

// O diálogo de decisão manda mensagens ao host: capturar o que sai, antes de o módulo do VS Code ser carregado.
const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.hoisted(() => {
  (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
    postMessage: (m: Record<string, unknown>) => posted.push(m),
    getState: () => undefined,
    setState: () => undefined,
  });
});

import { buildViewContext } from "../../src/apps/cockpit/view/viewTarget";
import { useDecisionFlow } from "../../src/apps/cockpit/view/useDecisionFlow";
import { useAnnouncer } from "../../src/apps/cockpit/view/useAnnouncer";
import type { DecisionRef } from "../../src/apps/cockpit/view/decisionRef";
import { cockpitStore } from "../../src/store/CockpitStore";
import { buildSnapshot } from "../../src/mock/snapshotBuilder";
import { REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml, modernizationSnapshot } from "../support/cockpitFixtures";
import { cleanup, click, mount } from "../support/component";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";

/**
 * Step definitions de `cockpit-decisao-de-gate.feature` (F4.2, parte 2, G3):
 * o painel de decisão no jsdom, montado pelo mesmo `useDecisionFlow` que o
 * Cockpit usa. O que o operador vê (a regra de fechamento, o checklist humano,
 * o botão de aprovar) vem do estado; o que sai para o host é capturado.
 */
const FEATURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tests/features/cockpit-decisao-de-gate.feature");

beforeEach(() => {
  posted.length = 0;
  cockpitStore.clearDecisionResult();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function Harness({ snapshot, target, open }: { snapshot: CockpitSnapshot; target: { kind: "initiative"; id: string }; open: DecisionRef }) {
  const ctx = useMemo(() => buildViewContext(snapshot, target), [snapshot, target]);
  const { announce } = useAnnouncer();
  const flow = useDecisionFlow(ctx, announce);
  useEffect(() => flow.open(open), []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{flow.node}</>;
}

function openDecision(snapshot: CockpitSnapshot, ref: DecisionRef, id = "mod-x"): void {
  mount(<Harness snapshot={snapshot} target={{ kind: "initiative", id }} open={ref} />);
}

const dialog = (): HTMLElement => document.querySelector("[role='dialog']")!;
const primary = (): HTMLButtonElement => [...dialog().querySelectorAll("button")].find((b) => /^(Aprovar|Registrar|Tentar)/.test(b.textContent ?? ""))!;
const help = (): string => dialog().querySelector("p[id$='-help']")?.textContent ?? "";
const list = (label: string): string[] => [...dialog().querySelectorAll(`ul[aria-label='${label}'] li`)].map((li) => li.textContent ?? "");

const D3: DecisionRef = { kind: "gate", gate: "d3", initiativeId: "mod-x" };
const D2: DecisionRef = { kind: "gate", gate: "d2", initiativeId: "mod-x" };

function phaseSnapshot(): CockpitSnapshot {
  return buildSnapshot({
    mode: "greenfield",
    initiativesYaml: initiativesYaml("loja", [initiativeYaml({ id: "loja", name: "Loja", type: "feature", mode: "greenfield", currentPhase: "business", epics: [] })]),
    deliveryYaml: "phases:\n  business: { status: in-progress, human_checklist: {} }\n",
    events: [{ run_id: "r1", event_type: "agent-done", timestamp: "2026-11-16T10:00:00Z", phase_id: "business", agent_id: "@business" }],
  });
}

const SCENARIOS: Record<string, () => void> = {
  "A decisão do D3 lista o que falta e o botão de aprovar fica desabilitado com o motivo": () => {
    openDecision(modernizationSnapshot({ epicStatus: "epic-0:\n  items:\n    task-1: { status: done }\n    task-2: { status: in-progress }" }), D3);
    expect(list("O que falta")).toEqual(["epic-0/task-2: em andamento"]);
    expect(primary().getAttribute("aria-disabled")).toBe("true");
    expect(help()).toBe("Falta fechar 1 tarefa");
    click(primary());
    expect(posted).toEqual([]);
  },

  "A decisão do D3 lista as tarefas canceladas com o motivo": () => {
    openDecision(modernizationSnapshot({ epicStatus: 'epic-0:\n  items:\n    task-1: { status: done }\n    task-2: { status: cancelled, reason: "escopo cortado pelo dono" }' }), D3);
    expect(list("Canceladas")).toEqual(["epic-0/task-2: cancelada: escopo cortado pelo dono"]);
    expect(primary().getAttribute("aria-disabled")).toBeNull();
    expect(dialog().textContent).toContain("Tudo fechado: o gate pode ser aprovado.");
  },

  "A decisão do D2 lista as aprovações de Planejamento que faltam": () => {
    const snapshot = buildSnapshot({ initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ roadmapOnly: true })]) });
    openDecision(snapshot, D2);
    expect(list("O que falta")).toEqual(["Matriz de risco aprovada: sem registro"]);
    expect(help()).toBe("Falta fechar 1 aprovação");
    expect(primary().getAttribute("aria-disabled")).toBe("true");
  },

  "A fase em revisão mostra o checklist humano marcável": () => {
    openDecision(phaseSnapshot(), { kind: "phase", phaseId: "business" }, "loja");
    const boxes = [...dialog().querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => !b.checked && !b.disabled)).toBe(true);
    click(boxes[0]);
    // O host grava a marca pelo verbo que já existia, e a tela mostra marcado na hora.
    expect(posted).toEqual([{ type: "toggleGuardRail", phaseId: "business", itemId: expect.any(String), checked: true }]);
    expect(dialog().querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0]!.checked).toBe(true);
  },

  "A fase em revisão só aprova com os itens obrigatórios marcados": () => {
    openDecision(phaseSnapshot(), { kind: "phase", phaseId: "business" }, "loja");
    expect(primary().getAttribute("aria-disabled")).toBe("true");
    expect(help()).toMatch(/^Marque \d+ itens obrigatórios para aprovar$/);
    const boxes = [...dialog().querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    for (const box of boxes) if (/\(obrigatório\)/.test(box.closest("label")?.textContent ?? "")) click(box);
    expect(primary().getAttribute("aria-disabled")).toBeNull();
    click(primary());
    expect(posted.at(-1)).toEqual({ type: "approveAndAdvancePhase", phaseId: "business" });
  },

  "A decisão pedida por um agente pede o nome de quem decide quando o git não tem usuário": () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"] })]),
      events: [{ run_id: "r5", event_type: "decision-requested", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", task_id: "epic-0/task-9", message: "titularidade do código" }],
    });
    openDecision(snapshot, { kind: "decision", key: "epic-0/task-9" });
    const input = dialog().querySelector<HTMLInputElement>("input[type='text']")!;
    expect(primary().getAttribute("aria-disabled")).toBe("true"); // falta dizer o que foi decidido
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "sou o titular");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(primary());
    expect(posted.at(-1)).toMatchObject({ type: "decisions/record", taskId: "epic-0/task-9", message: "sou o titular" });
    expect(posted.at(-1)).not.toHaveProperty("by");
    // O host responde que o git não tem usuário: o painel pede o nome.
    act(() => cockpitStore.handleMessage({ type: "decisions/record-result", ok: false, error: { code: "MISSING_FLAG", message: "flag obrigatória ausente: --by", field: "by" } }));
    expect(dialog().querySelector("input[autocomplete='name']")).not.toBeNull();
    expect(dialog().querySelector("[role='alert']")?.textContent).toContain("não tem user.name");
  },
};

describe("Funcionalidade: Decidir um gate com o checklist humano e a regra de fechamento à vista", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
