import { useEffect, useRef, useState } from "react";
import { activeInitiative, cursorFromEvents, deriveColmeia, deriveIslandDetails, eventsSinceCursor, initiativeFlow, type ColmeiaVM, type IslandDetail, type RunEvent } from "@data";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { cockpitStore, type CockpitStoreState } from "../../../store/CockpitStore";
import { createFrameThrottle, type FrameClock, type FrameThrottle } from "./frameThrottle";
import { mergeRunEvents } from "./mergeEvents";
import { buildScene, type SceneModel, type SceneOptions } from "./sceneModel";
import { buildViewContext } from "../view/viewTarget";

/**
 * De mensagem do host ao mapa (F5.3): o snapshot e o `runEvents-append` do
 * protocolo do Cockpit viram o `ColmeiaVM` (`deriveColmeia`), os detalhes de
 * cada ilha e a cena. Quando redesenhar é do `frameThrottle`: no quadro
 * seguinte ao evento, no máximo uma vez a cada 120 ms; em pausa, nada muda e a
 * hook só conta quantos eventos esperam.
 */

/** Intervalo mínimo entre dois redesenhos. Um evento isolado entra no quadro seguinte (~16 ms); só uma rajada espera isto. */
export const MIN_REDRAW_MS = 120;

export interface ColmeiaView {
  snapshot: CockpitSnapshot | null;
  /** `booting` até o primeiro snapshot chegar. */
  status: CockpitStoreState["status"];
  events: RunEvent[];
  vm: ColmeiaVM;
  details: IslandDetail[];
  scene: SceneModel;
}

const NO_VM: ColmeiaVM = { initiativeId: null, flow: null, islands: [], bridges: [], bees: [], guards: [], pots: [], feed: [] };

/**
 * O mapa para o estado atual do store. Pura (o relógio não entra): o mesmo estado dá a mesma vista.
 *
 * `initiativeId` é a iniciativa que o Cockpit está VENDO (G15): o mapa mostra
 * essa, e nunca reescreve o `active:` do registro. Sem ela (ou com uma que não
 * existe mais), vale a ativa. A projeção é a mesma da tela do Cockpit
 * (`buildViewContext`): a iniciativa vista no lugar da ativa, os eventos dela, e
 * o estado de delivery só quando ela é a ativa.
 */
export function deriveView(state: Pick<CockpitStoreState, "status" | "snapshot" | "recentRunEvents">, options: SceneOptions = {}, initiativeId?: string | null): ColmeiaView {
  const { snapshot } = state;
  if (!snapshot) return { snapshot: null, status: state.status, events: [], vm: NO_VM, details: [], scene: buildScene(NO_VM, [], options) };
  const merged = mergeRunEvents(snapshot.runEvents, state.recentRunEvents);
  const viewed = initiativeId ? snapshot.initiatives?.initiatives.find((i) => i.id === initiativeId) : undefined;
  if (!viewed || viewed.id === snapshot.initiatives?.active) {
    const vm = deriveColmeia(snapshot, merged, initiativeFlow(activeInitiative(snapshot.initiatives)));
    const details = deriveIslandDetails(snapshot, vm, merged, snapshot.agents ?? []);
    return { snapshot, status: state.status, events: merged, vm, details, scene: buildScene(vm, details, options) };
  }
  const ctx = buildViewContext(snapshot, { kind: "initiative", id: viewed.id });
  const events = merged.filter((e) => e.initiative_id === viewed.id);
  const vm = deriveColmeia(ctx.projected, events, initiativeFlow(viewed));
  const details = deriveIslandDetails({ ...snapshot, initiatives: ctx.projected.initiatives, deliveryState: ctx.projected.deliveryState }, vm, events, snapshot.agents ?? []);
  return { snapshot, status: state.status, events, vm, details, scene: buildScene(vm, details, options) };
}

const browserClock: FrameClock = {
  raf: (cb) => requestAnimationFrame(() => cb()),
  caf: (h) => cancelAnimationFrame(h),
  now: () => performance.now(),
};

export interface UseColmeiaOptions {
  /** Pausado: o desenho fica como está e os eventos esperam. */
  paused: boolean;
  scene?: SceneOptions;
  /** A iniciativa que o Cockpit está vendo; sem ela, a ativa. Trocar redesenha no quadro seguinte. */
  initiativeId?: string | null;
  /** Relógio de quadros; o padrão é o do navegador. Os testes passam o manual. */
  clock?: FrameClock;
  minIntervalMs?: number;
  /** Chamado a cada desenho aplicado, com o horário (para medir o atraso ponta a ponta). */
  onApplied?: (view: ColmeiaView) => void;
}

export function useColmeia({ paused, scene, initiativeId, clock = browserClock, minIntervalMs = MIN_REDRAW_MS, onApplied }: UseColmeiaOptions): { view: ColmeiaView; waiting: number } {
  const [view, setView] = useState<ColmeiaView>(() => deriveView(cockpitStore.getSnapshot(), scene, initiativeId));
  const [waiting, setWaiting] = useState(0);
  const throttle = useRef<FrameThrottle | null>(null);
  // O que os callbacks do store e do quadro leem sem recriar a assinatura: em efeito, nunca durante o render.
  const sceneOptions = useRef(scene);
  const viewedInitiative = useRef(initiativeId);
  const applied = useRef(onApplied);
  const frozen = useRef<RunEvent[]>(view.events);
  const pausedRef = useRef(paused);
  useEffect(() => {
    sceneOptions.current = scene;
    viewedInitiative.current = initiativeId;
    applied.current = onApplied;
    frozen.current = view.events;
    pausedRef.current = paused;
  });

  useEffect(() => {
    const t = createFrameThrottle(clock, minIntervalMs, () => {
      const next = deriveView(cockpitStore.getSnapshot(), sceneOptions.current, viewedInitiative.current);
      setView(next);
      setWaiting(0);
      applied.current?.(next);
    });
    throttle.current = t;
    if (pausedRef.current) t.hold();
    let seen = cockpitStore.getSnapshot();
    const unsubscribe = cockpitStore.subscribe(() => {
      const state = cockpitStore.getSnapshot();
      // Toast, troca de vista e afins mudam o store, mas não o mapa: só o snapshot e os eventos importam.
      if (state.snapshot === seen.snapshot && state.recentRunEvents === seen.recentRunEvents) return;
      seen = state;
      t.request();
      if (pausedRef.current) {
        // Pausado: o que chegou desde o desenho congelado, na ordem, é o "N novos" do chip.
        const now = state.snapshot ? mergeRunEvents(state.snapshot.runEvents, state.recentRunEvents) : [];
        setWaiting(eventsSinceCursor(now, cursorFromEvents(frozen.current)).length);
      }
    });
    return () => {
      unsubscribe();
      t.dispose();
      throttle.current = null;
    };
    // O relógio e o intervalo são estáveis durante a vida da vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (paused) throttle.current?.hold();
    else throttle.current?.release();
  }, [paused]);

  // O Cockpit passou a ver outra iniciativa: o mapa troca no quadro seguinte (e não redesenha à toa quando nada mudou).
  const drawn = useRef(initiativeId);
  useEffect(() => {
    if (drawn.current === initiativeId) return;
    drawn.current = initiativeId;
    throttle.current?.request();
  }, [initiativeId]);

  return { view, waiting };
}
