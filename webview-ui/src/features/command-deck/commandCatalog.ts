import { Radio, Wrench, Compass, Layers, MessageSquare, type LucideIcon } from "lucide-react";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { SHORTCUT_ACTIONS, visibleShortcutAsks } from "@data";
import { ICON_BY_SLUG } from "../../design-system/shortcutIcons";
import { dispatchShortcutAction } from "../../store/shortcutDispatch";
import { postMessage } from "../../store/vscodeApi";
import { ALL_COCKPIT_TABS, TAB_LABELS, type CockpitTab } from "../../store/PersistedUIState";
import { isBrownfieldWorkspace } from "../../store/activeLens";

export interface DeckCommand {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: string;
}

interface BuildDeckCommandsParams {
  snapshot: CockpitSnapshot | null;
  onTabChange: (tab: CockpitTab) => void;
  onOpenDiscovery: () => void;
  onOpenInitiative: (id: string) => void;
}

/** Ícone é a única decoração que não mora em `PersistedUIState.ts` (junto de `TAB_LABELS`) — mesma separação que `TabStrip.tsx` já usa. */
const TAB_ICONS: Record<CockpitTab, LucideIcon> = {
  "live-progress": Radio,
  operations: Wrench,
};

/**
 * Onda 5 (Command Deck) — "reaproveita as ações que já existem", de
 * verdade: `SHORTCUT_ACTIONS`/`visibleShortcutAsks`/`OPERATIONS_N1_ACTIONS`
 * são o MESMO catálogo que o painel de Operações usa (não um segundo
 * catálogo paralelo que pode divergir), e a navegação/troca de lente chama
 * as MESMAS funções que `ContextBar` já chama. O Deck é só uma superfície
 * de busca por cima do que já existia — nenhuma ação nova.
 *
 * Retorna `{ commands, run }` — `run` separado dos dados porque cada
 * comando pode precisar de um closure (trocar de iniciativa captura o id),
 * e misturar função dentro do objeto listado dificultaria testar o
 * CATÁLOGO (rótulos, grupos, contagem) sem precisar espiar callbacks.
 */
export function buildDeckCommands(params: BuildDeckCommandsParams): { commands: DeckCommand[]; run: (id: string) => void } {
  const { snapshot, onTabChange, onOpenDiscovery, onOpenInitiative } = params;
  const commands: DeckCommand[] = [];
  const runners = new Map<string, () => void>();

  const add = (cmd: DeckCommand, run: () => void): void => {
    commands.push(cmd);
    runners.set(cmd.id, run);
  };

  for (const tabId of ALL_COCKPIT_TABS) {
    add({ id: `nav-${tabId}`, label: `Ir para ${TAB_LABELS[tabId]}`, icon: TAB_ICONS[tabId], group: "Navegar" }, () => onTabChange(tabId));
  }

  if (isBrownfieldWorkspace(snapshot?.config ?? null, snapshot?.reposInventory ?? null)) {
    add({ id: "lens-discovery", label: "Abrir Descoberta", icon: Compass, group: "Iniciativas" }, onOpenDiscovery);
  }
  for (const initiative of snapshot?.initiatives?.initiatives ?? []) {
    add({ id: `lens-${initiative.id}`, label: `Trocar para ${initiative.name}`, icon: Layers, group: "Iniciativas" }, () => onOpenInitiative(initiative.id));
  }

  add({ id: "open-chat", label: "Abrir chat", icon: MessageSquare, group: "Ações" }, () => postMessage({ type: "openChat" }));

  for (const action of SHORTCUT_ACTIONS) {
    add(
      { id: `shortcut-${action.id}`, label: action.label, hint: action.hint, icon: ICON_BY_SLUG[action.icon], group: "Ações" },
      () => dispatchShortcutAction(action)
    );
  }
  const hasRepos = (snapshot?.reposInventory?.repos.length ?? 0) > 0;
  for (const ask of visibleShortcutAsks(hasRepos)) {
    add(
      { id: `ask-${ask.id}`, label: ask.label, hint: ask.hint, icon: ICON_BY_SLUG[ask.icon], group: "Perguntas prontas" },
      () => dispatchShortcutAction(ask)
    );
  }

  return { commands, run: (id: string) => runners.get(id)?.() };
}
