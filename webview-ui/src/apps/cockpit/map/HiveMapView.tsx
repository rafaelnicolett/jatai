import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ColmeiaGuard } from "@data";
import { JataiMark } from "../../../design-system/brand/JataiMark";
import { Button, VisuallyHidden } from "../../../design-system/primitives";
import type { DecisionRequest } from "../../../store/CockpitStore";
import { getPersistedState, postMessage, setPersistedState } from "../../../store/vscodeApi";
import { announcementsFor, countActivity, createAnnouncer, type Announcer } from "./announcer";
import { IslandPanel } from "./IslandPanel";
import { Legend } from "./Legend";
import { ListMode } from "./ListMode";
import { LiveFeed } from "./LiveFeed";
import { MapHeader } from "./MapHeader";
import { Stage } from "./Stage";
import { readLightTheme, readReducedMotion, readScreenReader, resolveMapMode, resolveMotion, resolveSceneVariant, type MapMode, type SceneVariant } from "./mapPrefs";
import type { SceneOptions } from "./sceneModel";
import { fitStage, sizeClass, useElementSize } from "./stageFit";
import { useColmeia, type UseColmeiaOptions } from "./useColmeia";
import s from "./HiveMapView.module.css";

/**
 * O mapa da colmeia (F5.3, ADR-0020): a vista que mostra a iniciativa ativa
 * como ilhas ligadas por pontes, com os agentes como abelhas, as guardas nos
 * gates e as entregas como favos de mel. É a raiz da vista: junta o cabeçalho,
 * a cena (ou a lista equivalente), o feed, a legenda e o painel da ilha, e
 * liga as preferências da pessoa (mapa ou lista, noite ou dia, pausa).
 *
 * Só acompanha: nada aqui decide. Uma guarda acesa leva ao Cockpit (`onOpenDecision`), e o
 * mapa não grava nada (R6). O que ele desenha sai do `ColmeiaVM` pelo
 * modelo de cena puro; a vista não tem regra de negócio.
 */

/** O quanto esperar para um aviso ao leitor de tela depois do anterior (DS v2: no mínimo 5 s). */
export const ANNOUNCE_INTERVAL_MS = 5000;

export interface HiveMapViewProps {
  /** Voltar ao Cockpit (o botão e Esc). */
  onBack: () => void;
  /** Abrir a decisão no Cockpit, com o contexto da guarda. */
  onOpenDecision: (request: DecisionRequest) => void;
  /**
   * Escolher outra iniciativa no seletor do mapa. É só visão, como no Cockpit
   * (G15): quem monta troca a visão e o mapa nunca reescreve o `active:` do registro.
   */
  onSelectInitiative: (id: string) => void;
  /** A iniciativa que o Cockpit está vendo e o mapa mostra; sem ela, a ativa. */
  initiativeId?: string | null;
  /** Abelhas por ilha, para o teste de orçamento e o harness de estresse. */
  scene?: SceneOptions;
  /** Relógio de quadros e intervalo, para os testes medirem o atraso sem esperar tempo de verdade. */
  clock?: UseColmeiaOptions["clock"];
  /** Chamado a cada desenho aplicado (medição ponta a ponta). */
  onApplied?: UseColmeiaOptions["onApplied"];
  /** Quando a pessoa ainda não escolheu, a cena segue o tema claro do editor (decisão do titular; desligado por padrão). */
  followTheme?: boolean;
}

