import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "./shell/AppShell/AppShell";
import { ContextBar } from "./shell/ContextBar/ContextBar";
import { CommandDeck } from "./shell/CommandDeck/CommandDeck";
import { HiveMapView } from "./map/HiveMapView";
import { MapErrorBoundary } from "./map/MapErrorBoundary";
import { ErrorBoundary } from "./shell/ErrorBoundary/ErrorBoundary";
import { CockpitScreen, PageEmpty } from "./screens/CockpitScreen";
import { LiveRegion } from "./view/LiveRegion";
import { useAnnouncer } from "./view/useAnnouncer";
import { useViewState } from "./view/useViewState";
import { sameTarget } from "./view/viewTarget";
import { buildCockpitModel, type CockpitModel } from "./view/cockpitModel";
import { deriveConnection } from "./view/connection";
import { connectionEmpty, viewEmpty } from "./view/emptyStates";
import { DegradedDataBanner } from "../../design-system/patterns/DegradedDataBanner/DegradedDataBanner";
import { Button } from "../../design-system/primitives";
import { OperationsView } from "../../features/operations/OperationsView";
import { buildDeckCommands } from "../../features/command-deck/commandCatalog";
import { cockpitStore, type DecisionRequest } from "../../store/CockpitStore";
import { useCockpitSelector } from "../../store/useCockpitSelector";
import { getPersistedState, postMessage, setPersistedState } from "../../store/vscodeApi";
import { isBrownfieldWorkspace } from "../../store/activeLens";
import type { CockpitTab } from "../../store/PersistedUIState";
import type { EmptyAction } from "./view/emptyStates";
import s from "./ShellRoot.module.css";

/** Quanto o painel espera sem snapshot, em ms, contado de um tique por segundo só enquanto espera. */
function useWaitedMs(booting: boolean): number {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!booting) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [booting]);
  return booting ? now - start : 0;
}

/** O que a derivação do modelo devolveu: o modelo, ou o erro que ela lançou. */
type Built = { model: CockpitModel } | { error: Error };

/** Relança, no render, o erro da derivação: só assim o ErrorBoundary o segura. */
function Screen({ built, ...props }: { built: Built } & Omit<ComponentProps<typeof CockpitScreen>, "model">) {
  if ("error" in built) throw built.error;
  return <CockpitScreen model={built.model} {...props} />;
}

interface ShellRootProps {
  /**
   * O botão "Mapa" da barra superior. Por padrão o ShellRoot liga a troca de
   * vista Cockpit ↔ Mapa da colmeia (F5.3); quem monta pode trocar a ação.
   */
  onOpenMap?: () => void;
}

/**
 * A raiz de verdade da árvore React — montada UMA VEZ por `main.tsx`.
 *
 * - a visão (qual iniciativa a tela mostra e qual parada o quadro abre) é do
 *   cliente e nunca reescreve o `active:` do registro (G15, `useViewState`);
 *   "Tornar ativa" é uma ação explícita;
 * - a espera pelo primeiro snapshot tem prazo, e sem pasta aberta o host avisa:
 *   cada estado vazio explica e traz uma ação (G9);
 * - o `ErrorBoundary` envolve a tela, e a barra superior sobrevive a uma falha;
 * - o painel de Operações (contínuo, ADR-0002) é a outra página, acessível pela
 *   trilha e pelo ⌘K;
 * - o mapa da colmeia (F5.3) abre por cima do Cockpit sem desmontá-lo: a escolha
 *   Cockpit × Mapa mora no store (`view`), e é outra coisa que a visão da
 *   iniciativa de `useViewState`.
 */
