import { useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { StatusGlyph } from "../../../design-system/primitives";
import { BeeLayer } from "./BeeLayer";
import { SceneArt } from "./SceneArt";
import { STAGE } from "./layout";
import type { MotionState } from "./mapPrefs";
import { pathOf, pt } from "./projection";
import type { SceneIsland, SceneModel } from "./sceneModel";
import type { StageFit } from "./stageFit";
import s from "./Stage.module.css";

/**
 * O palco do mapa (F5.3): a arte, as abelhas e, por cima, os rótulos e os
 * alvos de clique de cada ilha. O palco tem 1440 × 900 e é escalado para
 * caber (`contain`); os rótulos vivem dentro dele, presos à ilha, mas com a
 * escala invertida, então o texto não encolhe junto (DS v2 §3.12).
 *
 * Teclado: as ilhas são um grupo com `roving tabindex`. Tab entra no grupo e
 * sai dele; as setas andam de ilha em ilha, Home e End vão às pontas, e Enter
 * ou Espaço abrem e fecham o painel (o próprio botão). O anel de foco e o da
 * seleção são desenhados em SVG, em duas cores (DS v2 §4.8).
 */

interface StageProps {
  scene: SceneModel;
  motion: MotionState;
  fit: StageFit;
  selectedId: string | null;
  /** A ilha que tem o `tabindex` 0 do grupo. */
  tabStopId: string | null;
  fresh: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onTabStop: (id: string) => void;
}

const at = (x: number, y: number): CSSProperties => ({ left: x, top: y });

function Ring({ island }: { island: SceneIsland }) {
  const { hit, ring } = island.art;
  const d = pathOf(ring.map((p) => pt(p.x - hit.x, p.y - hit.y)));
  return (
    <svg className={s.ring} width={hit.w} height={hit.h} viewBox={`0 0 ${hit.w} ${hit.h}`} aria-hidden="true" focusable="false">
      <path className={s.halo} d={d} />
      <path className={s.select} d={d} />
      <path className={s.focus} d={d} />
    </svg>
  );
}

function IslandLabel({ island }: { island: SceneIsland }) {
  const { x, y } = island.art.anchors.label;
  return (
    <div className={s.label} data-state={island.state} data-label={island.id} style={at(x, y)}>
      <span className={s.labelName}>{island.label}</span>
      <span className={s.labelMeta} data-tone={island.meta.tone}>{island.meta.text}</span>
      {island.progress && (
        <span className={s.processChip} data-process-progress={island.id}>
          {island.progress.done}/{island.progress.total} processos
        </span>
      )}
      {island.chips.map((chip) => (
        <span key={chip.text} className={s.chip} data-tone={chip.tone}>
          <StatusGlyph status={chip.glyph} size={12} color="inherit" />
          {chip.text}
        </span>
      ))}
    </div>
  );
}

export function Stage({ scene, motion, fit, selectedId, tabStopId, fresh, onToggle, onTabStop }: StageProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const ids = scene.islands.map((i) => i.id);
  const stop = tabStopId && ids.includes(tabStopId) ? tabStopId : (scene.islands.find((i) => i.state === "current") ?? scene.islands[0])?.id;

  const focusIsland = useCallback(
    (id: string): void => {
      onTabStop(id);
      refs.current.get(id)?.focus();
    },
    [onTabStop]
  );

  // Ao abrir ou fechar o painel pelo teclado, o foco continua na ilha (a página não o perde quando o painel monta).
  useEffect(() => {
    if (selectedId) onTabStop(selectedId);
  }, [selectedId, onTabStop]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const current = ids.indexOf((e.target as HTMLElement).getAttribute("data-island") ?? "");
    if (current < 0) return;
    const target =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? current + 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? current - 1
      : e.key === "Home" ? 0
      : e.key === "End" ? ids.length - 1
      : null;
    if (target === null) return;
    e.preventDefault();
    focusIsland(ids[Math.max(0, Math.min(ids.length - 1, target))]!);
  }

  const style = { width: STAGE.w, height: STAGE.h, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.k})`, "--k": fit.k } as CSSProperties;

  return (
    <div className={s.stage} style={style} data-stage-scale={fit.k.toFixed(3)}>
      <SceneArt scene={scene} fresh={fresh} />
      <BeeLayer key={scene.initiativeId ?? "sem-iniciativa"} scene={scene} motion={motion} />

      <div className={s.overlay} aria-hidden="true">
        {scene.islands.map((island) => (
          <IslandLabel key={island.id} island={island} />
        ))}
        {scene.bridges.map((bridge) =>
          bridge.chip ? (
            <span key={bridge.key} className={s.gate} data-tone={bridge.chip.tone} data-gate={bridge.gate} style={at(bridge.chip.at.x, bridge.chip.at.y)}>
              {bridge.chip.tone === "future" && <StatusGlyph status="future" size={12} color="inherit" />}
              {bridge.chip.text}
            </span>
          ) : null
        )}
        {scene.bees.map((bee) =>
          bee.tag ? (
            <span key={bee.key} className={s.tag} data-glyph={bee.tag.glyph} data-tag={bee.agentId ?? bee.key} style={at(bee.perch.x + 14, bee.perch.y - 30)}>
              <StatusGlyph status={bee.tag.glyph} size={12} color="inherit" />
              <span className={s.tagText}>{bee.tag.text}</span>
            </span>
          ) : null
        )}
        {scene.overflow.map((o) => (
          <span key={o.islandId} className={s.more} data-more={o.islandId} style={at(o.at.x, o.at.y)}>
            +{o.count}
          </span>
        ))}
        {scene.islands.map((island) =>
          island.combOverflow > 0 ? (
            <span key={`${island.id}-favos`} className={s.more} data-more-pots={island.id} style={at(island.art.anchors.comb.x, island.art.anchors.comb.y + 44 * island.placement.u)}>
              +{island.combOverflow}
            </span>
          ) : null
        )}
      </div>

      <div role="group" aria-label="Ilhas" className={s.hits} onKeyDown={onKeyDown}>
        {scene.islands.map((island) => {
          const open = selectedId === island.id;
          const { hit } = island.art;
          return (
            <button
              key={island.id}
              ref={(el) => {
                if (el) refs.current.set(island.id, el);
                else refs.current.delete(island.id);
              }}
              type="button"
              className={s.isle}
              data-island={island.id}
              data-state={island.state}
              aria-expanded={open}
              aria-controls={open ? "island-panel" : undefined}
              aria-label={island.ariaLabel}
              tabIndex={island.id === stop ? 0 : -1}
              style={{ left: hit.x, top: hit.y, width: hit.w, height: hit.h }}
              onClick={() => onToggle(island.id)}
              onFocus={() => onTabStop(island.id)}
            >
              <Ring island={island} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
