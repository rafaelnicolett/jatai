import { useEffect, useRef, useState } from "react";
import { EmptyState, EpicBoard, EpicPotList, GateTimeline, NowCard, PhaseTrack } from "../../../design-system/patterns";
import type { BoardColumnView, BoardTaskView, GateItemView, NowDecisionView, NowProblemView, PotView, TrackBridgeView } from "../../../design-system/patterns";
import { Button } from "../../../design-system/primitives";
import { useCockpitSelector } from "../../../store/useCockpitSelector";
import { makeInitiativeActive } from "../../../store/decisionActions";
import { staleSeconds } from "../view/connection";
import type { CockpitModel } from "../view/cockpitModel";
import { announceNewDecisions } from "../view/deriveAgora";
import { hasTaskDetails, type TaskModel } from "../view/deriveBoard";
import type { DecisionRef } from "../view/decisionRef";
import { useDecisionFlow } from "../view/useDecisionFlow";
import { useMapDecisionRequest } from "../map/mapDecision";
import { formatRelativeTime } from "../shell/NotificationCenter/formatRelativeTime";
import { TaskDetails } from "./TaskDetails";
import s from "./CockpitScreen.module.css";

interface CockpitScreenProps {
  model: CockpitModel;
  onSelectStop: (key: string) => void;
  onOpenOperations: () => void;
  announce: (text: string) => void;
}

/** Singular e plural da unidade de cada parada: o nome da lista de potes e a legenda dela. */
const UNIT_WORDS: Record<string, [string, string]> = { Epic: ["épico", "épicos"], Onda: ["onda", "ondas"], Repositório: ["repositório", "repositórios"], Fase: ["fase", "fases"], Sprint: ["sprint", "sprints"] };

/**
 * "Sem atualização há N s" (DS v2 §4.3): um tique por segundo, só para decidir
 * se o dado envelheceu. O estado é o valor calculado, então a tela só se
 * refaz quando ele muda (nunca a cada tique enquanto o dado está em dia).
 */
function useStaleSeconds(generatedAt: string | null): number | null {
  const [stale, setStale] = useState<number | null>(() => staleSeconds(generatedAt, Date.now()));
  useEffect(() => {
    const id = setInterval(() => setStale(staleSeconds(generatedAt, Date.now())), 1_000);
    return () => clearInterval(id);
  }, [generatedAt]);
  return stale;
}

/**
 * A tela do Cockpit sobre o design system v2 (F4.2): a trilha de fase no topo,
 * o "Agora", e embaixo os potes, o quadro do épico e os gates. A ordem do DOM é
 * a ordem de foco do DS (§4.0): barra → trilha → Agora → potes → quadro → gates.
 *
 * Tudo o que ela mostra vem do `CockpitModel`, derivado por funções puras: aqui
 * só se desenha e se liga cada decisão ao painel único (`useDecisionFlow`).
 */
