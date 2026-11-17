import { describe, it, expect } from "vitest";
import { buildViewContext } from "../src/apps/cockpit/view/viewTarget";
import { deriveTrack } from "../src/apps/cockpit/view/deriveTrack";
import { deriveAgora, announceNewDecisions, type AgoraWaiting } from "../src/apps/cockpit/view/deriveAgora";
import { deriveGates, shortDate } from "../src/apps/cockpit/view/deriveGates";
import { buildSnapshot } from "../src/mock/snapshotBuilder";
import { REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml, modernizationSnapshot } from "./support/cockpitFixtures";

type Snap = ReturnType<typeof modernizationSnapshot>;
const agora = (snapshot: Snap, id = "mod-x") => {
  const ctx = buildViewContext(snapshot, { kind: "initiative", id });
  return deriveAgora(ctx, deriveTrack(ctx, null));
};
const gates = (snapshot: Snap, id = "mod-x") => {
  const ctx = buildViewContext(snapshot, { kind: "initiative", id });
  return deriveGates(ctx, deriveTrack(ctx, null));
};

const DECISION_REQUESTED = { run_id: "r5", event_type: "decision-requested", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", task_id: "epic-0/task-9", message: "titularidade do código", metadata: { reason: "antes de licenciar como MIT" } };

describe("deriveAgora — onde a missão está", () => {
  it("diz a iniciativa, o tipo, o stream e a parada onde a missão está", () => {
    const a = agora(modernizationSnapshot());
    expect(a.where).toEqual({ initiative: "Modernização X", kind: "Modernização", stream: "Execução", focus: "Epic 0", isActive: true });
  });

  it("a iniciativa que não é a ativa diz isso, sem mudar a ativa", () => {
    const snapshot = buildSnapshot({
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({}), initiativeYaml({ id: "hotfix-y", name: "Hotfix Y", type: "hotfix", epics: ["wave-1: Diagnóstico", "wave-2: Correção"] })]),
    });
    const a = agora(snapshot, "hotfix-y");
    expect(a.where).toMatchObject({ initiative: "Hotfix Y", kind: "Hotfix", isActive: false });
  });
});

describe("deriveAgora — o que espera o operador", () => {
  it("sem nada esperando, a lista é vazia (o 'Agora' diz que está em dia)", () => {
    expect(agora(modernizationSnapshot()).waiting).toEqual([]);
  });

  it("gate, tarefa que exige aprovação e decisão pedida: três pedidos, com o gate primeiro", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [
        initiativeYaml({ d2: true, scope: ["api"], epicStatus: "epic-0:\n  status: done\n  items:\n    task-1: { status: done }\n    task-2: { status: done, requires_approval: true, summary: 'Kit canônico' }" }),
      ]),
      events: [DECISION_REQUESTED],
    });
    // Todas as tarefas fecharam: o D3 espera você, e a tarefa que exige aprovação e a decisão do agente também.
    const waiting = agora(snapshot).waiting;
    expect(waiting.map((w) => w.ref.kind)).toEqual(["gate", "approval", "decision"]);
    expect(waiting[0]!.title).toBe("Gate D3 · Modernização X");
    expect(waiting[1]!.title).toBe('Aprovar "Kit canônico"');
    expect(waiting[2]!.title).toBe("Titularidade do código");
    expect(waiting[2]!.detail).toBe("antes de licenciar como MIT");
  });

  it("o D3 pronto para decidir vem antes de tudo", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"], epicStatus: "epic-0:\n  items:\n    task-1: { status: done }\n    task-2: { status: done }" })]),
      events: [DECISION_REQUESTED],
    });
    const waiting = agora(snapshot).waiting;
    expect(waiting.map((w) => w.ref)).toEqual([{ kind: "gate", gate: "d3", initiativeId: "mod-x" }, { kind: "decision", key: "epic-0/task-9" }]);
    expect(waiting[0]!.title).toBe("Gate D3 · Modernização X");
  });

  it("a decisão já tomada deixa de esperar", () => {
    const decided = { run_id: "state-commands", event_type: "decision-made", timestamp: "2026-11-16T11:00:00Z", initiative_id: "mod-x", task_id: "epic-0/task-9", actor: "human", by: "Pessoa Fictícia" };
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"] })]),
      events: [DECISION_REQUESTED, decided],
    });
    expect(agora(snapshot).waiting).toEqual([]);
  });

  it("na Descoberta, o D1 de cada repositório pronto e a fase que o agente terminou esperam você", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "pending" }).replace("arch: { status: done,", "arch: { status: agent-done,"),
    });
    const ctx = buildViewContext(snapshot, { kind: "discovery" });
    const waiting = deriveAgora(ctx, deriveTrack(ctx, null)).waiting;
    expect(waiting.map((w) => w.ref)).toEqual([{ kind: "foundation-phase", phaseId: "arch", repoId: "api" }]);
  });
});

