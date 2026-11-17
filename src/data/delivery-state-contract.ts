/**
 * delivery-state-contract.ts
 *
 * Lado impuro (fs) de `delivery-state-contract.pure.ts` — re-exportado por
 * inteiro abaixo. `loadDeliveryState` funde o `delivery-state.yaml` global
 * com o da iniciativa ativa (quando existe), com fallback para uma síntese
 * a partir de `current_phase` quando nenhum arquivo existe ainda.
 */

import * as fs from "fs";
import * as path from "path";
import {
  DELIVERY_STATE_GLOBAL_PATH,
  initiativeDeliveryStatePath,
  parseDeliveryState,
  mergeDeliveryStates,
  type DeliveryState,
} from "./delivery-state-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./delivery-state-contract.pure";

function readAndParse(filePath: string, source: string, onError?: OnDataIssue): { state: DeliveryState | null; mtimeMs: number } | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    const state = parseDeliveryState(fs.readFileSync(filePath, "utf-8"));
    if (state === null) {
      onError?.({ source, message: `${filePath}: não foi possível recuperar nenhum dado do arquivo` });
    }
    return { state, mtimeMs: stat.mtimeMs };
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao ler ${filePath}:`, err);
    onError?.({ source, message: `falha ao ler ${filePath}: ${(err as Error).message}` });
    return null;
  }
}

/**
 * Lê o `delivery-state.yaml` — global e (quando há iniciativa ativa) o da
 * iniciativa, fundidos por mtime. `null` = nem um nem outro existe ainda
 * (o chamador decide se sintetiza a partir de `current_phase`).
 */
export function loadDeliveryState(workspaceRoot: string, activeInitiativeId: string | undefined, onError?: OnDataIssue): DeliveryState | null {
  const globalPath = path.join(workspaceRoot, ...DELIVERY_STATE_GLOBAL_PATH);
  const global = readAndParse(globalPath, "delivery-state", onError);

  if (!activeInitiativeId) return global?.state ?? null;

  const perInitPath = path.join(workspaceRoot, ...initiativeDeliveryStatePath(activeInitiativeId));
  const perInit = readAndParse(perInitPath, "delivery-state", onError);

  if (!global && !perInit) return null;
  return mergeDeliveryStates(
    global?.state ?? null,
    perInit?.state ?? null,
    global?.mtimeMs ?? 0,
    perInit?.mtimeMs ?? 0
  );
}
