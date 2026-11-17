import type { CSSProperties } from "react";
import { JataiMark } from "../../brand/JataiMark";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { VisuallyHidden } from "../../primitives/VisuallyHidden/VisuallyHidden";
import { EpicStop } from "../EpicStop/EpicStop";
import type { EpicStopStatus } from "../EpicStop/epicStopName";
import { GATE_STATUS_TEXT, type GateStatus } from "../GateBadge/gateStatus";
import { useRovingTabs } from "./useRovingTabs";
import s from "./PhaseTrack.module.css";

export interface TrackSegmentView {
  id: string;
  label: string;
  status: "done" | "current" | "future";
  /** "Concluído", "Você está aqui · Epic 0" ou "Depois". */
  eyebrow: string;
}

export interface TrackBridgeView {
  gate: string;
  status: GateStatus;
  /** Por que está assim, em texto (o que falta, o que bloqueia). Vai na dica e no nome acessível. */
  reason?: string;
  /** Só no gate que espera você: a ponte vira o botão que abre a decisão. */
  onDecide?: () => void;
}

export interface TrackStopView {
  key: string;
  n: number;
  label: string;
  status: EpicStopStatus;
  progress: number | null;
  here: boolean;
  /** "Epic", "Onda", "Repositório", "Fase" ou "Sprint". */
  unit: string;
}

interface PhaseTrackProps {
  segments: TrackSegmentView[];
  /** `bridges[i]` fica entre `segments[i]` e `segments[i + 1]`. */
  bridges: TrackBridgeView[];
  stops: TrackStopView[];
  /** Nome da lista de paradas, ex.: "Épicos da Execução". */
  stopsLabel: string;
  /** Por que não há paradas, e quando passam a haver. */
  stopsEmpty?: string;
  selectedKey: string | null;
  onSelectStop: (key: string) => void;
  /** Hotfix: os segmentos SÃO as ondas, e cada um abre o quadro dele (abas, como as paradas). */
  segmentsSelectable?: boolean;
  /** id do painel que a seleção controla (`aria-controls`), em geral "epic-board". */
  controls: string;
  /** Muda a cada evento de agente: a abelha da trilha flutua numa rajada de 2 ciclos e para. */
  activityKey?: string;
  /** Um segmento que abre uma vista própria (a Operação, que é contínua e tem painel). */
  openableSegmentId?: string;
  onOpenSegment?: (id: string) => void;
}

const SEGMENT_TEXT = { done: "concluído", current: "onde a missão está", future: "depois" } as const;

function bridgeText(b: TrackBridgeView): string {
  return `gate ${b.gate}, ${GATE_STATUS_TEXT[b.status]}${b.reason ? `: ${b.reason}` : ""}`;
}

function BridgeMark({ bridge }: { bridge: TrackBridgeView }) {
  const label =
    bridge.status === "approved" ? (
      `${bridge.gate} ✓`
    ) : bridge.status === "waiting" ? (
      <>
        <StatusGlyph status="you" size={10} color="inherit" />
        {bridge.gate} espera você
      </>
    ) : bridge.status === "blocked" ? (
      <>
        <StatusGlyph status="blocked" size={10} color="inherit" />
        {bridge.gate}
      </>
    ) : (
      bridge.gate
    );
  return (
    <>
      <span className={s.bar} aria-hidden="true" />
      <span className={s.bridgeLabel} aria-hidden="true">
        {label}
      </span>
    </>
  );
}

/**
 * Trilha de fase do DS v2 (§4.2): a iniciativa como mapa. Os streams são
 * terrenos, os gates são pontes e as paradas são os épicos do stream atual.
 * Marca onde a missão está e escolhe a parada que o quadro mostra.
 *
 * - `<nav aria-label="Trilha da missão">` com uma `<ol>`; cada item é lido
 *   inteiro ("Descoberta, concluído"; "gate D1, aprovado");
 * - as paradas são um `tablist` com tabindex itinerante, ←/→/Home/End e
 *   ativação automática; a parada onde a missão está leva `aria-current="step"`;
 * - o gate que espera você é um botão: "Gate D3 espera você. Abrir a decisão.".
 * Estado nunca só por cor: glifo, texto e traçado (sólido, pontilhado, tracejado).
 */
