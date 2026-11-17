import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadRepos } from "../src/data/repos-contract";
import { loadFoundationState } from "../src/data/foundation-state-contract";
import { loadContextRepos } from "../src/data/context-repos-contract";
import { loadRepoGraph } from "../src/data/repo-graph-contract";
import { loadRunEvents } from "../src/data/run-events-contract";
import { loadInitiatives } from "../src/data/initiatives-contract";
import type { DataSourceIssue } from "../src/data/data-health";

/**
 * `onError` é o canal que faltava para o dashboard nunca mostrar estado
 * degradado como se fosse íntegro (hoje só vai pro `console.error`, invisível
 * na tela). Cobre o par de casos que importa: dispara para arquivo malformado,
 * NÃO dispara para arquivo simplesmente ausente ("ainda não começou" não é
 * degradado).
 */

const tmpWorkspace = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-data-health-"));
const write = (root: string, rel: string, content: string): void => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
};

describe("loadRepos — onError", () => {
  it("não dispara quando repos.yaml simplesmente não existe", () => {
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadRepos(tmpWorkspace(), onError)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispara com {source, message} quando uma entrada é inválida", () => {
    const root = tmpWorkspace();
    write(root, ".github/artifacts/repos.yaml", "version: 1\nrepos:\n  - source: git\n");
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    loadRepos(root, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe("repos");
    expect(onError.mock.calls[0]![0]!.message).toContain("repos.yaml");
  });
});

describe("loadFoundationState — onError", () => {
  it("não dispara quando o tracker não existe", () => {
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadFoundationState(tmpWorkspace(), onError)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispara quando o arquivo existe mas não dá para recuperar nenhum dado", () => {
    const root = tmpWorkspace();
    write(root, ".github/artifacts/assessment/foundation-state.yaml", ":\n  :\n    [[[");
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadFoundationState(root, onError)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe("foundation-state");
  });
});

describe("loadContextRepos — onError", () => {
  it("não dispara quando o mapa não existe", () => {
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadContextRepos(tmpWorkspace(), onError)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispara quando um contexto não tem lives_in", () => {
    const root = tmpWorkspace();
    write(root, ".github/artifacts/context-repos.yaml", "version: 1\ncontexts:\n  - slug: billing\n    name: Billing\n    lives_in: []\n");
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    loadContextRepos(root, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe("context-repos");
  });
});

describe("loadInitiatives — onError", () => {
  it("não dispara quando o registro não existe", () => {
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadInitiatives(tmpWorkspace(), onError)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispara quando uma iniciativa não tem id", () => {
    const root = tmpWorkspace();
    write(root, ".github/artifacts/initiatives.yaml", "initiatives:\n  - name: Sem Id\n    status: planned\n");
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    loadInitiatives(root, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe("initiatives");
  });
});

describe("loadRepoGraph — onError", () => {
  it("não dispara quando o grafo não existe", () => {
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadRepoGraph(tmpWorkspace(), onError)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispara quando uma aresta não tem evidence", () => {
    const root = tmpWorkspace();
    write(root, ".github/artifacts/assessment/repo-graph.yaml", "version: 1\nedges:\n  - from: a\n    to: b\n    kind: lib\n");
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    loadRepoGraph(root, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe("repo-graph");
  });
});

describe("loadRunEvents — onError", () => {
  it("não dispara quando a pasta runs/ não existe", () => {
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadRunEvents(tmpWorkspace(), 200, onError)).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("uma linha JSONL malformada não dispara onError — degradação tolerante, não é erro", () => {
    const root = tmpWorkspace();
    write(root, ".github/artifacts/runs/r1.jsonl", 'não é json\n{"event_type":"agent-started","timestamp":"2026-01-01T10:00:00Z"}\n');
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    const events = loadRunEvents(root, 200, onError);
    expect(events).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispara quando runs/ existe como arquivo, não pasta (falha real de leitura)", () => {
    const root = tmpWorkspace();
    fs.mkdirSync(path.join(root, ".github", "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github", "artifacts", "runs"), "não é uma pasta");
    const onError = vi.fn<(issue: DataSourceIssue) => void>();
    expect(loadRunEvents(root, 200, onError)).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe("run-events");
  });
});
