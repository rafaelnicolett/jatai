import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../primitives/Button/Button";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { VisuallyHidden } from "../../primitives/VisuallyHidden/VisuallyHidden";
import { describeWorkStatus } from "../../status/workStatus";
import { EmptyState } from "../EmptyState/EmptyState";
import s from "./NowCard.module.css";

export interface NowAgentView {
  name: string;
  task?: string;
}

export interface NowDecisionView {
  id: string;
  title: string;
  detail: string;
  onDecide: () => void;
}

export interface NowProblemView {
  key: string;
  kind: "blocked" | "failed";
  title: string;
  reason: string;
}

interface NowCardProps {
  /** Onde a missão está: a iniciativa e o caminho (tipo › stream › parada). */
  where: { initiative: string | null; path: string[] };
  /** A iniciativa vista não é a ativa: a navegação é só visão, e "Tornar ativa" é a ação explícita. */
  viewing?: { activeName: string | null; onMakeActive: () => void; /** O registro não traz o detalhe das fases desta iniciativa: só o da ativa carrega. */ detailNotice?: string };
  activity: { count: number; agents: NowAgentView[]; lastEventText?: string; staleSeconds?: number | null; activityKey?: string };
  decisions: NowDecisionView[];
  problems: NowProblemView[];
}

/** O anúncio do título da atividade vai no máximo a cada 10 s (DS v2 §4.3): "nada de anúncio a cada tique". */
const ANNOUNCE_EVERY_MS = 10_000;

function useThrottledText(text: string, everyMs: number): string {
  const [shown, setShown] = useState(text);
  const last = useRef(0);
  useEffect(() => {
    if (text === shown) return;
    const wait = Math.max(0, last.current + everyMs - Date.now());
    const id = setTimeout(() => {
      last.current = Date.now();
      setShown(text);
    }, wait);
    return () => clearTimeout(id);
  }, [text, shown, everyMs]);
  return shown;
}

/** 34px: disco com anel Cerume e o satélite de mel. Trabalhando: 2 voltas por evento e para. Ocioso: sem satélite. */
function OrbitIndicator({ working, activityKey }: { working: boolean; activityKey?: string }) {
  return (
    <span className={s.orbit} aria-hidden="true">
      <span className={s.disc} />
      {working && (
        <span key={activityKey ?? "idle"} className={s.spin}>
          <span className={s.satellite} />
        </span>
      )}
    </span>
  );
}

function agentsText(agents: NowAgentView[]): string {
  return agents.slice(0, 2).map((a) => (a.task ? `${a.name} ${a.task}` : a.name)).join(" · ");
}

/**
 * "Agora" do DS v2 (§4.3): responde em 3 segundos onde a missão está, quem
 * trabalha e o que espera VOCÊ.
 *
 * - `<section aria-label="Agora">`; cada cartão é um `<article>` com título;
 * - a atividade é um `role="status"` que só anuncia mudança de contagem,
 *   no máximo a cada 10 s; sem snapshot novo há mais de 12 s, o eyebrow vira
 *   "⚠ Sem atualização há N s" e a órbita some;
 * - a decisão: nenhuma ("Nada espera você agora", calmo), uma (borda azul e o
 *   botão "Decidir: <título>") ou várias (a primeira em destaque e "Ver todas");
 * - o que está bloqueado ou falhou aparece com o motivo em texto, nunca só em cor.
 * Nada pulsa por pendência humana: o que se move é atividade do sistema.
 */
