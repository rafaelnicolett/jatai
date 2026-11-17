import { useEffect, useState } from "react";

interface ElapsedTimeChipProps {
  /** Timestamp ISO do evento original (ex.: `agent-started`). */
  since: string;
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}min`;
}

/**
 * "rodando há Xs" — recalculado a cada segundo LOCALMENTE, nunca busca dado
 * de novo. Só é seguro porque `deriveActivity` preserva o timestamp original
 * de `agent-started` através dos updates de `agent-progress` (só a
 * `message` é sobrescrita) — ver run-events-contract.pure.ts.
 */
export function ElapsedTimeChip({ since }: ElapsedTimeChipProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>rodando há {formatElapsed(now - new Date(since).getTime())}</span>;
}
