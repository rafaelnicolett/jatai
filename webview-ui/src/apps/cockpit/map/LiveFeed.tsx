import type { ColmeiaFeedItem, ColmeiaGuard } from "@data";
import { StatusGlyph } from "../../../design-system/primitives";
import { feedLines } from "./feedLines";
import { useNow } from "./useNow";
import s from "./Hud.module.css";

/**
 * "Na colmeia agora" (DS v2 §4.8): as últimas linhas da atividade, só
 * metadados. O feed é um `log`, mas não anuncia por conta própria
 * (`aria-live="off"`): o que o leitor de tela ouve vem do anunciador, agrupado
 * e a cada 5 s no mínimo, para não haver anúncio a cada tique.
 */
export function LiveFeed({ feed, guards, limit, title = "Na colmeia agora", paused = false }: { feed: readonly ColmeiaFeedItem[]; guards: readonly ColmeiaGuard[]; limit: number; title?: string; paused?: boolean }) {
  const now = useNow();
  // "Aguarda aprovação" só vale para o fim de trabalho que tem uma guarda acesa: a da tarefa, ou a do agente.
  const awaiting = (item: ColmeiaFeedItem): boolean => guards.some((g) => (item.taskId ? g.taskId === item.taskId : !!item.agentId && g.reason.includes(item.agentId)));
  const lines = feedLines(feed, now, limit, awaiting);
  return (
    <section className={s.feed} aria-label={title} data-feed>
      <span className={s.eyebrow}>{title}</span>
      {lines.length === 0 ? (
        <p className={s.quiet}>Nenhuma atividade ainda.</p>
      ) : (
        <ol className={s.feedList} role="log" aria-live="off" aria-relevant="additions" aria-label={`${title}${paused ? ", pausado" : ""}`}>
          {lines.map((line) => (
            <li key={line.key} className={s.feedLine} data-feed-line data-status={line.status}>
              <time className={s.when}>{line.when}</time>
              <span className={s.what}>
                <span className={s.glyph} data-tone={line.status}>
                  <StatusGlyph status={line.status} size={12} color="inherit" />
                </span>
                {line.who && (
                  <>
                    <b className={s.who} data-tone={line.status}>{line.who}</b>{" "}
                  </>
                )}
                {line.rest}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
