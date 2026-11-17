import type { ColmeiaBridge, ColmeiaGuard, IslandDetail } from "@data";
import { JataiMark } from "../../../design-system/brand/JataiMark";
import { Button, StatusGlyph } from "../../../design-system/primitives";
import { CHECKLIST_TEXT, agentStatusView, islandBlurb, plural, potLabel } from "./copy";
import s from "./IslandDetailBody.module.css";

/**
 * O corpo dos detalhes de uma ilha (F5.3): o painel lateral e o modo lista
 * desenham o MESMO componente a partir do mesmo `IslandDetail`, então as duas
 * vistas têm as mesmas informações por construção (R10). O que muda é só o
 * contêiner: um painel não modal ao lado da cena, ou uma seção da lista.
 *
 * Quem trabalha ali e o que cada um faz, o passo atual, o que espera a pessoa,
 * as entregas (cada uma leva ao arquivo) e o que falta para o gate. Nada aqui
 * decide: o painel só mostra o que o núcleo derivou e o mapa não registra
 * nenhuma decisão (R6): "Abrir a decisão" leva ao Cockpit.
 */

interface BodyProps {
  detail: IslandDetail;
  /** O gate depois desta ilha, se houver. */
  gateAfter?: ColmeiaBridge;
  onOpenFile: (relPath: string) => void;
  onOpenDecision: (guard: ColmeiaGuard) => void;
}

const AGENT_TONE = { working: "working", queued: "queue", sleeping: "future", done: "done", blocked: "blocked" } as const;

export function IslandDetailBody({ detail, gateAfter, onOpenFile, onOpenDecision }: BodyProps) {
  const sleeping = detail.state === "sleeping";
  return (
    <div className={s.body} data-island-detail={detail.islandId}>
      <p className={s.blurb}>{islandBlurb({ id: detail.islandId, label: detail.label })}</p>

      <section className={s.section} aria-label="Passo atual">
        <h3 className={s.eyebrow}>Passo atual</h3>
        <p className={s.step} data-step>
          {sleeping
            ? `A ilha acorda depois do gate ${detail.wakesAfterGate ?? "anterior"}.`
            : detail.state === "done"
              ? `Concluída${gateAfter?.state === "approved" ? ` e liberada pelo gate ${gateAfter.gate}` : ""}.`
              : (detail.focus ?? "Em andamento")}
        </p>
      </section>

      <section className={s.section} aria-label="Quem trabalha aqui">
        <h3 className={s.eyebrow}>Quem trabalha aqui</h3>
        {detail.agents.length === 0 ? (
          <p className={s.empty}>Ninguém trabalha aqui ainda.</p>
        ) : (
          <ul className={s.list}>
            {detail.agents.map((agent) => {
              const view = agentStatusView(agent.status, agent.reason);
              return (
                <li key={agent.agentId} className={s.agent} data-agent={agent.agentId} data-status={agent.status} data-tone={AGENT_TONE[agent.status]}>
                  <span className={s.bee} aria-hidden="true">
                    <JataiMark size={22} decorative />
                  </span>
                  <span className={s.agentBody}>
                    <span className={s.agentName}>{agent.agentId}</span>
                    {agent.role && <span className={s.role}>{agent.role}</span>}
                    <span className={s.state} data-tone={view.status}>
                      <StatusGlyph status={view.status} size={14} color="inherit" />
                      {view.text}
                    </span>
                    {(agent.step || agent.taskId) && (
                      <span className={s.task}>
                        {[agent.step, agent.taskId].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {detail.guards.length > 0 && (
        <section className={s.section} aria-label="Espera você">
          <h3 className={s.eyebrow}>Espera você</h3>
          <ul className={s.list}>
            {detail.guards.map((guard) => (
              <li key={`${guard.kind}|${guard.taskId ?? ""}|${guard.reason}`} className={s.guard} data-guard={guard.kind}>
                <span className={s.guardText} data-tone="you">
                  <StatusGlyph status="you" size={14} color="inherit" />
                  <span>
                    <span className={s.guardKind}>{guard.kind === "decision" ? "Decisão" : "Aprovação"}</span> · {guard.reason}
                  </span>
                </span>
                <Button variant="you" size="sm" onClick={() => onOpenDecision(guard)}>
                  Abrir a decisão
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={s.section} aria-label="Entregas">
        <h3 className={s.eyebrow}>Entregas</h3>
        {detail.pots.length === 0 ? (
          <p className={s.empty}>Nenhuma entrega ainda.</p>
        ) : (
          <ul className={s.list}>
            {detail.pots.map((pot) => (
              <li key={pot.artifactPath}>
                <button type="button" className={s.link} data-pot={pot.artifactPath} aria-label={`Abrir ${potLabel(pot.artifactPath)}`} title={pot.artifactPath} onClick={() => onOpenFile(pot.artifactPath)}>
                  {pot.artifactPath}
                </button>
              </li>
            ))}
          </ul>
        )}
        {detail.plannedPots > 0 && <p className={s.hint}>{plural(detail.plannedPots, "entrega por vir", "entregas por vir")} (favos vazios na cena).</p>}
      </section>

      {detail.checklist && (
        <section className={s.section} aria-label={detail.checklist.gate ? `Para o gate ${detail.checklist.gate}` : "O que falta"}>
          <h3 className={s.eyebrow}>{detail.checklist.gate ? `Para o gate ${detail.checklist.gate}` : "O que falta"}</h3>
          <ul className={s.list}>
            {detail.checklist.items.map((item) => {
              const view = CHECKLIST_TEXT[item.status]!;
              return (
                <li key={item.key} className={s.check} data-check={item.key} data-status={item.status}>
                  <span className={s.state} data-tone={view.status}>
                    <StatusGlyph status={view.status} size={14} color="inherit" />
                    <span className={s.checkLabel}>{item.label}</span>
                  </span>
                  <span className={s.checkState}>
                    {view.text}
                    {item.reason ? `: ${item.reason}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
