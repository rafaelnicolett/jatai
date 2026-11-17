import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  parseReposYaml,
  isValidRepoId,
  getRepoDir,
  scannableRepos,
  REPOS_REL,
} from "../src/data/repos-contract";

describe("repos-contract — path canônico", () => {
  it("aponta para .github/artifacts/repos.yaml", () => {
    expect(REPOS_REL).toBe(".github/artifacts/repos.yaml");
  });
});

describe("parseReposYaml — happy path", () => {
  it("lê um inventário multi-repo com campos declarados e descobertos", () => {
    const { inventory, errors } = parseReposYaml(`
version: 1
repos:
  - id: billing-api
    source: git
    url: git@github.com:acme/billing-api.git
    ref: main
    pinned_sha: a3f9c21
    scan_profile: deep
    owner: time-financeiro
    stack: java-spring
    arch_current: layered-mvc
    arch_confidence: 82
  - id: legacy-erp
    source: local-path
    path: /repos/erp
    scan_profile: shallow
`);
    expect(errors).toEqual([]);
    expect(inventory.repos).toHaveLength(2);

    const billing = inventory.repos[0]!;
    expect(billing.id).toBe("billing-api");
    expect(billing.pinned_sha).toBe("a3f9c21");
    expect(billing.stack).toBe("java-spring");
    expect(billing.arch_current).toBe("layered-mvc");
    expect(billing.arch_confidence).toBe(82);

    expect(inventory.repos[1]!.source).toBe("local-path");
  });

  it("P1: one repo é multi repo com N=1 — sempre lista", () => {
    const { inventory } = parseReposYaml(`
repos:
  - id: unico
    source: git
    url: git@x/y.git
`);
    expect(Array.isArray(inventory.repos)).toBe(true);
    expect(inventory.repos).toHaveLength(1);
  });

  it("scan_profile ausente vira deep (default)", () => {
    const { inventory } = parseReposYaml(`
repos:
  - id: sem-profile
    source: git
    url: git@x/y.git
`);
    expect(inventory.repos[0]!.scan_profile).toBe("deep");
  });
});

describe("parseReposYaml — validação (entrada inválida nunca passa calada)", () => {
  it("descarta entrada sem id", () => {
    const { inventory, errors } = parseReposYaml(`
repos:
  - source: git
    url: git@x/y.git
`);
    expect(inventory.repos).toHaveLength(0);
    expect(errors[0]).toMatch(/'id' ausente/);
  });

  it("descarta id fora de kebab-case (viraria pasta e chave de artefato)", () => {
    const { inventory, errors } = parseReposYaml(`
repos:
  - id: Billing_API
    source: git
    url: git@x/y.git
`);
    expect(inventory.repos).toHaveLength(0);
    expect(errors[0]).toMatch(/kebab-case/);
  });

  it("descarta id duplicado — colidiria os artefatos dos dois repos", () => {
    const { inventory, errors } = parseReposYaml(`
repos:
  - id: dup
    source: git
    url: git@x/a.git
  - id: dup
    source: git
    url: git@x/b.git
`);
    expect(inventory.repos).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicado/);
  });

  it("exige url quando source: git", () => {
    const { inventory, errors } = parseReposYaml(`
repos:
  - id: sem-url
    source: git
`);
    expect(inventory.repos).toHaveLength(0);
    expect(errors[0]).toMatch(/exige 'url'/);
  });

  it("exige path quando source: local-path", () => {
    const { inventory, errors } = parseReposYaml(`
repos:
  - id: sem-path
    source: local-path
`);
    expect(inventory.repos).toHaveLength(0);
    expect(errors[0]).toMatch(/exige 'path'/);
  });

  it("YAML malformado não explode — reporta erro e devolve inventário vazio", () => {
    const { inventory, errors } = parseReposYaml("repos:\n  - id: x\n   source: [");
    expect(inventory.repos).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("arquivo vazio devolve inventário vazio sem erro", () => {
    expect(parseReposYaml("").inventory.repos).toHaveLength(0);
  });
});

describe("isValidRepoId", () => {
  it.each(["billing-api", "legacy-erp", "erp", "svc-1"])("aceita %s", (id) => {
    expect(isValidRepoId(id)).toBe(true);
  });

  it.each(["Billing", "billing_api", "-billing", "billing-", "billing--api", ""])(
    "rejeita %s",
    (id) => {
      expect(isValidRepoId(id)).toBe(false);
    }
  );
});

describe("getRepoDir", () => {
  const ws = path.join("/tmp", "ws");

  it("repo git é materializado em repos/<id>/", () => {
    const dir = getRepoDir(ws, { id: "billing-api", source: "git", url: "git@x/y.git", scan_profile: "deep" });
    expect(dir).toBe(path.join(ws, "repos", "billing-api"));
  });

  it("local-path absoluto é respeitado (não move o repo do cliente)", () => {
    const dir = getRepoDir(ws, { id: "erp", source: "local-path", path: "/opt/erp", scan_profile: "deep" });
    expect(dir).toBe("/opt/erp");
  });

  it("local-path relativo resolve a partir do workspace", () => {
    const dir = getRepoDir(ws, { id: "erp", source: "local-path", path: "../erp", scan_profile: "deep" });
    expect(dir).toBe(path.join(ws, "../erp"));
  });
});

describe("scannableRepos", () => {
  it("exclui repos com scan_profile: ignore", () => {
    const { inventory } = parseReposYaml(`
repos:
  - id: a
    source: git
    url: git@x/a.git
    scan_profile: deep
  - id: b
    source: git
    url: git@x/b.git
    scan_profile: ignore
  - id: c
    source: git
    url: git@x/c.git
    scan_profile: shallow
`);
    expect(scannableRepos(inventory).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("inventário nulo devolve lista vazia", () => {
    expect(scannableRepos(null)).toEqual([]);
  });
});
