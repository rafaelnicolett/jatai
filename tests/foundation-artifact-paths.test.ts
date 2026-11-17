import { describe, it, expect } from "vitest";
import {
  FOUNDATION_CONTRACTS,
  SKILL_LINKING_CONTRACT,
  resolveArtifactPath,
  repoAssessmentDir,
  ASSESSMENT_DIR,
  type FoundationPhaseContract,
} from "../src/data/foundation-contracts";

const byId = (id: string): FoundationPhaseContract =>
  FOUNDATION_CONTRACTS.find((c) => c.phaseId === id)!;

describe("escopo das fases — quem roda por repo vs cross-repo", () => {
  it.each(["tech-stack", "arch", "coding-archaeology", "quality", "debt"])(
    "%s roda por repositório",
    (id) => expect(byId(id).scope).toBe("repo")
  );

  it.each(["domain", "business-context", "interview", "baseline"])(
    "%s roda uma vez, cross-repo",
    (id) => expect(byId(id).scope).toBe("workspace")
  );

  it("@domain-extractor é workspace — precisa ver todos os repos para achar um contexto que atravessa dois", () => {
    const domain = byId("domain");
    expect(domain.agent).toBe("@domain-extractor");
    expect(domain.scope).toBe("workspace");
  });

  it("toda fase declara um escopo (nenhuma fica ambígua)", () => {
    for (const c of [...FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT]) {
      expect(["repo", "workspace"], `fase '${c.phaseId}' sem scope válido`).toContain(c.scope);
    }
  });
});

describe("repoAssessmentDir", () => {
  it("ancora em assessment/repos/<id>", () => {
    expect(repoAssessmentDir("billing-api")).toBe("assessment/repos/billing-api");
  });
});

describe("resolveArtifactPath — scope: repo", () => {
  it("insere repos/<id>/ depois de assessment/", () => {
    expect(resolveArtifactPath(byId("tech-stack"), "billing-api"))
      .toBe("assessment/repos/billing-api/tech-stack/tech-radar.md");
  });

  it("cada repo tem seu próprio artefato — nunca colidem", () => {
    const c = byId("arch");
    const a = resolveArtifactPath(c, "billing-api");
    const b = resolveArtifactPath(c, "legacy-erp");
    expect(a).not.toBe(b);
    expect(a).toContain("repos/billing-api/");
    expect(b).toContain("repos/legacy-erp/");
  });

  it("sem repoId devolve o path legado v1 (workspace antigo continua legível)", () => {
    expect(resolveArtifactPath(byId("tech-stack"))).toBe("assessment/tech-stack/tech-radar.md");
  });

  it("preserva o resto do path intacto", () => {
    expect(resolveArtifactPath(byId("debt"), "erp")).toBe("assessment/repos/erp/debt/tech-debt.md");
    expect(resolveArtifactPath(byId("coding-archaeology"), "erp"))
      .toBe("assessment/repos/erp/coding-guidelines/project-coding-guide.md");
  });
});

describe("resolveArtifactPath — scope: workspace", () => {
  it("ignora o repoId — o artefato é único para o workspace", () => {
    expect(resolveArtifactPath(byId("domain"), "billing-api"))
      .toBe("assessment/domain/context-map.md");
  });

  it.each(["business-context", "interview", "baseline"])(
    "%s não é reancorado por repo",
    (id) => {
      const c = byId(id);
      expect(resolveArtifactPath(c, "qualquer-repo")).toBe(c.out);
    }
  );
});

describe("P1 — one repo é multi repo com N=1", () => {
  it("N=1 usa o mesmo layout por repo (sem caminho especial)", () => {
    expect(resolveArtifactPath(byId("tech-stack"), "unico"))
      .toBe("assessment/repos/unico/tech-stack/tech-radar.md");
  });
});

describe("invariantes de layout", () => {
  // wiki-synthesis é a única exceção documentada: o artefato real é a LLM Wiki
  // (<host-dir>/agents/domain/*.agent.md), que vive fora de .github/artifacts/
  // por natureza — não é um relatório de assessment, é capacidade instalada.
  const OUT_OF_ASSESSMENT_EXCEPTIONS = new Set(["wiki-synthesis"]);

  it("todo artefato de fase mora sob assessment/, exceto exceções documentadas", () => {
    for (const c of [...FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT]) {
      if (OUT_OF_ASSESSMENT_EXCEPTIONS.has(c.phaseId)) {
        expect(c.out.startsWith(`${ASSESSMENT_DIR}/`), `'${c.phaseId}' deveria ser exceção documentada, mas está sob assessment/ — remova da lista de exceções`).toBe(false);
        continue;
      }
      expect(c.out.startsWith(`${ASSESSMENT_DIR}/`), `fase '${c.phaseId}': out fora de assessment/ — se for intencional, documente em OUT_OF_ASSESSMENT_EXCEPTIONS`).toBe(true);
    }
  });

  it("resolver por repo nunca escapa de assessment/repos/<id>/", () => {
    for (const c of FOUNDATION_CONTRACTS.filter((x) => x.scope === "repo")) {
      expect(resolveArtifactPath(c, "r1").startsWith("assessment/repos/r1/")).toBe(true);
    }
  });
});
