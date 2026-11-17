import { describe, it, expect } from "vitest";
import { buildViewContext } from "../src/apps/cockpit/view/viewTarget";
import { deriveDecision, openDecisionRequest, type DecisionModel } from "../src/apps/cockpit/view/deriveDecision";
import type { DecisionRef } from "../src/apps/cockpit/view/decisionRef";
import { buildSnapshot } from "../src/mock/snapshotBuilder";
import { REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml, modernizationSnapshot } from "./support/cockpitFixtures";

const decide = (snapshot: ReturnType<typeof modernizationSnapshot>, ref: DecisionRef, id = "mod-x"): DecisionModel => {
  const model = deriveDecision(buildViewContext(snapshot, { kind: "initiative", id }), ref);
  if (!model) throw new Error("a decisão não existe");
  return model;
};
const D3: DecisionRef = { kind: "gate", gate: "d3", initiativeId: "mod-x" };
const D2: DecisionRef = { kind: "gate", gate: "d2", initiativeId: "mod-x" };

describe("deriveDecision — gate D3 (ADR-0022 §3, regra de fechamento)", () => {
  it("lista o que falta e desabilita o botão de aprovar dizendo quantas tarefas faltam fechar", () => {
    const d = decide(modernizationSnapshot({ epicStatus: "epic-0:\n  items:\n    task-1: { status: done }\n    task-2: { status: in-progress }" }), D3);
    expect(d.closure?.open.map((o) => [o.key, o.status])).toEqual([["epic-0/task-2", "em andamento"]]);
    expect(d.primary?.disabledReason).toBe("Falta fechar 1 tarefa");
    expect(d.primary?.request).toEqual({ type: "gates/approve", gate: "d3", initiativeId: "mod-x" });
  });

  it("lista cada tarefa cancelada com o motivo e deixa aprovar (cancelado conta como fechado)", () => {
    const d = decide(modernizationSnapshot({ epicStatus: 'epic-0:\n  items:\n    task-1: { status: done }\n    task-2: { status: cancelled, reason: "escopo cortado pelo dono" }' }), D3);
    expect(d.closure?.cancelled).toEqual([{ key: "epic-0/task-2", status: "cancelada", reason: "escopo cortado pelo dono" }]);
    expect(d.closure?.open).toEqual([]);
    expect(d.primary?.disabledReason).toBeUndefined();
  });

  it("bloqueada e que falhou impedem o gate, com o motivo em texto", () => {
    const d = decide(modernizationSnapshot({ epicStatus: 'epic-0:\n  items:\n    task-1: { status: blocked, reason: "espera o task-0" }\n    task-2: { status: failed, reason: "teste caiu" }' }), D3);
    expect(d.closure?.open.map((o) => [o.key, o.status, o.reason])).toEqual([
      ["epic-0/task-1", "bloqueada", "espera o task-0"],
      ["epic-0/task-2", "falhou", "teste caiu"],
    ]);
    expect(d.primary?.disabledReason).toBe("Falta fechar 2 tarefas");
  });
});

describe("deriveDecision — gate D2 e D1", () => {
  it("D2 com o roadmap aprovado e a matriz de risco não: lista o que falta como aprovação", () => {
    const snapshot = buildSnapshot({ initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ roadmapOnly: true })]) });
    const d = decide(snapshot, D2);
    expect(d.closure?.open).toEqual([{ key: "Matriz de risco aprovada", status: "sem registro" }]);
    expect(d.primary?.disabledReason).toBe("Falta fechar 1 aprovação");
    expect(d.checklist.map((c) => [c.label, c.checked])).toEqual([
      ["Roadmap aprovado", true],
      ["Matriz de risco aprovada", false],
    ]);
  });

  it("D2 com os dois aprovados e a decisão por tomar deixa aprovar", () => {
    const snapshot = buildSnapshot({
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({}).replace("  epics:", "  roadmap_gate: { status: approved }\n  risk_matrix_gate: { status: approved }\n  epics:")]),
    });
    expect(decide(snapshot, D2).primary?.disabledReason).toBeUndefined();
  });

  it("D1 com fases do Foundation abertas lista as fases e diz quantas faltam fechar", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "pending", open: ["quality", "debt"] }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ scope: ["api"] })]),
    });
    const d = decide(snapshot, { kind: "gate", gate: "d1", repoId: "api" });
    expect(d.closure?.open.map((o) => o.status)).toEqual(["pendente", "pendente"]);
    expect(d.closure).toMatchObject({ closedCount: 3, total: 5 });
    expect(d.primary?.disabledReason).toBe("Falta fechar 2 fases do Foundation");
    expect(d.primary?.request).toEqual({ type: "gates/approve", gate: "d1", repoId: "api" });
  });

  it("D1 com tudo fechado deixa aprovar", () => {
    const snapshot = buildSnapshot({ reposYaml: REPOS_YAML, foundationYaml: foundationYaml({ d1: "pending" }), initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ scope: ["api"] })]) });
    const d = decide(snapshot, { kind: "gate", gate: "d1", repoId: "api" });
    expect(d.closure?.open).toEqual([]);
    expect(d.primary?.disabledReason).toBeUndefined();
  });
});

