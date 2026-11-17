import { describe, it, expect } from "vitest";
import { buildFoundationPlan, groupPlanByRepo } from "../src/data/foundation-plan";
import { parseReposYaml } from "../src/data/repos-contract";
import { parseFoundationState } from "../src/data/foundation-state-contract";
import { deriveActivity, parseRunEvents } from "../src/data/run-events-contract";
import { FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT } from "../src/data/foundation-contracts";

/**
 * O plano é DERIVADO (repos × contratos × state × eventos), não espelhado do
 * TodoWrite do chat. É o que responde "nunca sei onde está parado" sem depender
 * do agente lembrar de sincronizar nada.
 */

const TWO_REPOS = parseReposYaml(`
repos:
  - id: billing-api
    source: git
    url: git@x/b.git
  - id: claims-svc
    source: git
    url: git@x/c.git
  - id: arquivo-morto
    source: git
    url: git@x/d.git
    scan_profile: ignore
`).inventory;

const EMPTY_ACTIVITY = deriveActivity([]);

describe("o plano cobre tudo — o chat mostrava 22 itens, a tela mostrava 4 barras", () => {
  const plan = buildFoundationPlan(TWO_REPOS, null, EMPTY_ACTIVITY);

  it("gera bloco completo por repositório + cross-repo + gate final", () => {
    const repoPhases = FOUNDATION_CONTRACTS.filter((c) => c.scope === "repo").length; // 5
    const wsPhases = FOUNDATION_CONTRACTS.filter((c) => c.scope === "workspace").length + 1; // + skill-linking
    // 2 repos × (5 fases + 1 gate) + cross-repo + gate global
    expect(plan.total).toBe(2 * (repoPhases + 1) + wsPhases + 1);
  });

  it("ignora repo com scan_profile: ignore", () => {
    expect(plan.items.some((i) => i.repoId === "arquivo-morto")).toBe(false);
  });

  it("cada repositório tem seu próprio gate D1", () => {
    const gates = plan.items.filter((i) => i.kind === "gate" && i.repoId);
    expect(gates.map((g) => g.repoId)).toEqual(["billing-api", "claims-svc"]);
  });

  it("cada item diz qual agente roda e o que produz", () => {
    const tech = plan.items.find((i) => i.key === "billing-api/tech-stack")!;
    expect(tech.agent).toBe("@tech-mapper");
    expect(tech.produces).toBe("assessment/repos/billing-api/tech-stack/tech-radar.md");
  });

  it("o artefato de cada repo é isolado — nunca colidem", () => {
    const a = plan.items.find((i) => i.key === "billing-api/arch")!.produces;
    const b = plan.items.find((i) => i.key === "claims-svc/arch")!.produces;
    expect(a).not.toBe(b);
  });
});

describe("learning no contexto — o 'porquê' viaja com a fase", () => {
  it("toda fase do contrato explica por que existe", () => {
    for (const c of [...FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT]) {
      expect(c.why, `fase '${c.phaseId}' sem 'why'`).toBeTruthy();
      expect(c.why.length, `'${c.phaseId}': why raso demais`).toBeGreaterThan(40);
    }
  });

  it("o plano carrega o porquê para a tela", () => {
    const plan = buildFoundationPlan(TWO_REPOS, null, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "billing-api/tech-stack")!.why).toMatch(/stack real/i);
  });

  it("o domínio explica por que é cross-repo", () => {
    const plan = buildFoundationPlan(TWO_REPOS, null, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "domain")!.why).toMatch(/atravessar dois reposit/i);
  });

  it("os gates explicam a regra do D1 por repo", () => {
    const plan = buildFoundationPlan(TWO_REPOS, null, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "billing-api/gate-d1")!.why).toMatch(/nunca trava os outros/i);
  });
});

