/**
 * CockpitSnapshotBuilder.ts — monta o `CockpitSnapshot` (F3.8, passo CK2 da
 * análise: Extract Class + Introduce Parameter Object).
 *
 * As leituras ficam atrás da porta `CockpitDataSources`, chamadas sempre na
 * mesma ordem: os avisos de cada fonte (`warnings`) entram no snapshot na
 * ordem em que aparecem. As derivações (planos, atividade, status de trabalho,
 * notificações) são puras. O controller do painel só posta o resultado.
 */

import type { CockpitSnapshot, CockpitNotification, NotificationKind } from "../../shared/cockpit-protocol";
import type { HelyxConfig } from "../../types";
import type { DataSourceIssue, OnDataIssue } from "../../data/data-health";
import type { ReposInventory } from "../../data/repos-contract";
import type { FoundationState } from "../../data/foundation-state-contract";
import type { ContextReposMap } from "../../data/context-repos-contract";
import type { RepoGraph } from "../../data/repo-graph-contract";
import { deriveActivity, describeEvent, NOTIFICATION_HISTORY_EVENT_TYPES, type RunEvent } from "../../data/run-events-contract";
import { buildFoundationPlan, type FoundationPlan } from "../../data/foundation-plan";
import { activeInitiative, type InitiativesState } from "../../data/initiatives-contract";
import { synthesizeDeliveryStateFromPhase, type DeliveryState } from "../../data/delivery-state-contract";
import type { SprintBacklog } from "../../data/sprint-backlog-contract";
import type { OperationsSnapshot } from "../../data/operations-contract";
import { buildDeliveryPlan, type DeliveryPlan } from "../../data/delivery-plan";
import { deriveWorkStatus } from "../../core/plans/work-status-view";
import type { KitStatus } from "../../data/kit-version";
import type { AgentCatalogEntry } from "../../core/contracts/agent-directory.pure";

const NOTIFICATION_HISTORY_LIMIT = 30;

/** De onde o Cockpit lê cada domínio. A implementação de produção é `cockpitDataSources.ts`. */
export interface CockpitDataSources {
  loadConfig(): Promise<HelyxConfig | null>;
  isConfigured(): Promise<boolean>;
  loadRepos(root: string, onError: OnDataIssue): ReposInventory | null;
  loadFoundationState(root: string, onError: OnDataIssue): FoundationState | null;
  loadContextRepos(root: string, onError: OnDataIssue): ContextReposMap | null;
  loadRepoGraph(root: string, onError: OnDataIssue): RepoGraph | null;
  loadRunEvents(root: string, limit: number, onError: OnDataIssue): RunEvent[];
  readInitiatives(root: string, onError: OnDataIssue): Promise<InitiativesState | null>;
  readDeliveryState(root: string, initiativeId: string | undefined, onError: OnDataIssue): Promise<DeliveryState | null>;
  loadSprintBacklog(root: string, activeInitiativeId: string | undefined, onError: OnDataIssue): SprintBacklog | null;
  loadOperationsSnapshot(root: string, onError: OnDataIssue): OperationsSnapshot;
  kitStatus(root: string): KitStatus | null;
  /**
   * As responsabilidades dos agentes instalados (frontmatter), para o painel
   * da ilha do mapa (F5.3). Opcional: sem a fonte, o snapshot não leva o campo.
   */
  loadAgentCatalog?(root: string): AgentCatalogEntry[];
}

/** Configurações e estado de UI que entram no snapshot (Introduce Parameter Object). */
export interface CockpitViewSettings {
  approvalFrictionFields: string[];
  deliveryHierarchy: "legacy" | "epic-feature-backlog-task";
  /** Última vez que a central de notificações foi aberta (`globalState`). */
  notificationsLastSeenAt: string | null;
}

export interface CockpitBuild {
  snapshot: CockpitSnapshot;
  /** Os eventos lidos (janela de 200), para o cursor de eventos novos. */
  events: RunEvent[];
  foundationPlan: FoundationPlan;
  deliveryPlan: DeliveryPlan;
  kitStatus: KitStatus | null;
  warnings: DataSourceIssue[];
}

export class CockpitSnapshotBuilder {
  constructor(private readonly _sources: CockpitDataSources) {}

  async build(root: string, readSettings: () => CockpitViewSettings): Promise<CockpitBuild> {
    const sources = this._sources;
    const warnings: DataSourceIssue[] = [];
    const onError = (issue: DataSourceIssue): void => { warnings.push(issue); };

    const config = await sources.loadConfig().catch(() => null);
    const configured = config !== null || (await sources.isConfigured().catch(() => false));
    const reposInventory = sources.loadRepos(root, onError);
    const foundationState = sources.loadFoundationState(root, onError);
    const contextRepos = sources.loadContextRepos(root, onError);
    const repoGraph = sources.loadRepoGraph(root, onError);
    const events = sources.loadRunEvents(root, 200, onError);
    const liveActivity = deriveActivity(events);
    const foundationPlan = buildFoundationPlan(reposInventory, foundationState, liveActivity);
    // `initiatives` carrega ANTES do delivery — o delivery depende de saber qual está ativa.
    const initiatives = await sources.readInitiatives(root, onError);
    const activeId = initiatives?.active;
    const deliveryStateRaw = await sources.readDeliveryState(root, activeId, onError);
    const deliveryState = deliveryStateRaw ?? (activeId ? synthesizeDeliveryStateFromPhase(activeInitiative(initiatives)?.current_phase) : null);
    // F6.5 (ADR-0022): status e motivo do que foi registrado (nunca do delivery-state sintetizado), e aviso por status desconhecido.
    const workStatus = deriveWorkStatus(initiatives, deliveryStateRaw);
    for (const message of workStatus.warnings) onError({ source: "work-status", message });
    const sprintBacklog = sources.loadSprintBacklog(root, activeId, onError);
    const deliveryPlan = buildDeliveryPlan(deliveryState, sprintBacklog, liveActivity);
    const operations = sources.loadOperationsSnapshot(root, onError);
    const kitStatus = sources.kitStatus(root);
    const agents = sources.loadAgentCatalog?.(root) ?? [];
    const { approvalFrictionFields, deliveryHierarchy, notificationsLastSeenAt } = readSettings();

    const notifications: CockpitNotification[] = events
      .filter((e) => NOTIFICATION_HISTORY_EVENT_TYPES.has(e.event_type))
      .slice(-NOTIFICATION_HISTORY_LIMIT)
      .map((e) => ({
        id: `${e.timestamp}-${e.event_type}-${e.repo_id ?? ""}-${e.phase_id ?? ""}`,
        kind: e.event_type as NotificationKind,
        text: describeEvent(e),
        timestamp: e.timestamp,
      }))
      .reverse();

    const snapshot: CockpitSnapshot = {
      config,
      configured,
      reposInventory,
      foundationState,
      foundationPlan,
      liveActivity,
      runEvents: events,
      contextRepos,
      repoGraph,
      initiatives,
      deliveryState,
      deliveryPlan,
      sprintBacklog,
      operations,
      kitStatus,
      warnings,
      approvalFrictionFields,
      deliveryHierarchy,
      notifications,
      notificationsLastSeenAt,
      workStatus,
      // Aditivo (F5.3): só vai no snapshot quando há agente instalado com responsabilidade.
      ...(agents.length > 0 ? { agents } : {}),
    };

    return { snapshot, events, foundationPlan, deliveryPlan, kitStatus, warnings };
  }
}
