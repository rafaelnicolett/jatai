/**
 * initiatives-contract.ts
 *
 * Registro multi-iniciativa (`initiatives.yaml`) — lado que toca disco.
 * Tipos, parsing e queries puras vivem em `initiatives-contract.pure.ts` (zero
 * `fs`/`path`, seguro para o bundle do webview) e são re-exportados abaixo por
 * inteiro.
 */

import * as fs from "fs";
import * as path from "path";
import { INITIATIVES_PATH, INITIATIVES_REL, parseInitiativesYaml, type InitiativesState } from "./initiatives-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./initiatives-contract.pure";

/** Lê o registro. `null` = ainda não há nenhuma iniciativa criada. */
export function loadInitiatives(workspaceRoot: string, onError?: OnDataIssue): InitiativesState | null {
  const filePath = path.join(workspaceRoot, ...INITIATIVES_PATH);
  if (!fs.existsSync(filePath)) return null;
  try {
    const { state, errors } = parseInitiativesYaml(fs.readFileSync(filePath, "utf-8"));
    if (errors.length > 0) {
      console.error(`[${BRAND.name}] ${INITIATIVES_REL}:\n  - ${errors.join("\n  - ")}`);
      onError?.({ source: "initiatives", message: `${INITIATIVES_REL}: ${errors.join("; ")}` });
    }
    return state;
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao ler ${INITIATIVES_REL}:`, err);
    onError?.({ source: "initiatives", message: `falha ao ler ${INITIATIVES_REL}: ${(err as Error).message}` });
    return null;
  }
}
