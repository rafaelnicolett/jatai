import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  parseDeliveryState,
  mergeDeliveryStates,
  synthesizeDeliveryStateFromPhase,
  DELIVERY_STATE_GLOBAL_REL,
} from "../src/data/delivery-state-contract";

describe("delivery-state-contract — path canônico", () => {
  it("aponta para .github/artifacts/delivery-state.yaml", () => {
    expect(DELIVERY_STATE_GLOBAL_REL).toBe(".github/artifacts/delivery-state.yaml");
  });
});

describe("parseDeliveryState — happy path", () => {
  it("lê fases com status/agent/completed_at/human_checklist", () => {
    const state = parseDeliveryState(`
phases:
  business:
    status: done
    agent: "@business"
    completed_at: "2026-05-12T00:00:00Z"
    human_checklist:
      brief-exists: true
  sprint-run:
    status: in-progress
    agent: "@sprint-runner"
`);
    expect(state?.phases.business?.status).toBe("done");
    expect(state?.phases.business?.agent).toBe("@business");
    expect(state?.phases.business?.human_checklist["brief-exists"]).toBe(true);
    expect(state?.phases["sprint-run"]?.status).toBe("in-progress");
  });

  it("lê artifacts[] com path/exists/note", () => {
    const state = parseDeliveryState(`
phases:
  architecture:
    status: done
    artifacts:
      - path: api/openapi.yaml
        exists: true
        note: "4 novas tags"
`);
    expect(state?.phases.architecture?.artifacts).toEqual([
      { path: "api/openapi.yaml", exists: true, note: "4 novas tags" },
    ]);
  });

  it("lê artifacts[].status quando presente (item 3.8 — status por artefato, opcional)", () => {
    const state = parseDeliveryState(`
phases:
  bdd:
    status: in-progress
    artifacts:
      - path: cenario-login.feature
        status: done
      - path: cenario-logout.feature
        status: pending
      - path: cenario-refresh.feature
`);
    expect(state?.phases.bdd?.artifacts).toEqual([
      { path: "cenario-login.feature", status: "done" },
      { path: "cenario-logout.feature", status: "pending" },
      { path: "cenario-refresh.feature" },
    ]);
  });

  // ADR-0022 §5 (F6.5): sem rebaixamento silencioso. Antes, "planned" virava "pending".
  it("REGRESSÃO: artifacts[].status fora do vocabulário é lido como 'unknown', não como 'pending' (ADR-0022 / H-GAP-07)", () => {
    const state = parseDeliveryState(`
phases:
  bdd:
    status: in-progress
    artifacts:
      - path: cenario-x.feature
        status: planned
`);
    expect(state?.phases.bdd?.artifacts).toEqual([{ path: "cenario-x.feature", status: "unknown" }]);
  });

  it("normaliza chave de checklist com hífen corretamente", () => {
    const state = parseDeliveryState(`
phases:
  business:
    status: done
    human_checklist:
      brief-exists: true
      problem-section: false
`);
    expect(state?.phases.business?.human_checklist["brief-exists"]).toBe(true);
    expect(state?.phases.business?.human_checklist["problem-section"]).toBe(false);
  });

  it("REGRESSÃO: status 'planned' (visto em produção, fora do vocabulário) é preservado como desconhecido, não vira 'pending' (ADR-0022 / H-GAP-07)", () => {
    const state = parseDeliveryState(`
phases:
  sprint-run:
    status: planned
`);
    expect(state?.phases["sprint-run"]).toMatchObject({ status: "unknown", status_text: "planned" });
  });

  it("aliases de nome de agente (sprint-planner, domain-modeler, ux-designer, sprint-runner) mapeiam pro phaseId canônico", () => {
    const state = parseDeliveryState(`
phases:
  sprint-planner:
    status: done
  domain-modeler:
    status: done
  ux-designer:
    status: done
  sprint-runner:
    status: in-progress
`);
    expect(state?.phases["sprint-plan"]?.status).toBe("done");
    expect(state?.phases["domain"]?.status).toBe("done");
    expect(state?.phases["ux-design"]?.status).toBe("done");
    expect(state?.phases["sprint-run"]?.status).toBe("in-progress");
  });

  it("chave canônica já gravada nunca é sobrescrita pelo alias", () => {
    const state = parseDeliveryState(`
phases:
  sprint-plan:
    status: done
  sprint-planner:
    status: pending
`);
    expect(state?.phases["sprint-plan"]?.status).toBe("done");
  });
});

