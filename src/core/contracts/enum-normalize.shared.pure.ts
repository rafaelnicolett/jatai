/**
 * enum-normalize.shared.pure.ts
 *
 * Normalização genérica de string bruta → union tipado, com fallback.
 *
 * Extraído da família `toXStatus`/`toStatus` que reimplementava de forma
 * independente o mesmo padrão `switch (String(raw ?? "").trim()) { case ...:
 * return ...; default: return <fallback> }` (uma variante usava `Set` em vez
 * de `switch`) em `foundation-state-contract.pure.ts`,
 * `delivery-state-contract.pure.ts`, `context-repos-contract.pure.ts`,
 * `initiatives-contract.pure.ts` e `sprint-backlog-contract.pure.ts` (D17,
 * `tech-debt.md`). Cada domínio normaliza para um enum PRÓPRIO — este helper
 * só generaliza o mecanismo, não os valores nem os fallbacks, que continuam
 * declarados em cada arquivo chamador.
 *
 * Zero `fs`/`path` — seguro para bundle de webview, como todo `*.pure.ts` de
 * `src/data/`.
 */

/**
 * Normaliza `raw` (trim + string coercion) contra a lista de valores válidos.
 * Fora da lista (incluindo `undefined`/`null`/tipo errado) devolve `fallback`
 * — nunca lança.
 */
export function normalizeEnum<T extends string>(raw: unknown, valid: readonly T[], fallback: T): T {
  const s = String(raw ?? "").trim();
  return (valid as readonly string[]).includes(s) ? (s as T) : fallback;
}
