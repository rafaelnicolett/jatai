/**
 * snapshotBuilder.ts — monta um `CockpitSnapshot` a partir de strings YAML e
 * JSONL, pelos MESMOS parsers e derivações que o host usa (`parseInitiativesYaml`,
 * `parseFoundationState`, `buildFoundationPlan`, `deriveActivity`,
 * `buildDeliveryPlan`, `deriveWorkStatus`). Serve ao mock visual
 * (`cockpitScenarios.ts`) e aos testes do Cockpit: nenhum objeto de estado é
 * inventado à mão, só dado de mentira passando pelo pipeline real.
 *
 * Nunca importado pelo `main.tsx` de produção (só `mock/` e `tests/`).
 */
import {
  parseReposYaml,
  parseFoundationState,
  parseRunEvents,
  parseInitiativesYaml,
  parseDeliveryState,
  parseSprintBacklog,
  buildFoundationPlan,
  buildDeliveryPlan,
  deriveActivity,
  deriveWorkStatus,
  describeEvent,
  synthesizeDeliveryStateFromPhase,
  activeInitiative,
  NOTIFICATION_HISTORY_EVENT_TYPES,
  type DeliveryState,
} from "@data";
import type { CockpitSnapshot, CockpitNotification, NotificationKind } from "@shared/cockpit-protocol";

export interface SnapshotParts {
  /** Brownfield por padrão (é o fluxo da modernização). */
  mode?: "brownfield" | "greenfield";
  /** `false` = workspace sem config (primeiro uso). */
  configured?: boolean;
  initiativesYaml?: string;
  reposYaml?: string;
  foundationYaml?: string;
  /** Delivery-state da iniciativa ativa. Sem ele, o host sintetiza pela fase atual, como no `CockpitSnapshotBuilder`. */
  deliveryYaml?: string;
  sprintYaml?: string;
  /** Eventos de execução, um objeto por linha do JSONL. */
  events?: Array<Record<string, unknown>>;
  warnings?: Array<{ source: string; message: string }>;
  generatedAt?: string;
  notificationsLastSeenAt?: string | null;
  kitOutdated?: boolean;
}

export function buildSnapshot(parts: SnapshotParts = {}): CockpitSnapshot {
  const mode = parts.mode ?? "brownfield";
  const configured = parts.configured ?? true;
  const reposInventory = parts.reposYaml ? parseReposYaml(parts.reposYaml).inventory : null;
  const foundationState = parts.foundationYaml ? parseFoundationState(parts.foundationYaml) : null;
  const runEvents = parseRunEvents((parts.events ?? []).map((e) => JSON.stringify(e)).join("\n"));
  const liveActivity = deriveActivity(runEvents);
  const foundationPlan = buildFoundationPlan(reposInventory, foundationState, liveActivity);
  const initiatives = parts.initiativesYaml ? parseInitiativesYaml(parts.initiativesYaml).state : null;
  const deliveryRaw: DeliveryState | null = parts.deliveryYaml ? parseDeliveryState(parts.deliveryYaml) : null;
  const deliveryState = deliveryRaw ?? (initiatives ? synthesizeDeliveryStateFromPhase(activeInitiative(initiatives)?.current_phase) : null);
  const sprintBacklog = parts.sprintYaml ? parseSprintBacklog(parts.sprintYaml) : null;
  const deliveryPlan = buildDeliveryPlan(deliveryState, sprintBacklog, liveActivity);

  const notifications: CockpitNotification[] = runEvents
    .filter((e) => NOTIFICATION_HISTORY_EVENT_TYPES.has(e.event_type))
    .map((e) => ({
      id: `${e.timestamp}-${e.event_type}-${e.repo_id ?? ""}-${e.phase_id ?? ""}`,
      kind: e.event_type as NotificationKind,
      text: describeEvent(e),
      timestamp: e.timestamp,
    }))
    .reverse();

  return {
    config: configured ? { version: "1", project: { name: "Demo", slug: "demo", mode }, host_adapter: "claude" } : null,
    configured,
    operations: { devops: null, observability: null, incidents: null, sustain: null },
    reposInventory,
    foundationState,
    foundationPlan,
    liveActivity,
    runEvents,
    contextRepos: null,
    repoGraph: null,
    initiatives,
    deliveryState,
    deliveryPlan,
    sprintBacklog,
    kitStatus: { installed: "0.9.10", current: parts.kitOutdated ? "0.9.11" : "0.9.10", legacyConfigName: false, outdated: parts.kitOutdated ?? false },
    warnings: parts.warnings ?? [],
    approvalFrictionFields: ["merge_block", "known_bugs_pinned"],
    deliveryHierarchy: "epic-feature-backlog-task",
    notifications,
    notificationsLastSeenAt: parts.notificationsLastSeenAt ?? null,
    workStatus: deriveWorkStatus(initiatives, deliveryRaw),
  };
}
