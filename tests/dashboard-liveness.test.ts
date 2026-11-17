import { describe, it, expect } from "vitest";
import { parseReposYaml } from "../src/data/repos-contract";
import { parseFoundationState } from "../src/data/foundation-state-contract";
import { parseRunEvents, deriveActivity } from "../src/data/run-events-contract";
import { buildFoundationPlan } from "../src/data/foundation-plan";

/**
 * Integração: os quatro contratos juntos contam a história de uma sessão real.
 *
 * O que este teste protege é a queixa original: "o dashboard não reflete o que
 * está acontecendo; o checklist aparece no chat e não na tela; nunca sei onde
 * está parado".
 */

const INVENTORY = parseReposYaml(`
repos:
  - id: billing-api
    source: git
    url: git@x/b.git
    stack: java-spring
    arch_current: layered-mvc
    arch_confidence: 82
  - id: claims-svc
    source: git
    url: git@x/c.git
`).inventory;

const ev = (o: Record<string, unknown>): string =>
  JSON.stringify({ run_id: "foundation-1", ...o });

describe("uma sessão de Discovery, do zero ao gate", () => {
  it("workspace zerado: o plano já mostra o caminho inteiro", () => {
    const plan = buildFoundationPlan(INVENTORY, null, deriveActivity([]));
    expect(plan.done).toBe(0);
    expect(plan.total).toBeGreaterThan(15); // o chat mostrava 22 itens; a tela mostrava 4 barras
    expect(plan.focus?.key).toBe("billing-api/tech-stack");
  });

  it("agente começa: a tela sai do estado congelado ANTES de qualquer gate", () => {
    // Este é o buraco que o canal de eventos fecha: o foundation-state só muda
    // no gate, então sem eventos a tela ficaria 10+ minutos parecendo travada.
    const activity = deriveActivity(parseRunEvents([
      ev({ event_type: "agent-started", timestamp: "2026-07-16T10:00:00Z", phase_id: "tech-stack", repo_id: "billing-api", agent_id: "@tech-mapper" }),
      ev({ event_type: "agent-progress", timestamp: "2026-07-16T10:02:00Z", phase_id: "tech-stack", repo_id: "billing-api", message: "lendo 30 módulos…" }),
    ].join("\n")));

    expect(activity.running?.message).toBe("lendo 30 módulos…");

    const plan = buildFoundationPlan(INVENTORY, null, activity);
    expect(plan.items.find((i) => i.key === "billing-api/tech-stack")!.status).toBe("running");
    expect(plan.focus?.status).toBe("running");
  });

  it("agente termina: a tela mostra que ESPERA POR VOCÊ (o gate HITL)", () => {
    const activity = deriveActivity(parseRunEvents([
      ev({ event_type: "agent-started", timestamp: "2026-07-16T10:00:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
      ev({ event_type: "agent-done", timestamp: "2026-07-16T10:05:00Z", phase_id: "tech-stack", repo_id: "billing-api", agent_id: "@tech-mapper" }),
    ].join("\n")));

    expect(activity.running).toBeNull();
    expect(activity.awaiting).toHaveLength(1);

    const plan = buildFoundationPlan(INVENTORY, null, activity);
    expect(plan.focus?.status).toBe("review"); // o que exige humano vem primeiro
  });

  it("humano aprova: o state grava e a tela avança", () => {
    const state = parseFoundationState(`
repos:
  billing-api:
    phases:
      tech-stack: { status: done, human_checklist: { stack-identified: true } }
    gate_d1: { status: pending }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases: {}
`)!;
    const activity = deriveActivity(parseRunEvents(
      ev({ event_type: "gate-approved", timestamp: "2026-07-16T10:09:00Z", phase_id: "tech-stack", repo_id: "billing-api" })
    ));

    const plan = buildFoundationPlan(INVENTORY, state, activity);
    expect(plan.items.find((i) => i.key === "billing-api/tech-stack")!.status).toBe("done");
    expect(plan.done).toBe(1);
    expect(activity.awaiting).toHaveLength(0);
  });

  it("dois repos em estágios diferentes não se confundem — o D1 é por repo", () => {
    const state = parseFoundationState(`
repos:
  billing-api:
    phases:
      tech-stack: { status: done, human_checklist: {} }
      arch: { status: done, human_checklist: {} }
      coding-archaeology: { status: done, human_checklist: {} }
      quality: { status: done, human_checklist: {} }
      debt: { status: done, human_checklist: {} }
    gate_d1: { status: approved }
  claims-svc:
    phases:
      tech-stack: { status: agent-done, human_checklist: {} }
    gate_d1: { status: pending }
phases: {}
`)!;
    const plan = buildFoundationPlan(INVENTORY, state, deriveActivity([]));

    expect(plan.items.find((i) => i.key === "billing-api/gate-d1")!.status).toBe("done");
    expect(plan.items.find((i) => i.key === "claims-svc/gate-d1")!.status).toBe("blocked");
    // e o domínio espera o repo que falta
    expect(plan.items.find((i) => i.key === "domain")!.blockedBy).toContain("claims-svc");
  });

  it("um repo bloqueado NUNCA trava o outro — a promessa do modelo", () => {
    const state = parseFoundationState(`
repos:
  billing-api:
    phases: {}
    gate_d1: { status: pending }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases: {}
`)!;
    const activity = deriveActivity(parseRunEvents(
      ev({ event_type: "blocked", timestamp: "2026-07-16T10:00:00Z", phase_id: "tech-stack", repo_id: "billing-api", message: "sem acesso ao remote" })
    ));
    const plan = buildFoundationPlan(INVENTORY, state, activity);

    // claims-svc segue disponível para trabalhar
    expect(plan.items.find((i) => i.key === "claims-svc/tech-stack")!.status).toBe("pending");
    expect(activity.running).toBeNull();
  });
});

describe("o dashboard ensina no contexto (item 12)", () => {
  it("todo item do plano diz o agente, o artefato e o porquê", () => {
    const plan = buildFoundationPlan(INVENTORY, null, deriveActivity([]));
    for (const item of plan.items.filter((i) => i.kind === "phase")) {
      expect(item.agent, `${item.key} sem agente`).toBeTruthy();
      expect(item.produces, `${item.key} sem artefato`).toBeTruthy();
      expect(item.why, `${item.key} sem 'porquê'`).toBeTruthy();
    }
  });

  it("o foco explica por que aquela fase existe", () => {
    const plan = buildFoundationPlan(INVENTORY, null, deriveActivity([]));
    expect(plan.focus?.why).toBeTruthy();
  });
});
