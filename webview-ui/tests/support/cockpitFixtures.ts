import { buildSnapshot, type SnapshotParts } from "../../src/mock/snapshotBuilder";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";

/**
 * Dados sintéticos dos testes do Cockpit (F4.2, parte 2). Cada função devolve
 * YAML escrito à mão, que passa pelos mesmos parsers do host em
 * `buildSnapshot`: nada de objeto de estado inventado. Nomes e dados são
 * fictícios.
 */

const indent = (text: string, n: number): string =>
  text
    .split("\n")
    .map((l) => (l.trim() ? " ".repeat(n) + l : l))
    .join("\n");

export interface ModernizationOptions {
  id?: string;
  name?: string;
  /** `gate_d2` aprovado (e o roadmap e a matriz de risco também). */
  d2?: boolean;
  /** Só o roadmap aprovado, sem a matriz de risco e sem o D2. */
  roadmapOnly?: boolean;
  d3?: boolean;
  scope?: string[];
  epics?: string[];
  /** O conteúdo de `epic_status:` (YAML, sem recuo). */
  epicStatus?: string;
  type?: "modernization" | "hotfix" | "feature";
  mode?: "brownfield" | "greenfield";
  currentPhase?: string;
  status?: string;
}

export const EPICS_2 = ["epic-0: Fundação — repositório isolado e CI", "epic-1: Marca — identidade e brand.json"];

export function initiativeYaml(o: ModernizationOptions = {}): string {
  const lines: string[] = [
    `- id: ${o.id ?? "mod-x"}`,
    `  name: "${o.name ?? "Modernização X"}"`,
    `  status: ${o.status ?? "in-progress"}`,
    `  type: ${o.type ?? "modernization"}`,
    `  mode: ${o.mode ?? "brownfield"}`,
  ];
  if (o.currentPhase) lines.push(`  current_phase: ${o.currentPhase}`);
  if (o.scope) lines.push(`  scope: [${o.scope.join(", ")}]`);
  const epics = o.epics ?? (o.type === "feature" ? undefined : EPICS_2);
  if (epics) {
    lines.push(o.type === "hotfix" ? "  waves:" : "  epics:");
    for (const e of epics) lines.push(`    - "${e}"`);
  }
  if (o.d2 || o.roadmapOnly) lines.push(`  roadmap_gate: { status: approved }`);
  if (o.d2) {
    lines.push(`  risk_matrix_gate: { status: approved }`);
    lines.push(`  gate_d2: { status: approved, human_approved_at: "2026-11-14T12:00:00Z", by: "Pessoa Fictícia" }`);
  }
  if (o.d3) lines.push(`  gate_d3: { status: approved, human_approved_at: "2026-11-16T12:00:00Z", by: "Pessoa Fictícia" }`);
  if (o.epicStatus) {
    lines.push(o.type === "hotfix" ? "  wave_status:" : "  epic_status:");
    lines.push(indent(o.epicStatus, 4));
  }
  return lines.join("\n");
}

export function initiativesYaml(active: string, blocks: string[]): string {
  return `active: ${active}\ninitiatives:\n${blocks.map((b) => indent(b, 2)).join("\n")}\n`;
}

/** Repositório "api" com todas as fases do Foundation concluídas (menos o que `open` listar) e o D1 como pedido. */
export function foundationYaml(o: { open?: string[]; d1?: "approved" | "pending"; repo?: string } = {}): string {
  const repo = o.repo ?? "api";
  const open = new Set(o.open ?? []);
  const phase = (id: string, agent: string): string => `      ${id}: { status: ${open.has(id) ? "pending" : "done"}, agent: "${agent}", human_checklist: {} }`;
  return [
    "version: 2",
    "repos:",
    `  ${repo}:`,
    "    phases:",
    phase("tech-stack", "@tech-mapper"),
    phase("arch", "@arch-discoverer"),
    phase("coding-archaeology", "@coding-archaeologist"),
    phase("quality", "@quality-auditor"),
    phase("debt", "@debt-analyst"),
    "    gate_d1:",
    `      status: ${o.d1 ?? "pending"}`,
    "phases: {}",
    "",
  ].join("\n");
}

export const REPOS_YAML = `version: 1\nrepos:\n  - id: api\n    source: local-path\n    path: repos/api\n    has_frontend: false\n`;

export const EPIC_STATUS_RUNNING = `epic-0:
  status: in-progress
  items:
    task-1: { status: in-progress, summary: "Semear o repositório" }
    task-2: { status: pending, summary: "Kit canônico" }`;

/** Modernização ativa com D1 e D2 aprovados e o `epic-0` em andamento. */
export function modernizationSnapshot(o: ModernizationOptions & { parts?: SnapshotParts } = {}): CockpitSnapshot {
  const { parts, ...init } = o;
  return buildSnapshot({
    reposYaml: REPOS_YAML,
    foundationYaml: foundationYaml({ d1: "approved" }),
    initiativesYaml: initiativesYaml(init.id ?? "mod-x", [initiativeYaml({ d2: true, scope: ["api"], epicStatus: EPIC_STATUS_RUNNING, ...init })]),
    ...parts,
  });
}
