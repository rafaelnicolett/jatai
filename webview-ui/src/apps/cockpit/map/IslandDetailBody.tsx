import type { ColmeiaBridge, ColmeiaGuard, IslandDetail, MapCharacter, MapProcess } from "@data";
import { groupProcesses } from "@data";
import { JataiMark } from "../../../design-system/brand/JataiMark";
import { Button, StatusGlyph } from "../../../design-system/primitives";
import { CHECKLIST_TEXT, PROCESS_TEXT, agentStatusView, islandBlurb, plural, potLabel, processOwner } from "./copy";
import s from "./IslandDetailBody.module.css";

/**
 * O corpo dos detalhes de uma ilha (F5.3/F5.4): o painel lateral e o modo
 * lista desenham o MESMO componente a partir do mesmo `IslandDetail`, então as
 * duas vistas têm as mesmas informações por construção (R10).
 *
 * A partir da F5.4, o painel é um inventário: os **processos** da ilha (não só
 * o gate), o **elenco** com persona — quem cuida do quê —, as entregas e o
 * checklist do gate. Cada processo e cada personagem abrem como um item de
 * inventário (`<details>`): clicar revela o porquê, o artefato, o passo e as
 * entregas. Nada aqui decide: o mapa só mostra o que o núcleo derivou e não
 * registra nenhuma decisão (R6).
 */

interface BodyProps {
  detail: IslandDetail;
  /** O gate depois desta ilha, se houver. */
  gateAfter?: ColmeiaBridge;
  onOpenFile: (relPath: string) => void;
  onOpenDecision: (guard: ColmeiaGuard) => void;
}

const AGENT_TONE = { working: "working", queued: "queue", sleeping: "future", done: "done", blocked: "blocked" } as const;

/** O processo em que o personagem está, para a ficha. */
function processOf(detail: IslandDetail, character: MapCharacter): MapProcess | undefined {
  return character.processId ? detail.processes?.find((p) => p.id === character.processId) : undefined;
}

function ProcessCard({ process, onOpenFile }: { process: MapProcess; onOpenFile: (relPath: string) => void }) {
  const view = PROCESS_TEXT[process.status];
  return (
    <details className={s.process} data-process={process.id} data-status={process.status}>
      <summary className={s.processSummary}>
        <span className={s.processIcon} aria-hidden="true">
          {process.icon}
        </span>
        <span className={s.processBody}>
          <span className={s.processLabel}>{process.label}</span>
          <span className={s.processMeta}>{processOwner(process.agent)}</span>
        </span>
        <span className={s.state} data-tone={view.status}>
          <StatusGlyph status={view.status} size={14} color="inherit" />
          {view.text}
        </span>
      </summary>
      <div className={s.processDetail}>
        {process.why && <p className={s.why}>{process.why}</p>}
        {process.blockedBy && <p className={s.warn}>Falta: {process.blockedBy}</p>}
        {process.progress && (
          <p className={s.hint}>
            {process.progress.done}/{process.progress.total} itens do checklist humano
          </p>
        )}
        {process.artifact && (
          <button type="button" className={s.link} data-process-artifact={process.artifact} aria-label={`Abrir ${potLabel(process.artifact)}`} title={process.artifact} onClick={() => onOpenFile(process.artifact!)}>
            {process.artifact}
          </button>
        )}
        <p className={s.metaLine}>
          {process.scope === "workspace" ? "cross-repo" : process.repoId ? `repo ${process.repoId}` : "processo"}
          {process.gate ? ` · fecha ${process.gate}` : ""}
        </p>
      </div>
    </details>
  );
}

function CharacterCard({ detail, character, onOpenFile }: { detail: IslandDetail; character: MapCharacter; onOpenFile: (relPath: string) => void }) {
  const view = agentStatusView(character.status, character.reason);
  const current = processOf(detail, character);
  return (
    <details className={s.agent} data-agent={character.agentId} data-status={character.status} data-tone={AGENT_TONE[character.status]} data-accent={character.accent}>
      <summary className={s.agentSummary}>
        <span className={s.avatar} aria-hidden="true">
          {character.name.charAt(0)}
        </span>
        <span className={s.agentBody}>
          <span className={s.agentName}>
            {character.name} <span className={s.agentId}>{character.agentId}</span>
          </span>
          <span className={s.role}>
            {character.archetype}
            {character.role ? ` · ${character.role}` : ""}
          </span>
          <span className={s.state} data-tone={view.status}>
            <StatusGlyph status={view.status} size={14} color="inherit" />
            {view.text}
          </span>
          {(character.step || character.taskId) && <span className={s.task}>{[character.step, character.taskId].filter(Boolean).join(" · ")}</span>}
        </span>
      </summary>
      <div className={s.agentDetail}>
        <p className={s.trait}>{character.trait}</p>
        {character.reason && <p className={s.warn}>{character.reason}</p>}
        {current && (
          <p className={s.metaLine}>
            Agora: <strong>{current.label}</strong> · {current.groupLabel}
          </p>
        )}
        {character.handles.length > 0 && <p className={s.metaLine}>Cuida de: {character.handles.join(" · ")}</p>}
        {character.deliverables.length > 0 && (
          <div className={s.deliverables}>
            <span className={s.metaLine}>Entregas:</span>
            {character.deliverables.map((path) => (
              <button key={path} type="button" className={s.link} data-deliverable={path} aria-label={`Abrir ${potLabel(path)}`} title={path} onClick={() => onOpenFile(path)}>
                {path}
              </button>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function IslandDetailBody({ detail, gateAfter, onOpenFile, onOpenDecision }: BodyProps) {
  const sleeping = detail.state === "sleeping";
  const processes = detail.processes ?? [];
  const groups = groupProcesses(processes);
  const characters = detail.characters ?? [];
  const summary = detail.processSummary ?? { done: processes.filter((p) => p.status === "done").length, total: processes.length };

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

      {processes.length > 0 && (
        <section className={s.section} aria-label="Processos">
          <h3 className={s.eyebrow}>
            Processos{" "}
            <span className={s.count} data-process-summary>
              {summary.done}/{summary.total}
            </span>
          </h3>
          {groups.map((group) => (
            <div key={group.id} className={s.group} data-process-group={group.id}>
              <div className={s.groupHead}>
                <h4 className={s.groupTitle}>{group.label}</h4>
                {group.gate && <span className={s.gateChip}>{group.gate}</span>}
                <span className={s.groupCount}>
                  {group.done}/{group.total}
                </span>
              </div>
              <ul className={s.list}>
                {group.processes.map((process) => (
                  <li key={process.id}>
                    <ProcessCard process={process} onOpenFile={onOpenFile} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className={s.section} aria-label="Quem trabalha aqui">
        <h3 className={s.eyebrow}>Quem trabalha aqui</h3>
        {characters.length > 0 ? (
          <ul className={s.list}>
            {characters.map((character) => (
              <li key={character.agentId}>
                <CharacterCard detail={detail} character={character} onOpenFile={onOpenFile} />
              </li>
            ))}
          </ul>
        ) : detail.agents.length === 0 ? (
          <p className={s.empty}>Ninguém trabalha aqui ainda.</p>
        ) : (
          <ul className={s.list}>
            {detail.agents.map((agent) => {
              const view = agentStatusView(agent.status, agent.reason);
              return (
                <li key={agent.agentId} className={s.agentLegacy} data-agent={agent.agentId} data-status={agent.status} data-tone={AGENT_TONE[agent.status]}>
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
                    {(agent.step || agent.taskId) && <span className={s.task}>{[agent.step, agent.taskId].filter(Boolean).join(" · ")}</span>}
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
