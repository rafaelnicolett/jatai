/**
 * sprint-backlog-contract.ts
 *
 * Lado impuro (fs) de `sprint-backlog-contract.pure.ts` — re-exportado por
 * inteiro abaixo. Sem merge (diferente de delivery-state): só fallback por
 * existência — caminho da iniciativa, senão o `sprint-backlog.yaml` da raiz
 * do workspace.
 */

import * as fs from "fs";
import * as path from "path";
import { parseSprintBacklog, type SprintBacklog } from "./sprint-backlog-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./sprint-backlog-contract.pure";

const WORKSPACE_ROOT_PATH = [".github", "artifacts", "sprint-backlog.yaml"];

function initiativeSprintBacklogPath(initiativeId: string): string[] {
  return [".github", "artifacts", "initiatives", initiativeId, "sprint-backlog.yaml"];
}

export function loadSprintBacklog(workspaceRoot: string, activeInitiativeId: string | undefined, onError?: OnDataIssue): SprintBacklog | null {
  const candidates = activeInitiativeId
    ? [path.join(workspaceRoot, ...initiativeSprintBacklogPath(activeInitiativeId)), path.join(workspaceRoot, ...WORKSPACE_ROOT_PATH)]
    : [path.join(workspaceRoot, ...WORKSPACE_ROOT_PATH)];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const backlog = parseSprintBacklog(fs.readFileSync(filePath, "utf-8"));
      if (backlog === null) {
        onError?.({ source: "sprint-backlog", message: `${filePath}: não foi possível recuperar nenhum dado do arquivo` });
      }
      return backlog;
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao ler ${filePath}:`, err);
      onError?.({ source: "sprint-backlog", message: `falha ao ler ${filePath}: ${(err as Error).message}` });
      return null;
    }
  }
  return null;
}
