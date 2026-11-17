/**
 * repo-graph-contract.ts
 *
 * Grafo de dependências **entre** repositórios (`repo-graph.yaml`).
 *
 * Com N repositórios, o mais valioso não é o assessment isolado de cada um — é
 * como eles se conectam. Esse acoplamento é justamente o que ninguém documentou
 * e o que decide se dá para modernizar um repo sem mexer nos outros.
 *
 * **Não precisa de AST nem de grafo de símbolos.** Os sinais são declarativos e
 * textuais — manifestos, URLs, nomes de tópico, nomes de tabela — e o
 * `@dependency-mapper` os lê com o mesmo ferramental dos outros sub-agentes.
 *
 * ⚠️ Não confundir com:
 *   - `arch-discovery.md` → coupling matrix **dentro** de um repositório
 *   - `context-map.md`    → Context Map do DDD (relações entre **contextos**)
 *   - `context-repos.yaml`→ onde cada contexto **vive** (contexto ↔ repo)
 * Este arquivo responde: **quem depende de quem, entre repositórios**.
 *
 * Tipos, parsing e algoritmos de grafo puros vivem em
 * `repo-graph-contract.pure.ts` (zero `fs`/`path`, seguro para o bundle do
 * webview) e são re-exportados abaixo por inteiro — todo consumidor existente
 * continua importando deste arquivo sem nenhuma mudança.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_GRAPH_PATH, REPO_GRAPH_REL, parseRepoGraph, type RepoGraph } from "./repo-graph-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./repo-graph-contract.pure";

export function loadRepoGraph(workspaceRoot: string, onError?: OnDataIssue): RepoGraph | null {
  const filePath = path.join(workspaceRoot, ...REPO_GRAPH_PATH);
  if (!fs.existsSync(filePath)) return null;
  try {
    const { graph, errors } = parseRepoGraph(fs.readFileSync(filePath, "utf-8"));
    if (errors.length > 0) {
      console.error(`[${BRAND.name}] ${REPO_GRAPH_REL}:\n  - ${errors.join("\n  - ")}`);
      onError?.({ source: "repo-graph", message: `${REPO_GRAPH_REL}: ${errors.join("; ")}` });
    }
    return graph;
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao ler ${REPO_GRAPH_REL}:`, err);
    onError?.({ source: "repo-graph", message: `falha ao ler ${REPO_GRAPH_REL}: ${(err as Error).message}` });
    return null;
  }
}