describe("status — os eventos vencem o state (são mais recentes)", () => {
  const state = parseFoundationState(`
repos:
  billing-api:
    phases:
      tech-stack: { status: done, human_checklist: {} }
      arch: { status: agent-done, human_checklist: {} }
    gate_d1: { status: pending }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases:
  domain: { status: pending, human_checklist: {} }
`)!;

  it("done no state = done no plano", () => {
    const plan = buildFoundationPlan(TWO_REPOS, state, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "billing-api/tech-stack")!.status).toBe("done");
  });

  it("agent-done vira 'review' — aguardando você", () => {
    const plan = buildFoundationPlan(TWO_REPOS, state, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "billing-api/arch")!.status).toBe("review");
  });

  it("evento agent-started marca 'running' mesmo com o state em pending", () => {
    const activity = deriveActivity(parseRunEvents(
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "quality", repo_id: "billing-api" })
    ));
    const plan = buildFoundationPlan(TWO_REPOS, state, activity);
    expect(plan.items.find((i) => i.key === "billing-api/quality")!.status).toBe("running");
  });

  it("o evento de um repo não afeta a mesma fase no outro", () => {
    const activity = deriveActivity(parseRunEvents(
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "quality", repo_id: "billing-api" })
    ));
    const plan = buildFoundationPlan(TWO_REPOS, state, activity);
    expect(plan.items.find((i) => i.key === "claims-svc/quality")!.status).toBe("pending");
  });

  it("REGRESSÃO: duas fases rodando ao mesmo tempo (repos diferentes) aparecem as DUAS como running, não só a mais recente", () => {
    const activity = deriveActivity(parseRunEvents([
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "quality", repo_id: "billing-api" }),
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:01:00Z", phase_id: "debt", repo_id: "claims-svc" }),
    ].join("\n")));
    const plan = buildFoundationPlan(TWO_REPOS, state, activity);
    expect(plan.items.find((i) => i.key === "billing-api/quality")!.status).toBe("running");
    expect(plan.items.find((i) => i.key === "claims-svc/debt")!.status).toBe("running");
  });

  it("REGRESSÃO: state 'done' vence evento 'agent-done' órfão (caso real de assessment multi-repo)", () => {
    // O agente aprovou arch e debt e seguiu, mas nunca emitiu gate-approved.
    // O agent-done ficava eternamente em 'awaiting' e mostrava ✋ numa fase que
    // o state diz done — com o gate D1 já aprovado. Contradição na tela.
    const done = parseFoundationState(`
repos:
  billing-api:
    phases:
      arch: { status: done, human_checklist: {} }
      debt: { status: done, human_checklist: {} }
    gate_d1: { status: approved }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases: {}
`)!;
    const staleEvents = deriveActivity(parseRunEvents([
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "arch", repo_id: "billing-api" }),
      JSON.stringify({ run_id: "r", event_type: "agent-done", timestamp: "2026-01-01T10:05:00Z", phase_id: "arch", repo_id: "billing-api" }),
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:06:00Z", phase_id: "debt", repo_id: "billing-api" }),
      JSON.stringify({ run_id: "r", event_type: "agent-done", timestamp: "2026-01-01T10:10:00Z", phase_id: "debt", repo_id: "billing-api" }),
    ].join("\n")));

    const plan = buildFoundationPlan(TWO_REPOS, done, staleEvents);
    expect(plan.items.find((i) => i.key === "billing-api/arch")!.status).toBe("done");
    expect(plan.items.find((i) => i.key === "billing-api/debt")!.status).toBe("done");
  });

  it("evento 'running' ainda aparece sobre fase pendente (liveness preservado)", () => {
    const activity = deriveActivity(parseRunEvents(
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "coding-archaeology", repo_id: "claims-svc" })
    ));
    const plan = buildFoundationPlan(TWO_REPOS, null, activity);
    expect(plan.items.find((i) => i.key === "claims-svc/coding-archaeology")!.status).toBe("running");
  });
});