export function CockpitScreen({ model, onSelectStop, onOpenOperations, announce }: CockpitScreenProps) {
  const { ctx, track, board, agora, gates } = model;
  const generatedAt = useCockpitSelector((st) => st.generatedAt);
  const stale = useStaleSeconds(generatedAt);
  const [details, setDetails] = useState<TaskModel | null>(null);
  const flow = useDecisionFlow(ctx, announce);
  // O mapa da colmeia leva uma guarda acesa até aqui (F5.3): o painel de decisão abre com o contexto dela.
  useMapDecisionRequest(ctx.initiative?.id, agora.waiting, flow.open);

  // Decisão nova é anunciada uma vez; abrir ou trocar de visão nunca lê em voz alta o que já esperava.
  const seen = useRef<{ scope: string; ids: Set<string> } | null>(null);
  const scope = `${ctx.target.kind}:${ctx.initiative?.id ?? ""}`;
  const waitingKey = agora.waiting.map((w) => w.id).join("|");
  useEffect(() => {
    const previous = seen.current?.scope === scope ? seen.current.ids : null;
    const text = announceNewDecisions(previous, agora.waiting);
    seen.current = { scope, ids: new Set(agora.waiting.map((w) => w.id)) };
    if (text) announce(text);
    // `waitingKey` resume o conteúdo de `agora.waiting`; a identidade do array muda a cada snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, waitingKey, announce]);

  const decide = (ref: DecisionRef) => () => flow.open(ref);

  const decisions: NowDecisionView[] = agora.waiting.map((w) => ({ id: w.id, title: w.title, detail: w.detail, onDecide: decide(w.ref) }));
  const problems: NowProblemView[] = agora.problems.map((p) => ({ key: p.key, kind: p.kind, title: p.title, reason: p.reason }));
  const lastEventText = agora.activity.lastEventAt ? `Último evento ${formatRelativeTime(agora.activity.lastEventAt)}` : undefined;
  const active = ctx.snapshot.initiatives?.initiatives.find((i) => i.id === ctx.activeId);

  const bridges: TrackBridgeView[] = track.bridges.map((b) => {
    const review = gates.items.find((g) => g.badge === b.gate)?.review;
    return { gate: b.gate, status: b.status, ...(b.reason ? { reason: b.reason } : {}), ...(b.status === "waiting" && review ? { onDecide: decide(review) } : {}) };
  });

  const pots: PotView[] = track.stops.map((stop) => ({ key: stop.key, n: stop.n, label: stop.label, progress: stop.progress, tag: stop.tag, status: stop.status, unit: stop.unit }));

  const taskView = (task: TaskModel): BoardTaskView => ({
    key: task.key,
    id: task.id,
    title: task.title,
    column: task.column,
    ...(task.condition ? { condition: task.condition } : {}),
    ...(task.meta ? { meta: task.meta } : {}),
    ...(hasTaskDetails(task) ? { onOpen: () => setDetails(task) } : {}),
    ...(task.decision ? { action: { label: "Ver o que está em jogo", accessibleLabel: `Ver o que está em jogo: ${task.title}`, onClick: decide(task.decision) } } : {}),
  });
  const columns: BoardColumnView[] = board.columns.map((c) => ({ status: c.status, blockedCount: c.blockedCount, tasks: c.tasks.map(taskView) }));

  const gateItems: GateItemView[] = gates.items.map((g) => ({ badge: g.badge, title: g.title, status: g.status, meta: g.meta, ...(g.review ? { onReview: decide(g.review) } : {}) }));

  const words = UNIT_WORDS[track.unit] ?? ["parada", "paradas"];
  const hasTabs = track.stops.length > 0 || track.kind === "waves";
  const selected = track.selectedStopKey;

  return (
    <div className={s.page}>
      <PhaseTrack
        segments={track.segments}
        bridges={bridges}
        stops={track.stops}
        stopsLabel={track.kind === "waves" ? "Ondas do hotfix" : track.stopsLabel}
        stopsEmpty={track.stopsEmpty}
        selectedKey={selected}
        onSelectStop={onSelectStop}
        segmentsSelectable={track.kind === "waves"}
        controls="epic-board"
        activityKey={agora.activity.lastEventAt ?? undefined}
        openableSegmentId={track.kind === "waves" ? undefined : "operation"}
        onOpenSegment={onOpenOperations}
      />

      <NowCard
        where={{ initiative: agora.where.initiative, path: [agora.where.kind, agora.where.stream, agora.where.focus].filter((x): x is string => !!x) }}
        {...(ctx.initiative && !ctx.isActive
          ? { viewing: { activeName: active?.name ?? null, onMakeActive: () => makeInitiativeActive(ctx.initiative!.id), ...(ctx.detailLoaded ? {} : { detailNotice: "O detalhe das fases só carrega para a iniciativa ativa." }) } }
          : {})}
        activity={{ count: agora.activity.count, agents: agora.activity.agents, ...(lastEventText ? { lastEventText } : {}), staleSeconds: stale, ...(agora.activity.lastEventAt ? { activityKey: agora.activity.lastEventAt } : {}) }}
        decisions={decisions}
        problems={problems}
      />

      <div className={s.cols}>
        {pots.length > 0 && (
          <div className={s.pots}>
            <EpicPotList
              pots={pots}
              selectedKey={selected}
              onSelect={onSelectStop}
              ariaLabel={words[1].replace(/^./, (c) => c.toUpperCase())}
              heading={`Potes · ${pots.length} ${pots.length === 1 ? words[0] : words[1]}`}
              controls="epic-board"
            />
          </div>
        )}
        <div className={s.board}>
          <EpicBoard
            id="epic-board"
            {...(hasTabs && selected ? { labelledBy: `stop-${selected}` } : {})}
            title={board.title}
            {...(board.description ? { description: board.description } : {})}
            columns={columns}
            {...(board.empty ? { empty: board.empty } : {})}
            {...(board.activityKey ? { activityKey: board.activityKey } : {})}
          />
        </div>
        <div className={s.gates}>
          <GateTimeline items={gateItems} empty={gates.empty} />
        </div>
      </div>

      {flow.node}
      <TaskDetails task={details} onClose={() => setDetails(null)} />
    </div>
  );
}

/** Um estado vazio de página, com a única ação que ele oferece (G9). */
export function PageEmpty({ title, body, busy, action }: { title: string; body: string; busy?: boolean; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={s.empty}>
      <EmptyState title={title} body={body} busy={busy} headingLevel={1} action={action ? <Button variant="primary" size="lg" onClick={action.onClick}>{action.label}</Button> : undefined} />
    </div>
  );
}