describe("deriveAgora — atividade, bloqueios e falhas", () => {
  const running = (extra: Array<Record<string, unknown>> = []) =>
    buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"], epicStatus: "epic-0:\n  status: in-progress\n  items:\n    task-1: { status: in-progress }" })]),
      events: [
        { run_id: "r1", event_type: "agent-started", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", agent_id: "migration-agent", task_id: "epic-0/task-1", message: "semeando repos/jatai" },
        ...extra,
      ],
    });

  it("um agente trabalhando aparece com o nome e o que ele faz", () => {
    const a = agora(running());
    expect(a.activity.count).toBe(1);
    expect(a.activity.agents).toEqual([{ name: "@migration-agent", task: "semeando repos/jatai" }]);
    expect(a.activity.lastEventAt).toBe("2026-11-16T10:00:00Z");
  });

  it("quando o agente termina, a atividade esvazia e o último evento continua à vista", () => {
    const a = agora(running([{ run_id: "r1", event_type: "agent-done", timestamp: "2026-11-16T10:30:00Z", initiative_id: "mod-x", agent_id: "migration-agent", task_id: "epic-0/task-1" }]));
    expect(a.activity.count).toBe(0);
    expect(a.activity.lastEventAt).toBe("2026-11-16T10:30:00Z");
  });

  it("tarefa bloqueada ou que falhou aparece com o motivo em texto; cancelada não é problema", () => {
    const snapshot = modernizationSnapshot({
      epicStatus:
        'epic-0:\n  items:\n    task-1: { status: blocked, reason: "bloqueada por task-0", summary: "Kit" }\n    task-2: { status: failed, reason: "teste caiu" }\n    task-3: { status: cancelled, reason: "cortada" }',
    });
    expect(agora(snapshot).problems).toEqual([
      { key: "epic-0/task-1", kind: "blocked", title: "Kit", reason: "bloqueada por task-0" },
      { key: "epic-0/task-2", kind: "failed", title: "task-2", reason: "teste caiu" },
    ]);
  });
});

describe("deriveAgora — anúncio de decisão nova (região viva)", () => {
  const w = (id: string, title: string): AgoraWaiting => ({ id, title, detail: "", ref: { kind: "decision", key: id } });

  it("o primeiro estado nunca anuncia", () => {
    expect(announceNewDecisions(null, [w("a", "Titularidade")])).toBeNull();
  });

  it("anuncia a decisão que entrou, uma vez: o mesmo estado repetido não anuncia de novo", () => {
    expect(announceNewDecisions(new Set(), [w("a", "Titularidade do código")])).toBe("Nova decisão espera você: Titularidade do código");
    expect(announceNewDecisions(new Set(["a"]), [w("a", "Titularidade do código")])).toBeNull();
  });

  it("várias decisões novas viram um anúncio só", () => {
    expect(announceNewDecisions(new Set(["a"]), [w("a", "A"), w("b", "B"), w("c", "C")])).toBe("2 novas decisões esperam você");
  });
});

describe("deriveGates — a linha do tempo", () => {
  it("lista D1, D2 e D3 com quem aprovou e quando; o que não chegou diz o que falta", () => {
    const g = gates(modernizationSnapshot());
    expect(g.items.map((i) => [i.badge, i.status])).toEqual([["D1", "approved"], ["D2", "approved"], ["D3", "future"]]);
    expect(g.items[1]!.meta).toBe("✓ aprovado em 14/11 por Pessoa Fictícia");
    expect(g.items[0]!.title).toBe("Descoberta · 1 repositório");
    expect(g.items[2]!.meta).toBe("2 tarefas abertas");
  });

  it("o gate que espera você traz o botão de revisar, que abre a decisão dele", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"], epicStatus: "epic-0:\n  items:\n    task-1: { status: done }" })]),
    });
    const d3 = gates(snapshot).items.find((i) => i.badge === "D3")!;
    expect(d3).toMatchObject({ status: "waiting", meta: "espera você", review: { kind: "gate", gate: "d3", initiativeId: "mod-x" } });
  });

  it("o gate bloqueado diz o motivo", () => {
    const d3 = gates(modernizationSnapshot({ epicStatus: 'epic-0:\n  items:\n    task-1: { status: blocked, reason: "espera o dono" }' })).items.find((i) => i.badge === "D3")!;
    expect(d3).toMatchObject({ status: "blocked", meta: "epic-0/task-1 bloqueada: espera o dono" });
  });

  it("na Descoberta há um D1 por repositório, e os gates que vêm depois aparecem como futuro", () => {
    const snapshot = buildSnapshot({ reposYaml: REPOS_YAML, foundationYaml: foundationYaml({ d1: "pending" }) });
    const ctx = buildViewContext(snapshot, { kind: "discovery" });
    const g = deriveGates(ctx, deriveTrack(ctx, null));
    expect(g.items.map((i) => [i.title, i.status, i.review?.kind])).toEqual([
      ["Descoberta · api", "waiting", "gate"],
      ["Planejamento → Execução", "future", undefined],
      ["Execução → Operação", "future", undefined],
    ]);
  });

  it("o hotfix, que não tem gates, diz isso", () => {
    const snapshot = buildSnapshot({ initiativesYaml: initiativesYaml("hotfix-y", [initiativeYaml({ id: "hotfix-y", type: "hotfix", epics: ["wave-1: Diagnóstico"] })]) });
    expect(gates(snapshot, "hotfix-y")).toEqual({ items: [], empty: "Esta iniciativa ainda não tem gates." });
  });

  it("shortDate usa o dia como foi gravado, sem converter o fuso", () => {
    expect(shortDate("2026-11-14T23:30:00Z")).toBe("14/11");
    expect(shortDate(undefined)).toBeUndefined();
  });
});