export function ShellRoot({ onOpenMap }: ShellRootProps = {}) {
  const snapshot = useCockpitSelector((st) => st.snapshot);
  const status = useCockpitSelector((st) => st.status);
  const degraded = useCockpitSelector((st) => st.degraded);
  const seq = useCockpitSelector((st) => st.seq);

  const [activeTab, setActiveTabState] = useState<CockpitTab>(() => getPersistedState().activeTab);
  const [deckOpen, setDeckOpen] = useState(false);
  const view = useViewState(snapshot);
  // Qual vista está à frente: as telas de sempre ou o mapa da colmeia (F5.3).
  const mapOpen = useCockpitSelector((st) => st.view === "map");
  const opener = useRef<HTMLElement | null>(null);
  const { message, announce } = useAnnouncer();
  const waitedMs = useWaitedMs(status === "booting");

  const setActiveTab = (tab: CockpitTab): void => {
    setActiveTabState(tab);
    setPersistedState({ ...getPersistedState(), activeTab: tab });
  };

  // O Cockpit não é desmontado enquanto o mapa está aberto: o CSS só o esconde (`html[data-view="map"]`, em index.css),
  // então a visão, a parada e a aba voltam como estavam.
  useEffect(() => {
    document.documentElement.setAttribute("data-view", mapOpen ? "map" : "cockpit");
    return () => document.documentElement.removeAttribute("data-view");
  }, [mapOpen]);

  /** Abre o mapa, guardando quem abriu para devolver o foco a ele na volta. */
  const openMap = (): void => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cockpitStore.setView("map");
  };
  const backToCockpit = (): void => {
    cockpitStore.setView("cockpit");
    requestAnimationFrame(() => opener.current?.focus());
  };

  // Trocar a visão pousa no Cockpit, a página principal; nunca troca a iniciativa ativa (G15).
  const openInitiative = (id: string): void => {
    view.setTarget({ kind: "initiative", id });
    setActiveTab("live-progress");
  };
  const openDiscovery = (): void => {
    view.setTarget({ kind: "discovery" });
    setActiveTab("live-progress");
  };

  /** Uma guarda acesa do mapa pede a decisão: o Cockpit volta à frente, na iniciativa do mapa, e o painel de decisão abre (ver `useMapDecisionRequest`). */
  const openMapDecision = (request: DecisionRequest): void => {
    if (request.initiativeId && !sameTarget(view.target, { kind: "initiative", id: request.initiativeId })) openInitiative(request.initiativeId);
    else setActiveTab("live-progress");
    cockpitStore.requestDecision(request);
  };

  const { commands: deckCommands, run: runDeckCommand } = buildDeckCommands({ snapshot, onTabChange: setActiveTab, onOpenDiscovery: openDiscovery, onOpenInitiative: openInitiative });

  const connection = deriveConnection({ status, configured: snapshot?.configured ?? false, degraded, waitedMs });
  const isBrownfield = isBrownfieldWorkspace(snapshot?.config ?? null, snapshot?.reposInventory ?? null);

  // A derivação do modelo é o lugar mais provável de uma exceção (ela lê o snapshot): o erro fica guardado e é
  // relançado DENTRO do ErrorBoundary (`Screen`), para a barra e o resto da página seguirem vivos (G9).
  const [attempt, setAttempt] = useState(0);
  const built = useMemo<Built | null>(() => {
    if (!snapshot || !view.target || connection.kind !== "ready") return null;
    try {
      return { model: buildCockpitModel(snapshot, view.target, view.selectedStop) };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
    // `attempt` só existe para "Tentar de novo" refazer a derivação com o mesmo snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, view.target, view.selectedStop, connection.kind, attempt]);
  const model = built && "model" in built ? built.model : null;

  const run = (action: EmptyAction): { label: string; onClick: () => void } => ({ label: action.label, onClick: () => postMessage(action.message) });
  const pageEmpty = connectionEmpty(connection) ?? (snapshot ? viewEmpty(snapshot, view.target) : null);

  let content;
  if (pageEmpty) {
    content = <PageEmpty title={pageEmpty.title} body={pageEmpty.body} busy={pageEmpty.busy} action={pageEmpty.action ? run(pageEmpty.action) : undefined} />;
  } else if (activeTab === "operations" && snapshot) {
    content = (
      <div className={s.operations}>
        <Button variant="accent" icon={<ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />} onClick={() => setActiveTab("live-progress")}>
          Voltar ao Cockpit
        </Button>
        <ErrorBoundary resetKey="operations" label="O painel de Operações">
          <OperationsView snapshot={snapshot} />
        </ErrorBoundary>
      </div>
    );
  } else if (built && view.target) {
    // Navegar ou receber um snapshot novo limpa o erro: uma tela que falhou não segue para a próxima.
    const key = `${view.target.kind}:${view.target.kind === "initiative" ? view.target.id : ""}:${seq}`;
    content = (
      <ErrorBoundary resetKey={key} label="O Cockpit" onRetry={() => setAttempt((n) => n + 1)}>
        <Screen built={built} onSelectStop={view.setSelectedStop} onOpenOperations={() => setActiveTab("operations")} announce={announce} />
      </ErrorBoundary>
    );
  } else {
    content = null;
  }

  const notifications = snapshot?.notifications ?? [];
  const kit = snapshot?.kitStatus;

  return (
    <>
      <AppShell
        bar={
          <ContextBar
            config={snapshot?.config ?? null}
            isBrownfield={isBrownfield}
            initiatives={snapshot?.initiatives ?? null}
            target={view.target}
            onSelectTarget={(t) => (t.kind === "discovery" ? openDiscovery() : openInitiative(t.id))}
            onOpenMap={onOpenMap ?? openMap}
            onOpenCommands={() => setDeckOpen(true)}
            notifications={notifications}
            notificationsLastSeenAt={snapshot?.notificationsLastSeenAt ?? null}
            pendingDecisions={model?.agora.waiting.length ?? 0}
            kitNotice={kit?.outdated ? { installed: kit.installed ?? "?", current: kit.current } : null}
            connected={!!snapshot}
          />
        }
        banner={<DegradedDataBanner issues={degraded.filter((d) => d.source !== "workspace")} />}
        deck={<CommandDeck commands={deckCommands} run={runDeckCommand} open={deckOpen} onOpenChange={setDeckOpen} />}
        live={<LiveRegion message={message} />}
      >
        {content}
      </AppShell>
      {mapOpen && (
        <MapErrorBoundary onBack={backToCockpit}>
          <HiveMapView onBack={backToCockpit} onOpenDecision={openMapDecision} onSelectInitiative={openInitiative} initiativeId={view.target?.kind === "initiative" ? view.target.id : undefined} />
        </MapErrorBoundary>
      )}
    </>
  );
}