describe("bloqueios — a ordem do protocolo fica visível", () => {
  const state = parseFoundationState(`
repos:
  billing-api:
    phases: {}
    gate_d1: { status: approved }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases: {}
`)!;

  it("o domínio fica bloqueado enquanto um repo não fecha o D1", () => {
    const plan = buildFoundationPlan(TWO_REPOS, state, EMPTY_ACTIVITY);
    const domain = plan.items.find((i) => i.key === "domain")!;
    expect(domain.status).toBe("blocked");
    expect(domain.blockedBy).toContain("claims-svc");
  });

  it("o gate D1 do repo fica bloqueado até as fases dele terminarem", () => {
    const plan = buildFoundationPlan(TWO_REPOS, state, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "claims-svc/gate-d1")!.status).toBe("blocked");
  });

  it("gate D1 já aprovado aparece como done", () => {
    const plan = buildFoundationPlan(TWO_REPOS, state, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "billing-api/gate-d1")!.status).toBe("done");
  });

  it("o D1 global diz o que falta", () => {
    const plan = buildFoundationPlan(TWO_REPOS, state, EMPTY_ACTIVITY);
    const global = plan.items.find((i) => i.key === "gate-d1-global")!;
    expect(global.status).toBe("blocked");
    expect(global.blockedBy).toContain("claims-svc");
  });

  it("REGRESSÃO: repos aprovados + domínio done, mas cross-repo pendente → Discovery NÃO concluído (caso real de assessment multi-repo)", () => {
    // O @assessor aprovou os 4 repos e o domínio, mas ainda faltavam business,
    // baseline e skill-linking. A etapa "Discovery" acendia como concluída no
    // meio do cross-repo, e o plano ficava em 70%.
    const s = parseFoundationState(`
repos:
  billing-api:
    phases: {}
    gate_d1: { status: approved }
  claims-svc:
    phases: {}
    gate_d1: { status: approved }
phases:
  domain: { status: done, human_checklist: {} }
  business-context: { status: pending, human_checklist: {} }
  baseline: { status: pending, human_checklist: {} }
  skill-linking: { status: pending, human_checklist: {} }
`)!;
    const plan = buildFoundationPlan(TWO_REPOS, s, EMPTY_ACTIVITY);

    // o gate global NÃO fecha só porque o domínio fechou
    expect(plan.items.find((i) => i.key === "gate-d1-global")!.status).toBe("blocked");
    // e o plano não está 100% — logo a etapa Discovery não deve acender
    expect(plan.done).toBeLessThan(plan.total);
  });

  it("gate global fecha quando TODO o cross-repo mandatory está done", () => {
    const s = parseFoundationState(`
repos:
  billing-api:
    phases: {}
    gate_d1: { status: approved }
  claims-svc:
    phases: {}
    gate_d1: { status: approved }
phases:
  domain: { status: done, human_checklist: {} }
  business-context: { status: done, human_checklist: {} }
  baseline: { status: done, human_checklist: {} }
  skill-linking: { status: done, human_checklist: {} }
`)!;
    const plan = buildFoundationPlan(TWO_REPOS, s, EMPTY_ACTIVITY);
    expect(plan.items.find((i) => i.key === "gate-d1-global")!.status).toBe("done");
  });
});

describe("focus — o que exige você primeiro", () => {
  it("review vence running e pending", () => {
    const state = parseFoundationState(`
repos:
  billing-api:
    phases:
      arch: { status: agent-done, human_checklist: {} }
    gate_d1: { status: pending }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases: {}
`)!;
    const activity = deriveActivity(parseRunEvents(
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "quality", repo_id: "claims-svc" })
    ));
    expect(buildFoundationPlan(TWO_REPOS, state, activity).focus?.status).toBe("review");
  });

  it("sem review, foca no que está rodando", () => {
    const activity = deriveActivity(parseRunEvents(
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "tech-stack", repo_id: "billing-api" })
    ));
    const focus = buildFoundationPlan(TWO_REPOS, null, activity).focus!;
    expect(focus.status).toBe("running");
    expect(focus.repoId).toBe("billing-api");
  });

  it("workspace zerado foca na primeira fase do primeiro repo", () => {
    const focus = buildFoundationPlan(TWO_REPOS, null, EMPTY_ACTIVITY).focus!;
    expect(focus.key).toBe("billing-api/tech-stack");
  });
});

