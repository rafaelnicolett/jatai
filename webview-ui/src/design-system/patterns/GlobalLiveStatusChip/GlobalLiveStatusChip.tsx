import { useEffect, useState } from "react";
import type { LiveActivity } from "@shared/cockpit-protocol";
import s from "./GlobalLiveStatusChip.module.css";

interface GlobalLiveStatusChipProps {
  status: "booting" | "ready";
  generatedAt: string | null;
  liveActivity: LiveActivity | null;
}

/** Acima de quantos segundos sem snapshot novo o dado passa a ser tratado como obsoleto. */
const STALE_AFTER_SECONDS = 12; // ~3x o intervalo de polling do host (4s)

/**
 * A resposta direta à pergunta de confiança do operador: "essa tela está
 * viva, e tem algo rodando agora?" — visível de qualquer aba. O tick de 1s é
 * só de exibição (nunca busca dado de novo) — é a diretriz "nunca mostrar
 * estado obsoleto sem avisar" aplicada de verdade: se o host parar de mandar
 * snapshot, o rótulo escala pra um aviso em vez de continuar parado.
 */
export function GlobalLiveStatusChip({ status, generatedAt, liveActivity }: GlobalLiveStatusChipProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (status === "booting") {
    return (
      <div className={s.chip} data-tone="idle">
        <span className={s.dot} data-tone="idle" />
        conectando…
      </div>
    );
  }

  const secondsSince = generatedAt ? Math.max(0, Math.round((now - new Date(generatedAt).getTime()) / 1000)) : null;
  const isStale = secondsSince !== null && secondsSince > STALE_AFTER_SECONDS;
  const runningCount = liveActivity?.runningByKey.length ?? 0;

  const tone = isStale ? "stale" : runningCount > 0 ? "live" : "idle";
  const label = isStale
    ? `sem atualização há ${secondsSince}s`
    : runningCount > 0
      ? `${runningCount} agente${runningCount > 1 ? "s" : ""} rodando`
      : "em dia";

  return (
    <div className={s.chip} data-tone={tone} title={generatedAt ? `Atualizado em ${new Date(generatedAt).toLocaleTimeString()}` : undefined}>
      <span className={s.dot} data-tone={tone} />
      {label}
    </div>
  );
}