export function NowCard({ where, viewing, activity, decisions, problems }: NowCardProps) {
  const uid = useId();
  const [expanded, setExpanded] = useState(false);
  const stale = typeof activity.staleSeconds === "number";
  const working = activity.count > 0 && !stale;
  const title = activity.count > 0 ? `${activity.count} ${activity.count === 1 ? "agente trabalhando" : "agentes trabalhando"}` : "Nenhum agente trabalhando";
  const announced = useThrottledText(title, ANNOUNCE_EVERY_MS);
  const [first, ...rest] = decisions;

  return (
    <section className={s.now} aria-label="Agora">
      <p className={s.where}>
        {where.initiative && <span className={s.initiative}>{where.initiative}</span>}
        {where.path.map((part) => (
          <span key={part} className={s.part}>
            <span aria-hidden="true">›</span>
            <VisuallyHidden>, </VisuallyHidden>
            {part}
          </span>
        ))}
      </p>

      {viewing && (
        <div className={s.viewing} role="note">
          <span>
            Você está vendo esta iniciativa, mas {viewing.activeName ? `a ativa é ${viewing.activeName}` : "ela não é a ativa"}. Navegar não troca a ativa.
            {viewing.detailNotice && <> {viewing.detailNotice}</>}
          </span>
          <Button variant="tertiary" size="sm" onClick={viewing.onMakeActive}>
            Tornar ativa
          </Button>
        </div>
      )}

      <div className={s.grid}>
        <article className={s.card} aria-labelledby={`${uid}-activity`} data-kind="activity" data-stale={stale || undefined}>
          <OrbitIndicator working={working} activityKey={activity.activityKey} />
          <span className={s.cardBody}>
            <span className={s.eyebrow}>{stale ? `⚠ Sem atualização há ${activity.staleSeconds} s` : "Acontecendo agora"}</span>
            <span id={`${uid}-activity`} className={s.title} role="status">
              {announced}
            </span>
            <span className={s.detail}>{activity.count > 0 ? agentsText(activity.agents) : (activity.lastEventText ?? "Nenhum evento registrado ainda")}</span>
          </span>
        </article>

        {first ? (
          <article className={s.card} aria-labelledby={`${uid}-decision`} data-kind="decision">
            <span className={s.cardBody}>
              <span className={s.eyebrow} data-tone="you">
                <StatusGlyph status="you" size={10} color="inherit" /> {decisions.length > 1 ? `Espera você · ${decisions.length} decisões` : "Espera você"}
              </span>
              <span id={`${uid}-decision`} className={s.title}>
                {first.title}
              </span>
              <span className={s.detail}>{first.detail}</span>
            </span>
            <div className={s.actions}>
              <Button variant="primary" size="lg" aria-label={`Decidir: ${first.title}`} onClick={first.onDecide}>
                Decidir
              </Button>
              {rest.length > 0 && (
                <Button variant="tertiary" size="sm" aria-expanded={expanded} aria-controls={`${uid}-all`} onClick={() => setExpanded((e) => !e)}>
                  {expanded ? "Ver menos" : `Ver todas (${decisions.length})`}
                </Button>
              )}
            </div>
            {rest.length > 0 && expanded && (
              <ul id={`${uid}-all`} className={s.all}>
                {rest.map((d) => (
                  <li key={d.id}>
                    <span className={s.allText}>
                      <strong>{d.title}</strong>
                      <span className={s.detail}>{d.detail}</span>
                    </span>
                    <Button variant="you" size="sm" aria-label={`Decidir: ${d.title}`} onClick={d.onDecide}>
                      Decidir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : (
          <article className={s.card} aria-labelledby={`${uid}-decision`} data-kind="calm">
            <span id={`${uid}-decision`} className={s.srOnly}>
              Decisões
            </span>
            <EmptyState variant="quiet" title="Nada espera você agora" />
          </article>
        )}
      </div>

      {problems.length > 0 && (
        <article className={s.problems} aria-labelledby={`${uid}-problems`}>
          <h2 id={`${uid}-problems`} className={s.eyebrow} data-tone="blocked">
            <StatusGlyph status="blocked" size={12} color="inherit" /> Parado
          </h2>
          <ul className={s.problemList}>
            {problems.map((p) => (
              <li key={p.key} className={s.problem} data-kind={p.kind}>
                <StatusGlyph status={p.kind} size={12} />
                <span>
                  <strong>{p.title}</strong> <span className={s.reason}>{describeWorkStatus(p.kind, p.reason)}</span>
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}