describe("progresso e agrupamento", () => {
  it("conta só o que está done", () => {
    const state = parseFoundationState(`
repos:
  billing-api:
    phases:
      tech-stack: { status: done, human_checklist: {} }
      arch: { status: done, human_checklist: {} }
    gate_d1: { status: pending }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases: {}
`)!;
    expect(buildFoundationPlan(TWO_REPOS, state, EMPTY_ACTIVITY).done).toBe(2);
  });

  it("agrupa por repositório, com o cross-repo à parte", () => {
    const groups = groupPlanByRepo(buildFoundationPlan(TWO_REPOS, null, EMPTY_ACTIVITY));
    expect([...groups.keys()]).toEqual(["billing-api", "claims-svc", "workspace"]);
    // 6 fases (design incluído — has_frontend indefinido mostra por precaução) + gate
    expect(groups.get("billing-api")).toHaveLength(7);
  });
});

describe("fase de design — condicional a ter frontend", () => {
  it("has_frontend indefinido: mostra a fase (melhor mostrar do que esconder)", () => {
    const plan = buildFoundationPlan(TWO_REPOS, null, EMPTY_ACTIVITY);
    expect(plan.items.some((i) => i.key === "billing-api/design")).toBe(true);
  });

  it("has_frontend: false: a fase some do plano daquele repo", () => {
    const inv = parseReposYaml(`
repos:
  - id: api-pura
    source: git
    url: git@x/a.git
    has_frontend: false
`).inventory;
    const plan = buildFoundationPlan(inv, null, EMPTY_ACTIVITY);
    expect(plan.items.some((i) => i.key === "api-pura/design")).toBe(false);
  });

  it("has_frontend: true: a fase entra normalmente", () => {
    const inv = parseReposYaml(`
repos:
  - id: web-app
    source: git
    url: git@x/w.git
    has_frontend: true
`).inventory;
    const plan = buildFoundationPlan(inv, null, EMPTY_ACTIVITY);
    expect(plan.items.some((i) => i.key === "web-app/design")).toBe(true);
  });

  it("repo sem UI fecha o D1 sem esperar a fase de design", () => {
    const inv = parseReposYaml(`
repos:
  - id: api-pura
    source: git
    url: git@x/a.git
    has_frontend: false
`).inventory;
    const state = parseFoundationState(`
repos:
  api-pura:
    phases:
      tech-stack: { status: done, human_checklist: {} }
      arch: { status: done, human_checklist: {} }
      coding-archaeology: { status: done, human_checklist: {} }
      quality: { status: done, human_checklist: {} }
      debt: { status: done, human_checklist: {} }
    gate_d1: { status: pending }
`)!;
    // design NÃO conta para o gate — senão um repo de API nunca fecharia o D1
    const gate = buildFoundationPlan(inv, state, EMPTY_ACTIVITY).items.find((i) => i.key === "api-pura/gate-d1")!;
    expect(gate.status).toBe("review"); // pronto para aprovar, não bloqueado
  });
});

describe("P1 — one repo é multi repo com N=1", () => {
  it("um repositório gera o mesmo formato de plano", () => {
    const inv = parseReposYaml(`
repos:
  - id: unico
    source: git
    url: git@x/u.git
`).inventory;
    const plan = buildFoundationPlan(inv, null, EMPTY_ACTIVITY);
    expect(plan.items.some((i) => i.key === "unico/gate-d1")).toBe(true);
    expect(plan.items.some((i) => i.key === "gate-d1-global")).toBe(true);
  });

  it("sem repositórios, ainda mostra o caminho (cross-repo + gate)", () => {
    const plan = buildFoundationPlan(null, null, EMPTY_ACTIVITY);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.done).toBe(0);
  });
});
