/**
 * formatRelativeTime.ts
 *
 * Extraído de `NotificationCenter.tsx` por causa do `react-refresh/only-export-
 * components` — um arquivo de componente só pode exportar componentes (ver o
 * mesmo problema em `ProgressRail/computeRailSegments.ts`, Onda 0).
 */

/** `now` é injetável pra ficar testável sem depender do relógio real. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const diffMin = Math.floor((now - then) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;

  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD} d`;

  return new Date(iso).toLocaleDateString("pt-BR");
}
