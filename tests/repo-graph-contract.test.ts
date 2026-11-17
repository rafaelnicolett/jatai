import { describe, it, expect } from "vitest";
import {
  parseRepoGraph,
  dependenciesOf,
  dependentsOf,
  findCycles,
  leafRepos,
  validateGraphAgainstInventory,
  REPO_GRAPH_REL,
} from "../src/data/repo-graph-contract";
import { parseReposYaml } from "../src/data/repos-contract";

const GRAPH = parseRepoGraph(`
version: 1
edges:
  - from: billing-api
    to: claims-svc
    kind: http
    evidence: "src/ClaimClient.java:42 → POST \${CLAIMS_URL}/claims"
    confidence: high
  - from: billing-api
    to: legacy-erp
    kind: lib
    evidence: "pom.xml → br.acme:erp-commons:2.1"
    confidence: high
  - from: legacy-erp
    to: billing-api
    kind: event
    evidence: "publica 'pagamento.confirmado'; billing-api consome em KafkaConfig.java:18"
    confidence: medium
`).graph;

const INVENTORY = parseReposYaml(`
repos:
  - id: billing-api
    source: git
    url: git@x/b.git
  - id: claims-svc
    source: git
    url: git@x/c.git
  - id: legacy-erp
    source: git
    url: git@x/e.git
`).inventory;

describe("path canônico", () => {
  it("mora em assessment/repo-graph.yaml", () => {
    expect(REPO_GRAPH_REL).toBe(".github/artifacts/assessment/repo-graph.yaml");
  });
});

describe("parseRepoGraph — os 5 tipos de acoplamento", () => {
  it("lê as arestas com tipo, evidência e confiança", () => {
    expect(GRAPH.edges).toHaveLength(3);
    const http = GRAPH.edges[0]!;
    expect(http).toMatchObject({ from: "billing-api", to: "claims-svc", kind: "http", confidence: "high" });
    expect(http.evidence).toContain("ClaimClient.java:42");
  });

  it.each(["lib", "http", "event", "db", "contract"])("aceita kind: %s", (kind) => {
    const { graph, errors } = parseRepoGraph(`
edges:
  - from: a
    to: b
    kind: ${kind}
    evidence: "x"
`);
    expect(errors).toEqual([]);
    expect(graph.edges[0]!.kind).toBe(kind);
  });

  it("confidence ausente vira medium (inferido, não declarado)", () => {
    const { graph } = parseRepoGraph(`
edges:
  - from: a
    to: b
    kind: http
    evidence: "x"
`);
    expect(graph.edges[0]!.confidence).toBe("medium");
  });
});

describe("validação — grafo de achismo é pior que grafo nenhum", () => {
  it("descarta aresta sem evidência (ninguém poderia verificar)", () => {
    const { graph, errors } = parseRepoGraph(`
edges:
  - from: a
    to: b
    kind: http
`);
    expect(graph.edges).toHaveLength(0);
    expect(errors[0]).toMatch(/sem 'evidence'/);
  });

  it("descarta kind desconhecido", () => {
    const { graph, errors } = parseRepoGraph(`
edges:
  - from: a
    to: b
    kind: telepatia
    evidence: "x"
`);
    expect(graph.edges).toHaveLength(0);
    expect(errors[0]).toMatch(/'kind' inválido/);
  });

  it("descarta self-loop — isso é coupling matrix do repo, não grafo inter-repo", () => {
    const { graph, errors } = parseRepoGraph(`
edges:
  - from: a
    to: a
    kind: lib
    evidence: "x"
`);
    expect(graph.edges).toHaveLength(0);
    expect(errors[0]).toMatch(/aponta para si mesmo/);
  });

  it("descarta id fora de kebab-case", () => {
    const { graph, errors } = parseRepoGraph(`
edges:
  - from: Billing_API
    to: b
    kind: lib
    evidence: "x"
`);
    expect(graph.edges).toHaveLength(0);
    expect(errors[0]).toMatch(/id inválido/);
  });

  it("YAML malformado não explode", () => {
    const { graph, errors } = parseRepoGraph("edges:\n  - from: [");
    expect(graph.edges).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("consultas — o que o Planning precisa saber", () => {
  it("dependenciesOf: do que este repo depende", () => {
    expect(dependenciesOf(GRAPH, "billing-api").map((e) => e.to)).toEqual(["claims-svc", "legacy-erp"]);
  });

  it("dependentsOf: quem quebra se este repo mudar", () => {
    expect(dependentsOf(GRAPH, "billing-api").map((e) => e.from)).toEqual(["legacy-erp"]);
  });

  it("leafRepos: neste grafo ninguém é seguro de mexer — todos têm dependentes", () => {
    // billing-api → claims-svc, billing-api → legacy-erp, legacy-erp → billing-api
    // Os três aparecem como `to`, logo mudar qualquer um quebra alguém.
    expect(leafRepos(GRAPH, INVENTORY)).toEqual([]);
  });

  it("leafRepos: repo que ninguém depende pode ser modernizado sem quebrar terceiros", () => {
    const { graph } = parseRepoGraph(`
edges:
  - from: app
    to: core
    kind: lib
    evidence: "pom.xml"
`);
    const inv = parseReposYaml(`
repos:
  - id: app
    source: git
    url: git@x/a.git
  - id: core
    source: git
    url: git@x/c.git
`).inventory;
    // `app` depende de `core`, mas ninguém depende de `app` → é por onde começar.
    expect(leafRepos(graph, inv)).toEqual(["app"]);
  });
});

describe("findCycles — o achado mais caro do grafo", () => {
  it("detecta o ciclo billing-api ↔ legacy-erp", () => {
    const cycles = findCycles(GRAPH);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(["billing-api", "legacy-erp"]);
  });

  it("grafo acíclico não reporta ciclo", () => {
    const { graph } = parseRepoGraph(`
edges:
  - from: a
    to: b
    kind: lib
    evidence: "x"
  - from: b
    to: c
    kind: lib
    evidence: "x"
`);
    expect(findCycles(graph)).toEqual([]);
  });

  it("não reporta o mesmo ciclo duas vezes (normaliza a rotação)", () => {
    const { graph } = parseRepoGraph(`
edges:
  - from: a
    to: b
    kind: lib
    evidence: "x"
  - from: b
    to: c
    kind: lib
    evidence: "x"
  - from: c
    to: a
    kind: lib
    evidence: "x"
`);
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(["a", "b", "c"]);
  });

  it("grafo vazio não quebra", () => {
    expect(findCycles(null)).toEqual([]);
  });
});

describe("validação cruzada com o inventário", () => {
  it("grafo coerente não gera erro", () => {
    expect(validateGraphAgainstInventory(GRAPH, INVENTORY)).toEqual([]);
  });

  it("aponta aresta para repo fora do inventário", () => {
    const { graph } = parseRepoGraph(`
edges:
  - from: billing-api
    to: fantasma
    kind: http
    evidence: "x"
`);
    const errors = validateGraphAgainstInventory(graph, INVENTORY);
    expect(errors[0]).toMatch(/'fantasma' não existe em repos.yaml/);
  });
});
