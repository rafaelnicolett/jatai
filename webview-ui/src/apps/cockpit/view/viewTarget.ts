/**
 * viewTarget.ts — qual iniciativa o Cockpit está MOSTRANDO (G15).
 *
 * "Navegar" para outra iniciativa é só visão: o alvo vive no cliente
 * (`vscode.setState`) e nunca reescreve o `active:` do `initiatives.yaml`.
 * Tornar uma iniciativa ativa é outra coisa, uma ação explícita que chama o
 * `switchInitiative` do host (o que o chat e o CodeLens passam a seguir).
 *
 * O resto do Cockpit pergunta ao `ViewContext`: a iniciativa vista, se ela é
 * a ativa e o que o registro sabe dela. O snapshot só carrega o estado de
 * delivery (fases, backlog de sprint) da iniciativa ATIVA; as iniciativas por
 * épicos ou ondas (modernização, hotfix) guardam tudo no próprio registro e
 * por isso têm o detalhe completo mesmo sem serem a ativa.
 */
import { activeInitiative, type ColmeiaSnapshot, type Initiative, type InitiativesState, type RunEvent } from "@data";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { isBrownfieldWorkspace } from "../../../store/activeLens";
import { usesWaveView } from "../../../features/delivery/computeModernizationBoard";

export type ViewTarget = { kind: "discovery" } | { kind: "initiative"; id: string };

export function sameTarget(a: ViewTarget | null | undefined, b: ViewTarget | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && (a.kind === "discovery" || (b.kind === "initiative" && a.id === b.id));
}

/**
 * O alvo que a tela mostra, dado o que a pessoa escolheu (`wanted`).
 * - uma iniciativa que existe vale ela mesma;
 * - a Descoberta vale em workspace brownfield (com ou sem repositório mapeado);
 * - sem escolha válida: a iniciativa ativa; sem ela, a Descoberta do workspace
 *   brownfield; sem nada disso, `null` (primeiro uso, sem o que mostrar).
 */
export function resolveViewTarget(snapshot: CockpitSnapshot | null, wanted: ViewTarget | null | undefined): ViewTarget | null {
  if (!snapshot) return null;
  const initiatives = snapshot.initiatives;
  const brownfield = isBrownfieldWorkspace(snapshot.config, snapshot.reposInventory);

  if (wanted?.kind === "initiative" && initiatives?.initiatives.some((i) => i.id === wanted.id)) return wanted;
  if (wanted?.kind === "discovery" && brownfield) return wanted;

  const active = activeInitiative(initiatives);
  if (active) return { kind: "initiative", id: active.id };
  return brownfield ? { kind: "discovery" } : null;
}

export interface ViewContext {
  snapshot: CockpitSnapshot;
  target: ViewTarget;
  /** A iniciativa vista (`undefined` na Descoberta). */
  initiative: Initiative | undefined;
  /** O `active:` real do registro, que a navegação nunca altera. */
  activeId: string | null;
  /** A iniciativa vista é a ativa. */
  isActive: boolean;
  /** Tem o detalhe completo: é a ativa, ou o registro dela já carrega as fases (épicos ou ondas). */
  detailLoaded: boolean;
  /** O que as funções do núcleo (`deriveColmeia`, `deriveWorkStatus`) leem: a iniciativa vista no lugar da ativa. */
  projected: ColmeiaSnapshot;
  /** Eventos da iniciativa vista (a ativa também lê os sem iniciativa, como o `deriveColmeia`). */
  events: RunEvent[];
}

function projectInitiatives(initiatives: InitiativesState | null, viewedId: string | undefined): InitiativesState | null {
  if (!initiatives || !viewedId || initiatives.active === viewedId) return initiatives;
  return { ...initiatives, active: viewedId };
}

export function buildViewContext(snapshot: CockpitSnapshot, target: ViewTarget): ViewContext {
  const initiatives = snapshot.initiatives;
  const activeId = initiatives?.active ?? null;
  const initiative = target.kind === "initiative" ? initiatives?.initiatives.find((i) => i.id === target.id) : undefined;
  const isActive = !!initiative && initiative.id === activeId;
  const viewedId = initiative?.id;

  return {
    snapshot,
    target,
    initiative,
    activeId,
    isActive,
    detailLoaded: !!initiative && (isActive || usesWaveView(initiative)),
    projected: {
      initiatives: projectInitiatives(initiatives, viewedId),
      foundationState: snapshot.foundationState,
      // O delivery-state do snapshot é o da iniciativa ativa: para outra, ele não vale.
      deliveryState: isActive || !initiative ? snapshot.deliveryState : null,
    },
    events: !initiative || isActive ? snapshot.runEvents : snapshot.runEvents.filter((e) => e.initiative_id === initiative.id),
  };
}
