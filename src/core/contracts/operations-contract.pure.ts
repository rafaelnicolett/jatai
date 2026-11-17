/**
 * operations-contract.pure.ts
 *
 * Os 4 artefatos que o painel de Operações do Cockpit lê (ADR-0002,
 * `docs/adr/0002-operacoes-como-painel-continuo.md`) — escritos por
 * `@devops`/`@observability`/`@incident`/`@sustain`. Ao contrário dos
 * artefatos de Discovery/Delivery, estes não pertencem a nenhuma iniciativa
 * — são estado do workspace inteiro, contínuo, sem início/fim.
 *
 * Schema documentado nos próprios agentes
 * (`.claude/agents/operation/*.agent.md`, seção "Estrutura de
 * operations/*.yaml") — este parser é a implementação desse contrato, zero
 * `fs`/`path`, seguro para o bundle do webview.
 */

import { loadStateYaml } from "./state-yaml.shared.pure";

export const OPERATIONS_DIR = [".github", "artifacts", "operations"] as const;
export const DEVOPS_STATUS_PATH = [...OPERATIONS_DIR, "devops-status.yaml"] as const;
export const OBSERVABILITY_STATUS_PATH = [...OPERATIONS_DIR, "observability-status.yaml"] as const;
export const INCIDENTS_PATH = [...OPERATIONS_DIR, "incidents.yaml"] as const;
export const SUSTAIN_LOG_PATH = [...OPERATIONS_DIR, "sustain-log.yaml"] as const;

export type PipelineHealth = "green" | "yellow" | "red";
export interface RepoPipelineStatus {
  pipeline_health?: PipelineHealth;
  last_deploy?: { at: string; environment: string; status: string };
  iac_validated?: boolean;
}
export interface DevopsStatus {
  repos: Record<string, RepoPipelineStatus>;
  updated_at?: string;
}

export type HealthCheckStatus = "healthy" | "degraded" | "down";
export interface HealthCheck { service: string; status: HealthCheckStatus }
export type AlertSeverity = "warning" | "critical";
export interface ActiveAlert { id: string; severity: AlertSeverity; message: string; since: string }
export interface RepoObservability { health_checks: HealthCheck[]; active_alerts: ActiveAlert[] }
export interface ObservabilityStatus {
  repos: Record<string, RepoObservability>;
  updated_at?: string;
}

export type IncidentSeverity = "minor" | "major" | "critical";
export type IncidentStatus = "active" | "resolved";
export interface IncidentEntry {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  resolved_at?: string;
  post_mortem?: string;
}
export interface IncidentsLog {
  incidents: IncidentEntry[];
  updated_at?: string;
}

export interface SustainPatch {
  repo: string;
  kind: string;
  description: string;
  applied_at: string;
  pr?: string;
}
export interface SustainLog {
  patches: SustainPatch[];
  updated_at?: string;
}

