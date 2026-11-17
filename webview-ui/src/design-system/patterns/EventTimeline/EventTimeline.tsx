import type { RunEvent } from "@shared/cockpit-protocol";
import { describeEvent } from "@data";
import s from "./EventTimeline.module.css";

interface EventTimelineProps {
  events: RunEvent[];
  emptyLabel?: string;
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Linha do tempo de eventos brutos — mesmo componente para o "recente" da
 * Gaveta de Repositório (Fase 2) e o histórico do Analítico (Fase 3), só
 * alimentado por janelas diferentes de `RunEvent[]`.
 */
export function EventTimeline({ events, emptyLabel = "Sem eventos ainda." }: EventTimelineProps) {
  if (events.length === 0) return <p className={s.empty}>{emptyLabel}</p>;
  return (
    <ul className={s.list}>
      {events.map((e, i) => (
        <li key={`${e.timestamp}-${i}`} className={s.row}>
          <span className={s.time}>{shortTime(e.timestamp)}</span>
          <span className={s.text}>{describeEvent(e)}</span>
        </li>
      ))}
    </ul>
  );
}