function useDocumentSignals(): { reducedMotion: boolean; screenReader: boolean; hidden: boolean; light: boolean } {
  const read = (): { reducedMotion: boolean; screenReader: boolean; hidden: boolean; light: boolean } => {
    const doc = {
      matchMedia: typeof window.matchMedia === "function" ? (q: string) => window.matchMedia(q) : undefined,
      bodyClasses: document.body.classList,
      rootMotion: document.documentElement.getAttribute("data-motion"),
      rootTheme: document.documentElement.getAttribute("data-theme"),
    };
    return { reducedMotion: readReducedMotion(doc), screenReader: readScreenReader(doc), hidden: document.visibilityState === "hidden", light: readLightTheme(doc) };
  };
  const [signals, setSignals] = useState(read);
  useEffect(() => {
    const update = (): void => setSignals(read());
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    media?.addEventListener?.("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      media?.removeEventListener?.("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return signals;
}

export function HiveMapView({ onBack, onOpenDecision, onSelectInitiative, initiativeId, scene, clock, onApplied, followTheme = false }: HiveMapViewProps) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  // ── O que a pessoa escolheu, lembrado no estado do webview ─────────────
  const [stored, setStored] = useState(() => {
    const p = getPersistedState();
    return { mode: p.mapMode, variant: p.mapScene };
  });
  const remember = (patch: { mapMode?: MapMode; mapScene?: SceneVariant }): void => setPersistedState({ ...getPersistedState(), ...patch });

  const signals = useDocumentSignals();
  const [userPaused, setUserPaused] = useState(false);
  const motion = resolveMotion({ reducedMotion: signals.reducedMotion, userPaused, hidden: signals.hidden });
  const paused = motion === "paused";

  const rootSize = useElementSize(root, { width: typeof window === "undefined" ? 1440 : window.innerWidth, height: 900 });
  const canvasSize = useElementSize(canvas, { width: 1440, height: 900 });
  const mode = resolveMapMode({ stored: stored.mode, screenReader: signals.screenReader, width: rootSize.width });
  const variant = resolveSceneVariant({ stored: stored.variant, followTheme, theme: { light: signals.light } });
  const size = sizeClass(rootSize.width);
  const fit = useMemo(() => fitStage(canvasSize.width, canvasSize.height), [canvasSize.width, canvasSize.height]);

  // ── O mapa, ao vivo ────────────────────────────────────────────────────
  const { view, waiting } = useColmeia({ paused, scene, initiativeId, clock, onApplied });
  const { vm, details, scene: model } = view;

  // ── Seleção, foco e teclado ────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tabStopId, setTabStopId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const selected = selectedId ? details.find((d) => d.islandId === selectedId) : undefined;

  // Trocar de iniciativa troca o mapa inteiro: a ilha aberta da anterior não existe mais, e nenhum painel sobra.
  const [shownInitiative, setShownInitiative] = useState(vm.initiativeId);
  if (shownInitiative !== vm.initiativeId) {
    setShownInitiative(vm.initiativeId);
    setSelectedId(null);
  }

  useEffect(() => {
    root.current?.querySelector<HTMLElement>("[data-map-title]")?.focus();
  }, []);

  const focusIsland = useCallback((id: string): void => {
    root.current?.querySelector<HTMLElement>(`button[data-island="${id}"]`)?.focus();
  }, []);

  const closePanel = useCallback((): void => {
    const id = selectedId;
    setSelectedId(null);
    // Esc e Fechar devolvem o foco à ilha (o painel sai do DOM, e o foco não pode se perder).
    if (id) requestAnimationFrame(() => focusIsland(id));
  }, [selectedId, focusIsland]);

  function onKeyDown(e: KeyboardEvent<HTMLElement>): void {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    if (selectedId && mode === "scene") closePanel();
    else onBack();
  }

  const openFile = (relPath: string): void => postMessage({ type: "openFile", relPath });
  const openDecision = (guard: ColmeiaGuard): void => {
    const island = vm.islands.find((i) => i.id === guard.islandId);
    onOpenDecision({ kind: guard.kind, reason: guard.reason, ...(guard.taskId ? { taskId: guard.taskId } : {}), ...(vm.initiativeId ? { initiativeId: vm.initiativeId } : {}), islandId: guard.islandId, islandLabel: island?.label ?? guard.islandId });
  };

  // ── O que o leitor de tela ouve ────────────────────────────────────────
  const [announcement, setAnnouncement] = useState("");
  const announcer = useRef<Announcer | null>(null);
  useEffect(() => {
    announcer.current = createAnnouncer(
      { now: () => Date.now(), setTimer: (cb, ms) => window.setTimeout(cb, ms), clearTimer: (h) => window.clearTimeout(h) },
      ANNOUNCE_INTERVAL_MS,
      setAnnouncement
    );
    return () => announcer.current?.dispose();
  }, []);
  useEffect(() => {
    if (paused) announcer.current?.clear();
  }, [paused]);
  const previous = useRef(view);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (before === view || paused) return;
    const important = announcementsFor(before.vm.initiativeId === null ? null : before.vm, view.vm);
    const news = before.vm.initiativeId === view.vm.initiativeId ? countActivity(before.events, view.events, view.vm.initiativeId) : 0;
    // O que já virou aviso por si (decisão, bloqueio, falha) não conta de novo no resumo da atividade.
    announcer.current?.push(important, Math.max(0, news - important.length));
  }, [view, paused]);

  // ── Favos que acabaram de encher (crescem uma vez) ─────────────────────
  const potKeys = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const now = new Set(model.islands.flatMap((i) => i.combs.filter((c) => c.filled).map((c) => c.key)));
    const before = potKeys.current;
    potKeys.current = now;
    if (!before) return;
    const added = [...now].filter((k) => !before.has(k));
    if (added.length === 0) return;
    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), 900);
    return () => clearTimeout(timer);
  }, [model]);

  // ── Peças da vista ─────────────────────────────────────────────────────
  const initiatives = view.snapshot?.initiatives;
  const active = initiatives?.initiatives.find((i) => i.id === vm.initiativeId);
  const current = vm.islands.find((i) => i.state === "current");
  const where = current ? [current.label, current.focus].filter(Boolean).join(" · ") : null;
  const working = vm.bees.filter((b) => b.state === "working").length;

  const header = (
    <MapHeader
      initiative={{
        id: vm.initiativeId,
        name: active?.name ?? (vm.flow === "foundation" ? "Descoberta do brownfield" : null),
        options: (initiatives?.initiatives ?? []).map((i) => ({ id: i.id, name: i.name })),
      }}
      onSelectInitiative={onSelectInitiative}
      where={where}
      working={working}
      waiting={waiting}
      paused={userPaused}
      onTogglePause={() => setUserPaused((p) => !p)}
      mode={mode}
      onMode={(next) => {
        setStored((st) => ({ ...st, mode: next }));
        remember({ mapMode: next });
      }}
      variant={variant}
      onVariant={() => {
        const next: SceneVariant = variant === "day" ? "night" : "day";
        setStored((st) => ({ ...st, variant: next }));
        remember({ mapScene: next });
      }}
      onBack={onBack}
      legendButton={size === "wide" ? undefined : { open: legendOpen, onToggle: () => setLegendOpen((o) => !o) }}
    />
  );

  const body = (() => {
    if (view.status === "booting" || !view.snapshot) {
      return (
        <p className={s.notice} role="status" aria-busy="true">
          Carregando o mapa…
        </p>
      );
    }
    if (vm.empty) {
      return (
        <div className={s.empty} data-map-empty>
          <span className={s.emptyMark}>
            <JataiMark size={56} decorative />
          </span>
          <h2 className={s.emptyTitle}>Sem iniciativa ativa</h2>
          <p className={s.emptyText}>
            {vm.empty.reason}. {vm.empty.hint}.
          </p>
          <Button variant="primary" size="lg" onClick={() => postMessage({ type: "openChat" })}>
            Abrir o chat
          </Button>
        </div>
      );
    }
    if (mode === "list") {
      return (
        <div className={s.scroll}>
          <ListMode vm={vm} details={details} onOpenFile={openFile} onOpenDecision={openDecision} paused={paused} />
        </div>
      );
    }
    return null;
  })();

  const showScene = mode === "scene" && !vm.empty && view.status !== "booting" && view.snapshot !== null;

  return (
    <section
      ref={root}
      className={s.root}
      data-scene=""
      data-scene-variant={variant}
      data-motion={motion}
      data-size={size}
      data-mode={mode}
      data-panel={selected && mode === "scene" ? "open" : undefined}
      aria-label="Mapa da colmeia"
      onKeyDown={onKeyDown}
    >
      {/* Um elemento só, com ou sem cena: o ResizeObserver fica nele e a cena se encaixa ao voltar da lista ou quando o snapshot chega. */}
      <div className={s.canvas} ref={canvas} aria-hidden={showScene ? undefined : "true"}>
        {showScene && <Stage scene={model} motion={motion} fit={fit} selectedId={selectedId} tabStopId={tabStopId} fresh={fresh} onToggle={(id) => setSelectedId((cur) => (cur === id ? null : id))} onTabStop={setTabStopId} />}
      </div>

      <div className={s.hud}>
        {header}
        {body}
      </div>

      {showScene && (
        <>
          <div className={s.feedSlot}>
            <LiveFeed feed={vm.feed} guards={vm.guards} limit={size === "wide" ? 4 : 1} paused={paused} />
          </div>
          {!selected && (size === "wide" || legendOpen) && (
            <div className={s.legendSlot}>
              <Legend />
            </div>
          )}
          {selected && (
            <div className={s.panelSlot}>
              <IslandPanel detail={selected} gateAfter={vm.bridges.find((b) => b.from === selected.islandId)} onClose={closePanel} onOpenFile={openFile} onOpenDecision={openDecision} />
            </div>
          )}
        </>
      )}

      <div role="status" aria-live="polite" aria-atomic="true" className={s.announcer} data-announcer>
        <VisuallyHidden>{announcement}</VisuallyHidden>
      </div>
    </section>
  );
}
