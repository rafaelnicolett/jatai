/**
 * context-repos-contract.ts
 *
 * Mapa **bounded context ↔ repositório** (`context-repos.yaml`).
 *
 * O domínio não respeita a fronteira de repositório: `Faturamento` pode viver em
 * `billing-api/src/**` **e** em `legacy-erp/modules/fat/**`, e `legacy-erp`
 * sozinho pode conter 4 contextos. A relação é **N:N** — é isso que permite o
 * modelo de domínio não ficar refém do layout físico dos repos.
 *
 * ⚠️ Não confundir com `assessment/domain/context-map.md`, que é o **Context Map
 * do DDD** (relações entre contextos: ACL, Shared Kernel, Conformist,
 * Partnership). Este arquivo responde a outra pergunta: *onde, fisicamente,
 * cada contexto se materializa*.
 *
 * Produtor : `@domain-extractor` (roda cross-repo — precisa ver todos os repos
 *            para descobrir que um contexto atravessa dois).
 * Consumidores:
 *   - agentes de domínio — para saber **onde** atuar (`reposForContext`)
 *   - Cockpit            — bloco "Faturamento → billing-api · legacy-erp"
 *
 * Um contexto só vale para execução depois do gate humano (`status: accepted`).
 *
 * Tipos, parsing e queries puras vivem em `context-repos-contract.pure.ts`
 * (zero `fs`/`path`, seguro para o bundle do webview) e são re-exportados
 * abaixo por inteiro — todo consumidor existente continua importando deste
 * arquivo sem nenhuma mudança.
 */

import * as fs from "fs";
import * as path from "path";
import { CONTEXT_REPOS_PATH, CONTEXT_REPOS_REL, parseContextReposYaml, type ContextReposMap } from "./context-repos-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./context-repos-contract.pure";

/** Lê o mapa. `null` = ainda não há domínio extraído. */
export function loadContextRepos(workspaceRoot: string, onError?: OnDataIssue): ContextReposMap | null {
  const filePath = path.join(workspaceRoot, ...CONTEXT_REPOS_PATH);
  if (!fs.existsSync(filePath)) return null;
  try {
    const { map, errors } = parseContextReposYaml(fs.readFileSync(filePath, "utf-8"));
    if (errors.length > 0) {
      console.error(`[${BRAND.name}] ${CONTEXT_REPOS_REL}:\n  - ${errors.join("\n  - ")}`);
      onError?.({ source: "context-repos", message: `${CONTEXT_REPOS_REL}: ${errors.join("; ")}` });
    }
    return map;
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao ler ${CONTEXT_REPOS_REL}:`, err);
    onError?.({ source: "context-repos", message: `falha ao ler ${CONTEXT_REPOS_REL}: ${(err as Error).message}` });
    return null;
  }
}
