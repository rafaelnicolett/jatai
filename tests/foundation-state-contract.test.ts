import { describe, it, expect } from "vitest";
import {
  parseFoundationState,
  toFoundationStatus,
  phasesForRepo,
  phaseState,
  gateD1ForRepo,
  d1BlockedBy,
  isD1GlobalReady,
  FOUNDATION_STATE_REL,
} from "../src/data/foundation-state-contract";
import { parseReposYaml } from "../src/data/repos-contract";

const MULTI_REPO_STATE = `
version: 2
repos:
  billing-api:
    phases:
      tech-stack:
        status: done
        agent: "@tech-mapper"
        completed_at: "2026-07-16T10:00:00Z"
        human_checklist:
          stack-identified: true
          deps-listed: true
      arch:
        status: agent-done
        agent: "@arch-discoverer"
        human_checklist: {}
    findings_summary:
      critical: 3
      high: 11
      medium: 24
      low: 8
    gate_d1:
      status: approved
      approved_at: "2026-07-16T11:00:00Z"
  claims-svc:
    phases:
      tech-stack:
        status: pending
        human_checklist: {}
    gate_d1:
      status: pending
phases:
  domain:
    status: done
    agent: "@domain-extractor"
    human_checklist:
      bcs-extracted: true
`;

const INVENTORY = parseReposYaml(`
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

describe("foundation-state — path canônico", () => {
  it("é assessment/foundation-state.yaml (onde o @assessor grava)", () => {
    expect(FOUNDATION_STATE_REL).toBe(".github/artifacts/assessment/foundation-state.yaml");
  });
});

describe("toFoundationStatus — agent-done não pode colapsar", () => {
  it("preserva agent-done (aguardando aprovação humana)", () => {
    expect(toFoundationStatus("agent-done")).toBe("agent-done");
  });
  it.each([["done", "done"], ["in-progress", "in-progress"], ["pending", "pending"]])(
    "%s → %s", (raw, expected) => expect(toFoundationStatus(raw)).toBe(expected)
  );
  it.each([undefined, null, "", "qualquer-coisa"])("valor desconhecido (%s) vira pending", (raw) => {
    expect(toFoundationStatus(raw)).toBe("pending");
  });
});

describe("parseFoundationState — multi-repo", () => {
  it("lê fases por repo", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    const billing = phasesForRepo(s, "billing-api");
    expect(billing["tech-stack"]!.status).toBe("done");
    expect(billing["tech-stack"]!.agent).toBe("@tech-mapper");
    expect(billing["tech-stack"]!.human_checklist["stack-identified"]).toBe(true);
    expect(billing["arch"]!.status).toBe("agent-done");
  });

  it("lê fases cross-repo separadas das por-repo", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(s.phases["domain"]!.status).toBe("done");
    expect(s.repos["billing-api"]!.phases["domain"]).toBeUndefined();
  });

  it("REGRESSÃO: `repos:` não vira fase fantasma (o parser regex antigo quebrava aqui)", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(Object.keys(s.phases)).toEqual(["domain"]);
    expect(s.phases["repos"]).toBeUndefined();
    expect(s.phases["billing-api"]).toBeUndefined();
  });

  it("lê findings_summary por repo", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(s.repos["billing-api"]!.findings_summary).toEqual({ critical: 3, high: 11, medium: 24, low: 8 });
  });

  it("repo sem findings_summary não inventa números", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(s.repos["claims-svc"]!.findings_summary).toBeUndefined();
  });
});

describe("parseFoundationState — compat v1 (single-repo, sem `repos:`)", () => {
  const V1 = `
phases:
  tech-stack:
    status: done
    human_checklist:
      stack-identified: true
`;
  it("continua lendo o formato antigo sem migração", () => {
    const s = parseFoundationState(V1)!;
    expect(s.phases["tech-stack"]!.status).toBe("done");
    expect(s.repos).toEqual({});
  });

  it("phaseState cai para cross-repo quando o repo não tem a fase", () => {
    const s = parseFoundationState(V1)!;
    expect(phaseState(s, "tech-stack", "repo-inexistente")?.status).toBe("done");
  });

  it("phaseState prefere a fase do repo quando existe", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(phaseState(s, "tech-stack", "claims-svc")?.status).toBe("pending");
    expect(phaseState(s, "tech-stack", "billing-api")?.status).toBe("done");
  });
});

describe("parseFoundationState — robustez", () => {
  it("YAML malformado devolve null em vez de explodir", () => {
    expect(parseFoundationState("phases:\n  - [")).toBeNull();
  });
  it("arquivo vazio devolve null", () => {
    expect(parseFoundationState("")).toBeNull();
  });
  it("sem phases nem repos devolve null", () => {
    expect(parseFoundationState("version: 2\n")).toBeNull();
  });
});

describe("gate D1 — por repo, sempre", () => {
  it("gate aprovado de um repo não aprova o outro", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(gateD1ForRepo(s, "billing-api")).toBe("approved");
    expect(gateD1ForRepo(s, "claims-svc")).toBe("pending");
  });

  it("repo desconhecido é pending (nunca aprovado por omissão)", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(gateD1ForRepo(s, "nao-existe")).toBe("pending");
  });

  it("d1BlockedBy lista só os que faltam e ignora scan_profile: ignore", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(d1BlockedBy(s, INVENTORY)).toEqual(["claims-svc"]);
  });
});

describe("D1 global — derivado do rollup", () => {
  it("não fecha enquanto um repo estiver pendente", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(isD1GlobalReady(s, INVENTORY)).toBe(false);
  });

  it("fecha quando todos os repos aprovados E domínio done", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    s.repos["claims-svc"]!.gate_d1.status = "approved";
    expect(isD1GlobalReady(s, INVENTORY)).toBe(true);
  });

  it("não fecha se todos os repos aprovados mas domínio não (é cross-repo)", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    s.repos["claims-svc"]!.gate_d1.status = "approved";
    s.phases["domain"]!.status = "agent-done";
    expect(isD1GlobalReady(s, INVENTORY)).toBe(false);
  });

  it("não fecha sem repos no inventário", () => {
    const s = parseFoundationState(MULTI_REPO_STATE)!;
    expect(isD1GlobalReady(s, null)).toBe(false);
  });

  it("P1: N=1 fecha igual — sem caminho especial", () => {
    const s = parseFoundationState(`
repos:
  unico:
    phases: {}
    gate_d1: { status: approved }
phases:
  domain: { status: done, human_checklist: {} }
`)!;
    const inv = parseReposYaml(`
repos:
  - id: unico
    source: git
    url: git@x/u.git
`).inventory;
    expect(isD1GlobalReady(s, inv)).toBe(true);
  });
});