describe("parseDeliveryState — degradação", () => {
  it("YAML totalmente inválido devolve null, nunca lança", () => {
    expect(() => parseDeliveryState(":\n  :\n    [[[")).not.toThrow();
    expect(parseDeliveryState(":\n  :\n    [[[")).toBeNull();
  });

  it("sem 'phases' nenhuma, devolve null", () => {
    expect(parseDeliveryState("version: 1")).toBeNull();
  });

  it("chave de topo duplicada (json:true) parseia em vez de lançar", () => {
    const raw = `
stream: upstream
phases:
  business:
    status: done
stream: downstream
`;
    expect(() => parseDeliveryState(raw)).not.toThrow();
    expect(parseDeliveryState(raw)?.phases.business?.status).toBe("done");
  });

  it("regressão: um delivery-state.yaml com chave de topo duplicada (forma de um arquivo real) nunca lança e recupera algo", () => {
    // Fixture sintética (F2.3) com a forma de um arquivo real: `stream:`
    // duplicado no topo, fase chaveada pelo nome do agente e um bloco de fase
    // indentado sob o gate.
    const fixturePath = path.resolve(__dirname, "fixtures/delivery-state-chave-duplicada.yaml");
    const raw = fs.readFileSync(fixturePath, "utf-8");
    expect(() => parseDeliveryState(raw)).not.toThrow();
    const state = parseDeliveryState(raw);
    expect(state).not.toBeNull();
    expect(state?.phases.business?.status).toBe("done");
    expect(state?.phases.architecture?.status).toBe("done");
  });
});

describe("mergeDeliveryStates", () => {
  it("sem nenhum dos dois, devolve null", () => {
    expect(mergeDeliveryStates(null, null, 0, 0)).toBeNull();
  });

  it("só global existe — devolve global", () => {
    const global = parseDeliveryState("phases:\n  business:\n    status: done");
    expect(mergeDeliveryStates(global, null, 100, 0)).toBe(global);
  });

  it("só per-iniciativa existe — devolve per-iniciativa", () => {
    const perInit = parseDeliveryState("phases:\n  business:\n    status: done");
    expect(mergeDeliveryStates(null, perInit, 0, 100)).toBe(perInit);
  });

  it("os dois existem — funde por fase, o mais recente (mtime) vence no conflito, mas preserva fases exclusivas de cada lado", () => {
    const global = parseDeliveryState("phases:\n  business:\n    status: done\n  product:\n    status: pending");
    const perInit = parseDeliveryState("phases:\n  business:\n    status: in-progress\n  architecture:\n    status: done");

    const merged = mergeDeliveryStates(global, perInit, 100, 200); // perInit é mais novo
    expect(merged?.phases.business?.status).toBe("in-progress"); // conflito: perInit (mais novo) vence
    expect(merged?.phases.product?.status).toBe("pending"); // só existe no global
    expect(merged?.phases.architecture?.status).toBe("done"); // só existe no perInit
  });
});

describe("synthesizeDeliveryStateFromPhase", () => {
  it("sem current_phase nenhum, tudo pending", () => {
    const state = synthesizeDeliveryStateFromPhase(undefined);
    expect(state.phases.business?.status).toBe("pending");
    expect(state.phases.sustain?.status).toBe("pending");
  });

  it("fases antes da atual viram done, a atual in-progress, as depois pending", () => {
    const state = synthesizeDeliveryStateFromPhase("architecture");
    expect(state.phases.business?.status).toBe("done");
    expect(state.phases.product?.status).toBe("done");
    expect(state.phases.architecture?.status).toBe("in-progress");
    expect(state.phases["sprint-plan"]?.status).toBe("pending");
  });

  it("phaseId desconhecido se comporta como 'sem current_phase' (tudo pending)", () => {
    const state = synthesizeDeliveryStateFromPhase("nao-existe");
    expect(state.phases.business?.status).toBe("pending");
  });

  it("REGRESSÃO (F3.1): current_phase gravado com alias (sprint-planner, ou o `review` do pipeline legado) sintetiza a fase canônica, não tudo pending", () => {
    const planner = synthesizeDeliveryStateFromPhase("sprint-planner");
    expect(planner.phases.architecture?.status).toBe("done");
    expect(planner.phases["sprint-plan"]?.status).toBe("in-progress");
    expect(planner.phases["sprint-run"]?.status).toBe("pending");
    const review = synthesizeDeliveryStateFromPhase("review");
    expect(review.phases.frontend?.status).toBe("done");
    expect(review.phases.reviewer?.status).toBe("in-progress");
    expect(review.phases.devops?.status).toBe("pending");
  });
});
