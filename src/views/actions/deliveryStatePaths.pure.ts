/**
 * deliveryStatePaths.pure.ts
 *
 * Resolução de path do `delivery-state.yaml` ativo — extraída de
 * `greenfieldPhaseActions.ts` porque essa função é 100% pura (só `fs`/`path`)
 * mas vivia num arquivo que importa `vscode` no topo (usado pelas outras
 * exports do arquivo). Zero `vscode` aqui de propósito: o CLI `helyx-state`
 * (bundlado via esbuild, roda fora do host da extensão) importa deste módulo
 * — se importasse de `greenfieldPhaseActions.ts`, o bundler tentaria resolver
 * `"vscode"` e ou quebraria o build ou crasharia em runtime no ambiente do
 * agente.
 */

import * as fs from "fs";
import * as path from "path";
import { readActiveInitiativeId } from "../../data/initiatives-contract.pure";

/** Path do `delivery-state.yaml` da iniciativa ativa (ou o global, sem multi-iniciativa). */
export function getActiveDeliveryStatePath(root: string): string {
  try {
    const initYaml = path.join(root, ".github/artifacts/initiatives.yaml");
    if (!fs.existsSync(initYaml)) return path.join(root, ".github/artifacts/delivery-state.yaml");
    const raw = fs.readFileSync(initYaml, "utf-8");
    const activeId = readActiveInitiativeId(raw);
    if (!activeId) return path.join(root, ".github/artifacts/delivery-state.yaml");
    const perInit = path.join(root, `.github/artifacts/initiatives/${activeId}/delivery-state.yaml`);
    fs.mkdirSync(path.dirname(perInit), { recursive: true });
    return perInit;
  } catch {
    return path.join(root, ".github/artifacts/delivery-state.yaml");
  }
}
