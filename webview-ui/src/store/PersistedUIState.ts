/**
 * PersistedUIState.ts
 *
 * O que sobrevive a um reload do painel via `vscode.getState()/setState()` —
 * puramente client-side, nunca faz round-trip com o host. É a resposta direta
 * ao bug estrutural que motivou este redesenho: no Cockpit antigo, qualquer
 * seção colapsada na mão morria a cada re-render (a cada ~4s).
 */
/**
 * Wave-3 de `mod-cockpit-flow-model` (roadmap): shell simplificada —
 * "Progresso" é a tela única do fluxo de iniciativa, "Operações" continua
 * dedicada. `mural`/`dashboard`/`timeline`/`graph`/`learning` existiram
 * até o item 3.7 — parked (fora de `ALL_COCKPIT_TABS`) no item 3.6,
 * componentes apagados de vez no 3.7. `getPersistedState()`
 * (`vscodeApi.ts`) já tinha o saneamento certo pra isso (aba persistida
 * que não existe mais cai no default) antes mesmo dessas abas serem
 * removidas — é o mesmo mecanismo que cobre qualquer build antiga.
 */
export type CockpitTab = "live-progress" | "operations";

/** Única fonte da lista de abas em runtime — `vscodeApi.ts` valida `activeTab`/`splitTab` persistidos contra isto; ícone continua local a cada componente (decoração, não pertence aqui). */
export const ALL_COCKPIT_TABS: CockpitTab[] = ["live-progress", "operations"];

/** Único rótulo por aba — `TabStrip`, `commandCatalog` (Onda 5) e o cabeçalho do painel dividido (Onda 5b) reusam isto em vez de cada um escrever o texto de novo. */
export const TAB_LABELS: Record<CockpitTab, string> = {
  "live-progress": "Progresso",
  operations: "Operações",
};

export interface PersistedUIState {
  activeTab: CockpitTab;
  collapsedSections: Record<string, boolean>;
  lastActiveInitiative?: string;
  tourDismissed?: boolean;
  /**
   * Lente ativa em Progresso: Descoberta (Foundation, workspace-wide) ou uma
   * iniciativa de Delivery. `undefined`/`true` = Descoberta (comportamento
   * atual, Discovery-first); `false` = Delivery da iniciativa ativa em
   * `snapshot.initiatives.active`. Nunca escrito em `initiatives.yaml` — é
   * puramente client-side, igual `activeTab`.
   */
  discoveryLensSelected?: boolean;
  /**
   * Onda 5b (Canvas dividido) — segunda aba fixada lado a lado com
   * `activeTab`, tipo grupo de editor do VS Code. `null`/ausente = sem
   * divisão (comportamento de sempre). Igual `activeTab`, nunca sai do
   * cliente — não é estado de delivery.
   */
  splitTab?: CockpitTab | null;
  /**
   * Qual iniciativa (ou a Descoberta do workspace) o Cockpit MOSTRA (F4.2, G15).
   * Só visão, do lado do cliente: nunca é o `active:` do `initiatives.yaml`,
   * que só muda por "Tornar ativa". Uma iniciativa que deixou de existir cai na ativa.
   */
  viewTarget?: { kind: "discovery" } | { kind: "initiative"; id: string };
  /** A parada (épico, onda, repositório, fase) que o quadro mostra. Uma que deixou de existir cai onde a missão está. */
  selectedStop?: string;
  /**
   * Mapa da colmeia (F5.3): como a pessoa prefere ver o mapa, em cena
   * isométrica ou em lista. Ausente = ela nunca escolheu; vale o padrão (lista
   * com leitor de tela ou em painel estreito, cena nos outros casos).
   */
  mapMode?: "scene" | "list";
  /** Mapa da colmeia (F5.3): a variante da cena. Ausente = crepúsculo, o padrão do DS v2. */
  mapScene?: "night" | "day";
}

export const DEFAULT_PERSISTED_STATE: PersistedUIState = {
  // Wave-3 de mod-cockpit-flow-model — Progresso é a home única agora; quem
  // tinha "mural"/"dashboard"/etc. persistido cai aqui via VALID_TABS
  // (vscodeApi.ts), nunca numa aba que sumiu da navegação.
  activeTab: "live-progress",
  collapsedSections: {},
};