describe("deriveDecision — fase de entrega em revisão (checklist humano marcável, G3)", () => {
  const phaseSnapshot = (marks: string) =>
    buildSnapshot({
      mode: "greenfield",
      initiativesYaml: initiativesYaml("loja", [initiativeYaml({ id: "loja", name: "Loja", type: "feature", mode: "greenfield", currentPhase: "business", epics: [] })]),
      deliveryYaml: `phases:\n  business: { status: in-progress, human_checklist: { ${marks} } }\n`,
      events: [{ run_id: "r1", event_type: "agent-done", timestamp: "2026-11-16T10:00:00Z", phase_id: "business", agent_id: "@business" }],
    });
  const ref: DecisionRef = { kind: "phase", phaseId: "business" };

  it("mostra os itens do checklist da fase, marcáveis pelo host, e o botão só abre com os obrigatórios marcados", () => {
    const d = decide(phaseSnapshot(""), ref, "loja");
    expect(d.checklist.length).toBeGreaterThan(0);
    expect(d.checklist.every((c) => !c.checked)).toBe(true);
    expect(d.checklist.every((c) => c.toggle && c.toggle.via === "host" && c.toggle.type === "toggleGuardRail")).toBe(true);
    const required = d.checklist.filter((c) => c.required);
    expect(required.length).toBeGreaterThan(0);
    expect(d.primary?.disabledReason).toBe(`Marque ${required.length} ${required.length === 1 ? "item obrigatório" : "itens obrigatórios"} para aprovar`);
    expect(d.primary?.request).toEqual({ type: "approveAndAdvancePhase", phaseId: "business" });

    const marked = decide(phaseSnapshot(required.map((c) => `${c.id}: true`).join(", ")), ref, "loja");
    expect(marked.checklist.filter((c) => c.required).every((c) => c.checked)).toBe(true);
    expect(marked.primary?.disabledReason).toBeUndefined();
  });

  it("as marcas que a tela já mostra (otimistas) entram na regra do botão antes de o snapshot chegar", () => {
    const base = deriveDecision(buildViewContext(phaseSnapshot(""), { kind: "initiative", id: "loja" }), ref)!;
    const required = base.checklist.filter((c) => c.required);
    const marks = Object.fromEntries(required.map((c) => [c.id, true]));
    const marked = deriveDecision(buildViewContext(phaseSnapshot(""), { kind: "initiative", id: "loja" }), ref, marks)!;
    expect(marked.checklist.filter((c) => c.required).every((c) => c.checked)).toBe(true);
    expect(marked.primary?.disabledReason).toBeUndefined();
    // Falta um: o botão continua desabilitado e diz quantos.
    const partial = deriveDecision(buildViewContext(phaseSnapshot(""), { kind: "initiative", id: "loja" }), ref, { [required[0]!.id]: true })!;
    expect(partial.primary?.disabledReason).toContain(`Marque ${required.length - 1}`);
  });

  it("numa iniciativa que não é a ativa, o checklist só se lê e a aprovação pede para torná-la ativa", () => {
    const snapshot = buildSnapshot({
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({}), initiativeYaml({ id: "loja", name: "Loja", type: "feature", mode: "greenfield", currentPhase: "business", epics: [] })]),
    });
    const ctx = buildViewContext(snapshot, { kind: "initiative", id: "loja" });
    const d = deriveDecision(ctx, ref)!;
    expect(d.checklist.every((c) => c.toggle === undefined)).toBe(true);
    expect(d.primary?.disabledReason).toBe("Torne esta iniciativa ativa para aprovar a fase");
  });
});

