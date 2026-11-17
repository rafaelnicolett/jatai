import { describe, it, expect } from "vitest";
import {
  parseContextReposYaml,
  isValidContextSlug,
  acceptedContexts,
  reposForContext,
  contextsInRepo,
  validateAgainstInventory,
  CONTEXT_REPOS_REL,
} from "../src/data/context-repos-contract";
import { parseReposYaml } from "../src/data/repos-contract";

const MULTI_REPO_MAP = `
version: 1
contexts:
  - slug: faturamento
    name: "Faturamento"
    status: accepted
    lives_in:
      - repo: billing-api
        paths: ["src/**"]
      - repo: legacy-erp
        paths: ["modules/fat/**", "shared/billing/**"]
  - slug: sinistros
    name: "Sinistros"
    status: accepted
    lives_in:
      - repo: claims-svc
  - slug: apolices
    name: "Apólices"
    status: candidate
    lives_in:
      - repo: legacy-erp
        paths: ["modules/pol/**"]
`;

describe("context-repos-contract — path canônico", () => {
  it("aponta para .github/artifacts/context-repos.yaml", () => {
    expect(CONTEXT_REPOS_REL).toBe(".github/artifacts/context-repos.yaml");
  });
});

describe("parseContextReposYaml — N:N", () => {
  it("um contexto atravessa N repos", () => {
    const { map, errors } = parseContextReposYaml(MULTI_REPO_MAP);
    expect(errors).toEqual([]);

    const fat = map.contexts.find((c) => c.slug === "faturamento")!;
    expect(fat.lives_in).toHaveLength(2);
    expect(fat.lives_in.map((l) => l.repo)).toEqual(["billing-api", "legacy-erp"]);
    expect(fat.lives_in[1]!.paths).toEqual(["modules/fat/**", "shared/billing/**"]);
  });

  it("um repo materializa N contextos", () => {
    const { map } = parseContextReposYaml(MULTI_REPO_MAP);
    expect(contextsInRepo(map, "legacy-erp").map((c) => c.slug)).toEqual(["faturamento", "apolices"]);
  });

  it("paths ausente assume o repo inteiro", () => {
    const { map } = parseContextReposYaml(MULTI_REPO_MAP);
    expect(reposForContext(map, "sinistros")[0]!.paths).toEqual(["**"]);
  });

  it("name ausente cai para o slug", () => {
    const { map } = parseContextReposYaml(`
contexts:
  - slug: sem-nome
    lives_in:
      - repo: x
`);
    expect(map.contexts[0]!.name).toBe("sem-nome");
  });
});

describe("gate humano — só accepted vira agente", () => {
  it("acceptedContexts filtra candidate e rejected", () => {
    const { map } = parseContextReposYaml(MULTI_REPO_MAP);
    expect(acceptedContexts(map).map((c) => c.slug)).toEqual(["faturamento", "sinistros"]);
  });

  it("status ausente é candidate (proposta aguarda aprovação)", () => {
    const { map } = parseContextReposYaml(`
contexts:
  - slug: novo
    lives_in:
      - repo: x
`);
    expect(map.contexts[0]!.status).toBe("candidate");
  });

  it("rejected é preservado para auditoria, mas não vira agente", () => {
    const { map } = parseContextReposYaml(`
contexts:
  - slug: descartado
    status: rejected
    lives_in:
      - repo: x
`);
    expect(map.contexts).toHaveLength(1);
    expect(acceptedContexts(map)).toHaveLength(0);
  });
});

describe("parseContextReposYaml — validação", () => {
  it("descarta contexto sem lives_in — agente não saberia onde atuar", () => {
    const { map, errors } = parseContextReposYaml(`
contexts:
  - slug: orfao
    name: "Órfão"
`);
    expect(map.contexts).toHaveLength(0);
    expect(errors[0]).toMatch(/lives_in.*vazio/);
  });

  it("descarta slug duplicado — colidiria dois agentes de domínio", () => {
    const { map, errors } = parseContextReposYaml(`
contexts:
  - slug: dup
    lives_in: [{ repo: a }]
  - slug: dup
    lives_in: [{ repo: b }]
`);
    expect(map.contexts).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicado/);
  });

  it("descarta slug fora de kebab-case", () => {
    const { map, errors } = parseContextReposYaml(`
contexts:
  - slug: Faturamento_BC
    lives_in: [{ repo: a }]
`);
    expect(map.contexts).toHaveLength(0);
    expect(errors[0]).toMatch(/kebab-case/);
  });

  it("descarta location com repo inválido", () => {
    const { map, errors } = parseContextReposYaml(`
contexts:
  - slug: ctx
    lives_in:
      - repo: Legacy_ERP
`);
    expect(map.contexts).toHaveLength(0);
    expect(errors.some((e) => /kebab-case/.test(e))).toBe(true);
  });

  it("YAML malformado não explode", () => {
    const { map, errors } = parseContextReposYaml("contexts:\n  - slug: [");
    expect(map.contexts).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("isValidContextSlug", () => {
  it.each(["faturamento", "gestao-apolices", "bc1"])("aceita %s", (s) => {
    expect(isValidContextSlug(s)).toBe(true);
  });
  it.each(["Faturamento", "gestao_apolices", "-fat", ""])("rejeita %s", (s) => {
    expect(isValidContextSlug(s)).toBe(false);
  });
});

describe("validateAgainstInventory — validação cruzada", () => {
  const inventory = parseReposYaml(`
repos:
  - id: billing-api
    source: git
    url: git@x/billing.git
  - id: legacy-erp
    source: git
    url: git@x/erp.git
  - id: claims-svc
    source: git
    url: git@x/claims.git
`).inventory;

  it("mapa coerente com o inventário não gera erro", () => {
    const { map } = parseContextReposYaml(MULTI_REPO_MAP);
    expect(validateAgainstInventory(map, inventory)).toEqual([]);
  });

  it("aponta contexto que referencia repo inexistente", () => {
    const { map } = parseContextReposYaml(`
contexts:
  - slug: fantasma
    lives_in:
      - repo: repo-que-nao-existe
`);
    const errors = validateAgainstInventory(map, inventory);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/'repo-que-nao-existe' não existe em repos.yaml/);
  });

  it("sem inventário, todo repo referenciado é desconhecido", () => {
    const { map } = parseContextReposYaml(MULTI_REPO_MAP);
    expect(validateAgainstInventory(map, null).length).toBeGreaterThan(0);
  });
});