/** Tudo que o painel de Operações precisa — um campo `null` significa "o agente ainda não escreveu nada", nunca dado fabricado. */
export interface OperationsSnapshot {
  devops: DevopsStatus | null;
  observability: ObservabilityStatus | null;
  incidents: IncidentsLog | null;
  sustain: SustainLog | null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function parseDevopsStatus(raw: string): { status: DevopsStatus; errors: string[] } {
  const empty: DevopsStatus = { repos: {} };
  let doc: unknown;
  try { doc = loadStateYaml(raw); } catch (err) { return { status: empty, errors: [`YAML inválido: ${(err as Error).message}`] }; }
  if (!doc || typeof doc !== "object") return { status: empty, errors: [] };
  const root = doc as { repos?: unknown; updated_at?: unknown };
  const repos: Record<string, RepoPipelineStatus> = {};
  if (root.repos && typeof root.repos === "object") {
    for (const [repoId, entry] of Object.entries(root.repos as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const health = e.pipeline_health;
      const deploy = e.last_deploy as Record<string, unknown> | undefined;
      repos[repoId] = {
        ...(health === "green" || health === "yellow" || health === "red" ? { pipeline_health: health } : {}),
        ...(deploy && typeof deploy === "object" && asString(deploy.at)
          ? { last_deploy: { at: asString(deploy.at)!, environment: asString(deploy.environment) ?? "unknown", status: asString(deploy.status) ?? "unknown" } }
          : {}),
        ...(typeof e.iac_validated === "boolean" ? { iac_validated: e.iac_validated } : {}),
      };
    }
  }
  return { status: { repos, ...(asString(root.updated_at) ? { updated_at: asString(root.updated_at) } : {}) }, errors: [] };
}

export function parseObservabilityStatus(raw: string): { status: ObservabilityStatus; errors: string[] } {
  const empty: ObservabilityStatus = { repos: {} };
  let doc: unknown;
  try { doc = loadStateYaml(raw); } catch (err) { return { status: empty, errors: [`YAML inválido: ${(err as Error).message}`] }; }
  if (!doc || typeof doc !== "object") return { status: empty, errors: [] };
  const root = doc as { repos?: unknown; updated_at?: unknown };
  const repos: Record<string, RepoObservability> = {};
  if (root.repos && typeof root.repos === "object") {
    for (const [repoId, entry] of Object.entries(root.repos as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const healthChecks = Array.isArray(e.health_checks)
        ? e.health_checks
            .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
            .map((h) => ({ service: asString(h.service) ?? "unknown", status: (h.status as HealthCheckStatus) ?? "down" }))
            .filter((h) => ["healthy", "degraded", "down"].includes(h.status))
        : [];
      const activeAlerts = Array.isArray(e.active_alerts)
        ? e.active_alerts
            .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
            .map((a) => ({ id: asString(a.id) ?? "", severity: (a.severity as AlertSeverity) ?? "warning", message: asString(a.message) ?? "", since: asString(a.since) ?? "" }))
            .filter((a) => a.id && a.message)
        : [];
      repos[repoId] = { health_checks: healthChecks, active_alerts: activeAlerts };
    }
  }
  return { status: { repos, ...(asString(root.updated_at) ? { updated_at: asString(root.updated_at) } : {}) }, errors: [] };
}

export function parseIncidentsLog(raw: string): { log: IncidentsLog; errors: string[] } {
  const empty: IncidentsLog = { incidents: [] };
  let doc: unknown;
  try { doc = loadStateYaml(raw); } catch (err) { return { log: empty, errors: [`YAML inválido: ${(err as Error).message}`] }; }
  if (!doc || typeof doc !== "object") return { log: empty, errors: [] };
  const root = doc as { incidents?: unknown; updated_at?: unknown };
  const errors: string[] = [];
  const incidents: IncidentEntry[] = [];
  if (Array.isArray(root.incidents)) {
    for (const [i, item] of root.incidents.entries()) {
      if (!item || typeof item !== "object") { errors.push(`incidents[${i}]: entrada não é um objeto`); continue; }
      const it = item as Record<string, unknown>;
      const id = asString(it.id);
      const title = asString(it.title);
      const startedAt = asString(it.started_at);
      if (!id || !title || !startedAt) { errors.push(`incidents[${i}]: 'id'/'title'/'started_at' obrigatórios`); continue; }
      const severity = it.severity;
      const status = it.status;
      incidents.push({
        id,
        title,
        severity: severity === "minor" || severity === "major" || severity === "critical" ? severity : "minor",
        status: status === "resolved" ? "resolved" : "active",
        started_at: startedAt,
        ...(asString(it.resolved_at) ? { resolved_at: asString(it.resolved_at) } : {}),
        ...(asString(it.post_mortem) ? { post_mortem: asString(it.post_mortem) } : {}),
      });
    }
  }
  return { log: { incidents, ...(asString(root.updated_at) ? { updated_at: asString(root.updated_at) } : {}) }, errors };
}

export function parseSustainLog(raw: string): { log: SustainLog; errors: string[] } {
  const empty: SustainLog = { patches: [] };
  let doc: unknown;
  try { doc = loadStateYaml(raw); } catch (err) { return { log: empty, errors: [`YAML inválido: ${(err as Error).message}`] }; }
  if (!doc || typeof doc !== "object") return { log: empty, errors: [] };
  const root = doc as { patches?: unknown; updated_at?: unknown };
  const errors: string[] = [];
  const patches: SustainPatch[] = [];
  if (Array.isArray(root.patches)) {
    for (const [i, item] of root.patches.entries()) {
      if (!item || typeof item !== "object") { errors.push(`patches[${i}]: entrada não é um objeto`); continue; }
      const it = item as Record<string, unknown>;
      const repo = asString(it.repo);
      const description = asString(it.description);
      const appliedAt = asString(it.applied_at);
      if (!repo || !description || !appliedAt) { errors.push(`patches[${i}]: 'repo'/'description'/'applied_at' obrigatórios`); continue; }
      patches.push({
        repo,
        kind: asString(it.kind) ?? "patch",
        description,
        applied_at: appliedAt,
        ...(asString(it.pr) ? { pr: asString(it.pr) } : {}),
      });
    }
  }
  return { log: { patches, ...(asString(root.updated_at) ? { updated_at: asString(root.updated_at) } : {}) }, errors };
}

/** Nenhum dos 4 blocos existe ainda — estado inicial legítimo (agentes de Operation ainda não escreveram nada), não um erro. */
export function hasAnyOperationsData(snapshot: OperationsSnapshot | null): boolean {
  if (!snapshot) return false;
  return Boolean(
    (snapshot.devops && Object.keys(snapshot.devops.repos).length > 0) ||
    (snapshot.observability && Object.keys(snapshot.observability.repos).length > 0) ||
    (snapshot.incidents && snapshot.incidents.incidents.length > 0) ||
    (snapshot.sustain && snapshot.sustain.patches.length > 0)
  );
}