export function PhaseTrack({ segments, bridges, stops, stopsLabel, stopsEmpty, selectedKey, onSelectStop, segmentsSelectable = false, controls, activityKey, openableSegmentId, onOpenSegment }: PhaseTrackProps) {
  const stopKeys = stops.map((x) => x.key);
  const stopTabs = useRovingTabs(stopKeys, selectedKey, onSelectStop);
  const segmentTabs = useRovingTabs(
    segments.map((x) => x.id),
    selectedKey,
    onSelectStop
  );

  const renderSegmentBody = (seg: TrackSegmentView) => (
    <>
      <span className={s.eyebrow} data-tone={seg.status}>
        {seg.status === "done" && <StatusGlyph status="done" size={12} color="inherit" />}
        {seg.status === "future" && <StatusGlyph status="future" size={12} color="inherit" />}
        {seg.eyebrow}
      </span>
      <span className={s.title}>{seg.label}</span>
    </>
  );

  const items = segments.flatMap((seg, i) => {
    const out = [];
    const selected = segmentsSelectable && seg.id === selectedKey;
    const openable = !segmentsSelectable && onOpenSegment && seg.id === openableSegmentId;

    out.push(
      <li key={seg.id} className={s.segment} data-status={seg.status} data-selected={selected || undefined} aria-current={seg.status === "current" ? "step" : undefined} role={segmentsSelectable ? "presentation" : undefined}>
        {segmentsSelectable ? (
          <button
            type="button"
            role="tab"
            ref={segmentTabs.register(seg.id)}
            id={`stop-${seg.id}`}
            className={s.segmentButton}
            aria-selected={selected}
            aria-controls={controls}
            aria-current={seg.status === "current" ? "step" : undefined}
            tabIndex={segmentTabs.tabIndexFor(seg.id)}
            onKeyDown={segmentTabs.onKeyDown(seg.id)}
            onClick={() => onSelectStop(seg.id)}
          >
            {renderSegmentBody(seg)}
            <VisuallyHidden>, {SEGMENT_TEXT[seg.status]}</VisuallyHidden>
          </button>
        ) : openable ? (
          <button type="button" className={s.segmentButton} onClick={() => onOpenSegment?.(seg.id)}>
            {renderSegmentBody(seg)}
            <VisuallyHidden>, {SEGMENT_TEXT[seg.status]}. Abrir o painel.</VisuallyHidden>
          </button>
        ) : (
          <>
            {seg.status === "current" ? (
              <div className={s.head}>
                <span className={s.title}>{seg.label}</span>
                <span className={s.eyebrow} data-tone="current">
                  {seg.eyebrow}
                </span>
              </div>
            ) : (
              renderSegmentBody(seg)
            )}
            <VisuallyHidden>, {SEGMENT_TEXT[seg.status]}</VisuallyHidden>
            {seg.status === "current" && (
              <>
                {stops.length > 0 ? (
                  <div className={s.stops} role="tablist" aria-label={stopsLabel} style={{ "--stops": stops.length } as CSSProperties}>
                    <span className={s.path} aria-hidden="true" />
                    {stops.map((stop) => (
                      <div key={stop.key} className={s.stopCell}>
                        {stop.here && (
                          <span key={activityKey ?? "idle"} className={s.bee} aria-hidden="true">
                            <JataiMark size={22} decorative />
                          </span>
                        )}
                        <EpicStop
                          ref={stopTabs.register(stop.key)}
                          id={`stop-${stop.key}`}
                          unit={stop.unit}
                          n={stop.n}
                          label={stop.label}
                          status={stop.status}
                          here={stop.here}
                          selected={stop.key === selectedKey}
                          progress={stop.progress ?? undefined}
                          controls={controls}
                          tabIndex={stopTabs.tabIndexFor(stop.key)}
                          onKeyDown={stopTabs.onKeyDown(stop.key)}
                          onClick={() => onSelectStop(stop.key)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  stopsEmpty && <p className={s.stopsEmpty}>{stopsEmpty}</p>
                )}
              </>
            )}
          </>
        )}
      </li>
    );

    const bridge = bridges[i];
    if (bridge && i < segments.length - 1) {
      out.push(
        <li key={`bridge-${bridge.gate}`} className={s.bridge} data-status={bridge.status} title={bridge.reason}>
          {bridge.status === "waiting" && bridge.onDecide ? (
            <button type="button" className={s.bridgeButton} onClick={bridge.onDecide} aria-label={`Gate ${bridge.gate} espera você. Abrir a decisão.`}>
              <BridgeMark bridge={bridge} />
            </button>
          ) : (
            <>
              <BridgeMark bridge={bridge} />
              <VisuallyHidden>{bridgeText(bridge)}</VisuallyHidden>
            </>
          )}
        </li>
      );
    }
    return out;
  });

  return (
    <nav className={s.track} aria-label="Trilha da missão">
      <ol className={s.list} role={segmentsSelectable ? "tablist" : undefined} aria-label={segmentsSelectable ? stopsLabel || "Ondas" : undefined}>
        {items}
      </ol>
    </nav>
  );
}
