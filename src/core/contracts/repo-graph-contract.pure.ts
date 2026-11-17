/**
 * repo-graph-contract.pure.ts
 *
 * A metade pura de `repo-graph-contract.ts` — zero `fs`/`path`, seguro para
 * bundle de webview (browser). Tipos, parsing e algoritmos de grafo vivem
 * aqui; `loadRepoGraph` (que toca disco) fica no arquivo original, que
 * re-exporta este módulo por inteiro para não quebrar nenhum consumidor
 * existente.
 */

import { loadStateYaml } from "./state-yaml.shared.pure";
import type { ReposInventory } from "./repos-contract.pure";
import { isValidRepoId } from "./repos-contract.pure";

export const REPO_GRAPH_PATH = [".github", "artifacts", "assessment", "repo-graph.yaml"] as const;
export const REPO_GRAPH_REL = REPO_GRAPH_PATH.join("/");

/**
 * Natureza do acoplamento, do mais explícito ao mais traiçoeiro:
 *
 * - `lib`      — dependência de artefato interno (pom.xml, package.json). Explícita.
 * - `http`     — chamada de API entre serviços. Visível em URLs/clients e OpenAPI.
 * - `event`    — tópico/fila publicado por um e consumido por outro. Assíncrono.
 * - `db`       — dois repos lendo a mesma tabela. **O pior**: invisível no código,
 *                acopla deploy e impede o schema de evoluir.
 * - `contract` — DTO/schema duplicado entre repos.
 */
export type EdgeKind = "lib" | "http" | "event" | "db" | "contract";

/** `high` = declarado (manifesto/contrato). `medium`/`low` = inferido de string. */
export type EdgeConfidence = "high" | "medium" | "low";

export interface RepoEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Onde isso foi visto — `arquivo:linha` ou o trecho do manifesto. Sem evidência a aresta não vale. */
  evidence: string;
  confidence: EdgeConfidence;
}

export interface RepoGraph {
  version: number;
  edges: RepoEdge[];
}

const EDGE_KINDS: EdgeKind[] = ["lib", "http", "event", "db", "contract"];

function toKind(raw: unknown): EdgeKind | null {
  const v = String(raw ?? "").trim() as EdgeKind;
  return EDGE_KINDS.includes(v) ? v : null;
}

function toConfidence(raw: unknown): EdgeConfidence {
  switch (String(raw ?? "").trim()) {
    case "high": return "high";
    case "low":  return "low";
    default:     return "medium";
  }
}

/**
 * Parseia o grafo. Uma aresta sem `evidence` é descartada: sem ela ninguém
 * consegue verificar o acoplamento, e um grafo de achismos é pior que nenhum —
 * decisões de modernização seriam tomadas em cima dele.
 */
export function parseRepoGraph(raw: string): { graph: RepoGraph; errors: string[] } {
  const errors: string[] = [];
  const empty: RepoGraph = { version: 1, edges: [] };

  let doc: unknown;
  try {
    doc = loadStateYaml(raw);
  } catch (err) {
    return { graph: empty, errors: [`YAML inválido: ${(err as Error).message}`] };
  }

  if (!doc || typeof doc !== "object") return { graph: empty, errors };
  const root = doc as { version?: unknown; edges?: unknown };
  if (!Array.isArray(root.edges)) return { graph: empty, errors };

  const edges: RepoEdge[] = [];
  for (const [i, item] of root.edges.entries()) {
    if (!item || typeof item !== "object") { errors.push(`edges[${i}]: não é um objeto`); continue; }
    const e = item as Record<string, unknown>;

    const from = typeof e.from === "string" ? e.from.trim() : "";
    const to = typeof e.to === "string" ? e.to.trim() : "";
    const kind = toKind(e.kind);
    const evidence = typeof e.evidence === "string" ? e.evidence.trim() : "";

    if (!from || !to) { errors.push(`edges[${i}]: 'from'/'to' ausente`); continue; }
    if (!isValidRepoId(from) || !isValidRepoId(to)) { errors.push(`edges[${i}]: id inválido (${from} → ${to})`); continue; }
    if (from === to) { errors.push(`edges[${i}]: '${from}' aponta para si mesmo — use a coupling matrix do repo`); continue; }
    if (!kind) { errors.push(`edges[${i}]: 'kind' inválido — use ${EDGE_KINDS.join(" | ")}`); continue; }
    if (!evidence) { errors.push(`edges[${i}]: '${from} → ${to}' sem 'evidence' — aresta sem prova não entra`); continue; }

    edges.push({ from, to, kind, evidence, confidence: toConfidence(e.confidence) });
  }

  return { graph: { version: typeof root.version === "number" ? root.version : 1, edges }, errors };
}

/** Arestas que saem deste repo (do que ele depende). */
export function dependenciesOf(graph: RepoGraph | null, repoId: string): RepoEdge[] {
  return (graph?.edges ?? []).filter((e) => e.from === repoId);
}

/** Arestas que chegam neste repo (quem quebra se ele mudar). */
export function dependentsOf(graph: RepoGraph | null, repoId: string): RepoEdge[] {
  return (graph?.edges ?? []).filter((e) => e.to === repoId);
}

/**
 * Ciclos entre repositórios — o achado mais caro do grafo.
 *
 * Um ciclo significa que os repos não podem ser modernizados nem deployados de
 * forma independente. Devolve cada ciclo como a lista de repos percorridos.
 */
export function findCycles(graph: RepoGraph | null): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const e of graph?.edges ?? []) {
    adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);
  }

  const cycles: string[][] = [];
  const seen = new Set<string>();

  const walk = (node: string, pathSoFar: string[], visiting: Set<string>): void => {
    if (visiting.has(node)) {
      // Normaliza o ciclo pelo menor id para não reportar o mesmo N vezes.
      const cycle = pathSoFar.slice(pathSoFar.indexOf(node));
      const pivot = cycle.indexOf([...cycle].sort()[0]!);
      const normalized = [...cycle.slice(pivot), ...cycle.slice(0, pivot)];
      const key = normalized.join(">");
      if (!seen.has(key)) { seen.add(key); cycles.push(normalized); }
      return;
    }
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) {
      walk(next, [...pathSoFar, node], visiting);
    }
    visiting.delete(node);
  };

  for (const node of adjacency.keys()) walk(node, [], new Set());
  return cycles;
}

/** Repos que ninguém depende — candidatos naturais a começar a modernização. */
export function leafRepos(graph: RepoGraph | null, inventory: ReposInventory | null): string[] {
  const hasDependents = new Set((graph?.edges ?? []).map((e) => e.to));
  return (inventory?.repos ?? []).map((r) => r.id).filter((id) => !hasDependents.has(id));
}

/** Validação cruzada: aresta apontando para repo fora do inventário. */
export function validateGraphAgainstInventory(
  graph: RepoGraph | null,
  inventory: ReposInventory | null
): string[] {
  const known = new Set((inventory?.repos ?? []).map((r) => r.id));
  const errors: string[] = [];
  for (const e of graph?.edges ?? []) {
    if (!known.has(e.from)) errors.push(`aresta '${e.from} → ${e.to}': '${e.from}' não existe em repos.yaml`);
    if (!known.has(e.to)) errors.push(`aresta '${e.from} → ${e.to}': '${e.to}' não existe em repos.yaml`);
  }
  return errors;
}