describe("deriveDecision — tarefa que exige aprovação, sprint e Foundation", () => {
  it("o risco registrado vira um item de reconhecimento que só vale na tela, e trava o botão", () => {
    const snapshot = modernizationSnapshot({
      epicStatus: 'epic-0:\n  items:\n    task-1: { status: done, requires_approval: true, summary: "CI verde", known_bugs_pinned: ["timeout no job"], artifacts: ["docs/ci.md"] }',
    });
    const d = decide(snapshot, { kind: "approval", initiativeId: "mod-x", wave: "epic-0", item: "task-1" });
    expect(d.checklist).toEqual([{ id: "friction", label: "Vi known_bugs_pinned antes de aprovar", required: true, checked: false, toggle: { via: "local" } }]);
    expect(d.primary?.disabledReason).toBe("Marque que viu os pontos de atenção para aprovar");
    expect(d.evidence).toEqual(["docs/ci.md"]);
  });

  it("a fase do Foundation que o agente terminou se confirma no chat, e só a do workspace tem marca no estado", () => {
    const snapshot = buildSnapshot({ reposYaml: REPOS_YAML, foundationYaml: foundationYaml({ d1: "pending" }) });
    const ctx = buildViewContext(snapshot, { kind: "discovery" });
    const perRepo = deriveDecision(ctx, { kind: "foundation-phase", phaseId: "tech-stack", repoId: "api" })!;
    expect(perRepo.primary).toBeNull();
    expect(perRepo.chatOnly).toContain("chat");
    expect(perRepo.checklist.every((c) => c.toggle === undefined)).toBe(true);
    const workspace = deriveDecision(ctx, { kind: "foundation-phase", phaseId: "domain" })!;
    expect(workspace.checklist.every((c) => c.toggle?.via === "host" && c.toggle.type === "toggleFoundationGuardRail")).toBe(true);
  });
});

describe("deriveDecision — a decisão que um agente pediu", () => {
  const events = (...extra: Array<Record<string, unknown>>) => [
    { run_id: "r1", event_type: "decision-requested", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", task_id: "epic-0/task-1", agent_id: "migration-agent", message: "titularidade do código", metadata: { reason: "96 de 99 commits têm identidade de empresa" } },
    ...extra,
  ];
  const withEvents = (list: Array<Record<string, unknown>>) =>
    buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"] })]),
      events: list,
    });

  it("mostra o tema, o motivo e quem pediu, e registra pela tarefa que apaga a guarda", () => {
    const d = decide(withEvents(events()), { kind: "decision", key: "epic-0/task-1" });
    expect(d.question).toBe("Titularidade do código");
    expect(d.context).toBe("96 de 99 commits têm identidade de empresa");
    expect(d.facts).toContainEqual({ label: "Pedida por", value: "@migration-agent" });
    expect(d.needsText).toBe(true);
    expect(d.primary?.request).toEqual({ type: "decisions/record", initiativeId: "mod-x", taskId: "epic-0/task-1" });
  });

  it("depois de decidida, o pedido deixa de existir", () => {
    const decided = withEvents(events({ run_id: "state-commands", event_type: "decision-made", timestamp: "2026-11-16T11:00:00Z", task_id: "epic-0/task-1", actor: "human", by: "Pessoa Fictícia" }));
    const ctx = buildViewContext(decided, { kind: "initiative", id: "mod-x" });
    expect(deriveDecision(ctx, { kind: "decision", key: "epic-0/task-1" })).toBeNull();
    expect(openDecisionRequest(ctx.events, "epic-0/task-1")).toBeUndefined();
  });

  it("sem tarefa ligada, não dá para registrar daqui: a decisão se resolve no chat", () => {
    const loose = withEvents([{ run_id: "r9", event_type: "decision-requested", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", message: "escolher a licença" }]);
    const d = decide(loose, { kind: "decision", key: "r9" });
    expect(d.primary).toBeNull();
    expect(d.needsText).toBe(false);
    expect(d.chatOnly).toContain("chat");
  });
});
