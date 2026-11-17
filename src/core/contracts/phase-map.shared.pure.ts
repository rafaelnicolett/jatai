/**
 * phase-map.shared.pure.ts
 *
 * Algoritmo compartilhado de parsing de mapa de fases (`phases: { <id>: {...} }`)
 * — extraído de `foundation-state-contract.pure.ts` e `delivery-state-contract.pure.ts`,
 * que reimplementavam o MESMO algoritmo completo (resolução de alias de chave,
 * guarda de não-sobrescrita, normalização de `human_checklist`) de forma
 * independente (D16, `tech-debt.md`).
 *
 * Zero `fs`/`path` — seguro para bundle de webview, como todo `*.pure.ts`
 * de `src/data/`.
 */

/** Campos comuns a qualquer `*PhaseState` de domínio — a forma mínima que este módulo sabe montar sozinho. */
interface BasePhaseFields {
  human_checklist: Record<string, boolean>;
}

/**
 * Parseia um mapa de fases genérico, cuidando da parte que é idêntica em todo
 * domínio: resolve `id` bruto contra um mapa de aliases (uma chave alias nunca
 * sobrescreve uma entrada já gravada sob a chave canônica), e normaliza
 * `human_checklist` para `Record<string, boolean>`.
 *
 * O resto — `status` tipado por domínio, campos extras (`artifacts`, etc.) —
 * fica a cargo de `build`, chamado com o `id` já canonicalizado, o objeto bruto
 * da fase e o `human_checklist` já normalizado.
 */
export function parsePhaseMapWith<T extends BasePhaseFields>(
  raw: unknown,
  aliases: Record<string, string>,
  build: (canonicalId: string, raw: Record<string, unknown>, humanChecklist: Record<string, boolean>) => T
): Record<string, T> {
  const phases: Record<string, T> = {};
  if (!raw || typeof raw !== "object") return phases;

  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const p = value as Record<string, unknown>;

    const isAlias = id in aliases;
    const canonicalId = aliases[id] ?? id;
    // Alias nunca sobrescreve uma entrada já gravada sob a chave canônica.
    if (isAlias && phases[canonicalId]) continue;

    const checklist: Record<string, boolean> = {};
    if (p.human_checklist && typeof p.human_checklist === "object") {
      for (const [key, checked] of Object.entries(p.human_checklist as Record<string, unknown>)) {
        checklist[key] = checked === true;
      }
    }

    phases[canonicalId] = build(canonicalId, p, checklist);
  }
  return phases;
}
