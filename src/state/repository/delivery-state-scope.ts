/**
 * delivery-state-scope.ts
 *
 * Resolve o path de `delivery-state.yaml` (global ou por iniciativa) a
 * partir de `--global`/`--initiative <id>` — extraído de
 * `commands/delivery-state.ts` (`resolveStatePath`) pra ser reusado também
 * pelos endpoints de escrita de `StateServiceServer` (roadmap
 * `mod-state-service`, item 3.1): mesma regra de resolução de escopo, sem
 * `process.exit` embutido (retorna um resultado puro — quem chama decide o
 * que fazer com o erro: o CLI chama `printUsageError`, o servidor devolve
 * 400).
 */
import type { StateRepository } from "./StateRepository";
import { validatePathSegmentId, type FieldError } from "../../core/validation/validation";

export type DeliveryStateScopeRepository = Pick<StateRepository, "globalDeliveryStatePath" | "initiativeDeliveryStatePath">;

export type DeliveryStateScopeResult = { ok: true; path: string } | { ok: false; error: FieldError };

/** `isGlobal` é `unknown` de propósito — vem direto de `parseArgs`/corpo JSON, sem type narrowing prévio; só `=== true` conta como "--global". */
export function resolveDeliveryStateScope(
  repository: DeliveryStateScopeRepository,
  root: string,
  isGlobal: unknown,
  initiativeId: string | undefined
): DeliveryStateScopeResult {
  if (isGlobal === true) return { ok: true, path: repository.globalDeliveryStatePath(root) };
  if (initiativeId) {
    // O id vira nome de pasta: `../` não pode escapar da raiz (A20 / H-BUG-64)
    const id = validatePathSegmentId("initiative", initiativeId);
    if (!id.ok) return id;
    return { ok: true, path: repository.initiativeDeliveryStatePath(root, id.value) };
  }
  return { ok: false, error: { code: "MISSING_SCOPE", message: "informe --global ou --initiative <id>" } };
}
