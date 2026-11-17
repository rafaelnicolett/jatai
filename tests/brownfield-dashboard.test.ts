import { describe, it, expect } from "vitest";
import { FOUNDATION_CONTRACTS } from "../src/data/foundation-contracts";
import { parseReposYaml } from "../src/data/repos-contract";
import { parseContextReposYaml, acceptedContexts } from "../src/data/context-repos-contract";
import {
  parseFoundationState,
  d1BlockedBy,
  isD1GlobalReady,
  gateD1ForRepo,
  phasesForRepo,
} from "../src/data/foundation-state-contract";

/**
 * O dashboard brownfield deriva TUDO destes contratos. Estes testes travam as
 * regras que a UI depende — sem elas o Cockpit volta a mentir sobre o estado
 * (era o que fazia: renderizava só o Discovery e "sumia" depois dele).
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
  - id: arquivo-morto
    source: git
    url: git@x/d.git
    scan_profile: ignore
`).inventory;

const STATE = parseFoundationState(`
repos:
  billing-api:
    phases:
      tech-stack: { status: done, human_checklist: {} }
      arch: { status: done, human_checklist: {} }
      coding-archaeology: { status: agent-done, human_checklist: {} }
      quality: { status: pending, human_checklist: {} }
      debt: { status: pending, human_checklist: {} }
    findings_summary: { critical: 3, high: 11, medium: 24, low: 8 }
    gate_d1: { status: pending }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
phases:
  domain: { status: pending, human_checklist: {} }
`)!;

describe("fases por repo — derivadas dos contratos, não hardcoded", () => {
  it("são exatamente as de scope: repo", () => {
    const repoScoped = FOUNDATION_CONTRACTS.filter((c) => c.scope === "repo").map((c) => c.phaseId);
    expect(repoScoped).toEqual(["tech-stack", "arch", "coding-archaeology", "design", "quality", "debt"]);
  });

  it("o dashboard conta o progresso só das fases do repo", () => {
    const phases = phasesForRepo(STATE, "billing-api");
    const repoScoped = FOUNDATION_CONTRACTS.filter((c) => c.scope === "repo").map((c) => c.phaseId);
    const done = repoScoped.filter((p) => phases[p]?.status === "done").length;
    expect(done).toBe(2); // tech-stack + arch
    expect(repoScoped.length).toBe(6);
  });

  it("`agent-done` é contado como 'aguardando revisão', não como pendente nem feito", () => {
    const phases = phasesForRepo(STATE, "billing-api");
    const awaiting = Object.values(phases).filter((p) => p.status === "agent-done").length;
    expect(awaiting).toBe(1); // coding-archaeology
  });
});

describe("gate D1 por repo — um repo grande não trava os outros", () => {
  it("lista só os repos que faltam, ignorando scan_profile: ignore", () => {
    expect(d1BlockedBy(STATE, INVENTORY)).toEqual(["billing-api", "claims-svc"]);
  });

  it("aprovar um repo não aprova o outro", () => {
    const s = parseFoundationState(`
repos:
  billing-api:
    phases: {}
    gate_d1: { status: approved }
  claims-svc:
    phases: {}
    gate_d1: { status: pending }
`)!;
    expect(gateD1ForRepo(s, "billing-api")).toBe("approved");
    expect(gateD1ForRepo(s, "claims-svc")).toBe("pending");
    expect(d1BlockedBy(s, INVENTORY)).toEqual(["claims-svc"]);
  });
});

describe("progressive disclosure — Discovery colapsa quando termina", () => {
  it("não colapsa enquanto houver repo pendente", () => {
    expect(isD1GlobalReady(STATE, INVENTORY)).toBe(false);
  });

  it("colapsa quando todos os repos + domínio estão aprovados", () => {
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
`)!;
    expect(isD1GlobalReady(s, INVENTORY)).toBe(true);
  });

  it("não colapsa se os repos fecharam mas o domínio não (é cross-repo)", () => {
    const s = parseFoundationState(`
repos:
  billing-api:
    phases: {}
    gate_d1: { status: approved }
  claims-svc:
    phases: {}
    gate_d1: { status: approved }
phases:
  domain: { status: agent-done, human_checklist: {} }
`)!;
    expect(isD1GlobalReady(s, INVENTORY)).toBe(false);
  });
});

describe("Tech Debt Radar — agora tem dono", () => {
  it("findings_summary vem por repo (antes era global e ambíguo)", () => {
    expect(STATE.repos["billing-api"]!.findings_summary).toEqual({
      critical: 3, high: 11, medium: 24, low: 8,
    });
  });

  it("repo sem assessment não inventa números", () => {
    expect(STATE.repos["claims-svc"]!.findings_summary).toBeUndefined();
  });
});

describe("stack e padrão vêm de graça do assessment", () => {
  it("o dashboard lê stack/arch_current/confiança do inventário", () => {
    const billing = INVENTORY.repos.find((r) => r.id === "billing-api")!;
    expect(billing.stack).toBe("java-spring");
    expect(billing.arch_current).toBe("layered-mvc");
    expect(billing.arch_confidence).toBe(82);
  });

  it("repo ainda não assessado não tem padrão (mostra 'a descobrir')", () => {
    const claims = INVENTORY.repos.find((r) => r.id === "claims-svc")!;
    expect(claims.arch_current).toBeUndefined();
  });
});

describe("Bounded Contexts × repos — o N:N desenhado", () => {
  const MAP = parseContextReposYaml(`
contexts:
  - slug: faturamento
    name: "Faturamento"
    status: accepted
    lives_in:
      - repo: billing-api
        paths: ["src/**"]
      - repo: legacy-erp
        paths: ["modules/fat/**"]
  - slug: sinistros
    name: "Sinistros"
    status: candidate
    lives_in:
      - repo: claims-svc
`).map;

  it("um contexto atravessando 2 repos é renderizável", () => {
    const fat = MAP.contexts.find((c) => c.slug === "faturamento")!;
    expect(fat.lives_in.map((l) => l.repo)).toEqual(["billing-api", "legacy-erp"]);
  });

  it("só accepted conta como aprovado (candidate aguarda o gate)", () => {
    expect(acceptedContexts(MAP).map((c) => c.slug)).toEqual(["faturamento"]);
    expect(MAP.contexts).toHaveLength(2);
  });

  it("mapa vazio não quebra o dashboard", () => {
    expect(acceptedContexts(null)).toEqual([]);
  });
});
