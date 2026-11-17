import { Radio } from "lucide-react";
import type { RunEvent, LiveActivity } from "@data";
import { recentEventsForRepo, describeEvent } from "@data";
import s from "./RepoEventsLog.module.css";

interface RepoEventsLogProps {
  repoId: string;
  allEvents: RunEvent[];
  liveActivity: LiveActivity | null;
}

const TONE_BY_EVENT_TYPE: Record<string, string> = {
  "agent-started": "info",
  "agent-progress": "info",
  "agent-done": "warning",
  "gate-approved": "success",
  "artifact-written": "accent",
  blocked: "danger",
};

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Painel de saída ao vivo — um log estilo terminal, sempre visível ao lado
 * do plano de fases (não mais escondido embaixo, atrás de um collapse).
 * Aproveita a largura que sobrava na tela e deixa "o que está acontecendo"
 * folheável sem precisar abrir nada. Escopado ao repositório selecionado,
 * mais recente primeiro.
 */
export function RepoEventsLog({ repoId, allEvents, liveActivity }: RepoEventsLogProps) {
  const events = repoId === "workspace"
    ? allEvents.filter((e) => !e.repo_id).slice(-30).reverse()
    : recentEventsForRepo(allEvents, repoId, 30);
  const isLive = !!liveActivity?.runningByKey.some((e) => (e.repo_id ?? "workspace") === repoId);

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <Radio size={13} strokeWidth={2} />
        <span>Eventos recentes</span>
        {isLive && <span className={`${s.liveDot} hx-pulse`} aria-label="ao vivo" />}
      </div>
      <div className={s.body}>
        {events.length === 0 ? (
          <p className={s.empty}>Nenhum evento registrado para este repositório ainda.</p>
        ) : (
          <ul className={s.log}>
            {events.map((e, i) => (
              <li key={`${e.timestamp}-${i}`} className={s.line}>
                <span className={s.time}>{shortTime(e.timestamp)}</span>
                <span className={s.dot} data-tone={TONE_BY_EVENT_TYPE[e.event_type] ?? "neutral"} />
                <span className={s.text}>{describeEvent(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
