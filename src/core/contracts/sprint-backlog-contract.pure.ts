/**
 * sprint-backlog-contract.pure.ts
 *
 * A metade pura de `sprint-backlog-contract.ts` — zero `fs`/`path`, segura
 * para o bundle do webview.
 *
 * O schema canônico está documentado em `.github/skills/task-manager/SKILL.md`
 * §1 (`meta:` + `sprints[].items[]`), mas nenhum writer de verdade o impõe —
 * `sprint-backlog.yaml` já foi observado em produção em pelo menos 4 formas
 * diferentes: (A) a canônica; (B) `items:` + `milestones:` soltos no topo,
 * sem `sprints:`; (C) `stories:` soltas, sem `status` nenhum; (D) igual a C,
 * mas com um valor de `status` improvisado (`covered_by_SLS`). O parser
 * normaliza tolerantemente as 4 — nunca lança, formato desconhecido vira
 * `null`.
 *
 * Formato canônico para escrita nova (ADR-0006/ADR-0007): Forma A. Não há,
 * hoje, nenhum writer que crie um `sprint-backlog.yaml` do zero (só
 * `sprint-backlog-writer.ts`, que faz upsert cirúrgico de `status` num item
 * já existente) — esta é só a decisão registrada para quando esse writer
 * existir. Leitura das 4 formas permanece suportada para sempre.
 *
 * `SprintItem.feature`/`feature_ref` já é, na prática real observada
 * (Forma B, ver `sprint-backlog-forma-b-milestones.yaml`), a ponte pro nível Feature da
 * hierarquia (ADR-0006) — não é campo novo. `epicRef` é o campo novo desta
 * iniciativa, ponte pro nível Epic: lido de `epic_ref` (explícito) ou de
 * `milestone` (mesmo campo já usado pra AGRUPAR itens na Forma B —
 * reaproveitado, não duplicado).
 */

import { loadStateYaml } from "./state-yaml.shared.pure";
import { normalizeEnum } from "./enum-normalize.shared.pure";

export type SprintItemStatus = "backlog" | "in-progress" | "review" | "done" | "blocked" | "descoped";

/** Espelho runtime de `SprintItemStatus` — fonte de validação pro CLI `helyx-state` (recusa valor fora do enum, diferente do parser abaixo, que degrada pra "backlog"). */
export const SPRINT_ITEM_STATUSES = ["backlog", "in-progress", "review", "done", "blocked", "descoped"] as const;

export interface SprintItem {
  id: string;
  title: string;
  status: SprintItemStatus;
  component?: string;
  feature?: string;
  size?: string;
  storyPoints?: number;
  dependsOn: string[];
  sprintId?: string;
  tags: string[];
  blockedReason?: string;
  /** Ponte pro nível Epic (ADR-0006). Lido de `epic_ref` ou de `milestone` (Forma B) — ver comentário do arquivo. */
  epicRef?: string;
}

export interface SprintGroup {
  id: string;
  name: string;
  goal?: string;
  items: SprintItem[];
}

export interface SprintBacklog {
  meta?: {
    product?: string;
    totalSprints?: number;
    sprintDurationWeeks?: number;
  };
  /** Sempre populado — formatos flat (B/C/D) viram UM grupo sintetizado. */
  sprints: SprintGroup[];
  /** Vista achatada de todos os itens, cruzando grupos — conveniência para KPIs. */
  items: SprintItem[];
}

function toStatus(raw: unknown): SprintItemStatus {
  return normalizeEnum(raw, SPRINT_ITEM_STATUSES, "backlog");
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function toItem(raw: unknown, sprintId?: string): SprintItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.title !== "string") return null;

  const storyPoints = typeof r.story_points === "number" ? r.story_points
    : typeof r.estimate === "number" ? r.estimate
    : undefined;

  return {
    id: r.id,
    title: r.title,
    status: toStatus(r.status),
    component: typeof r.component === "string" ? r.component : undefined,
    feature: typeof r.feature === "string" ? r.feature : typeof r.feature_ref === "string" ? r.feature_ref : undefined,
    size: typeof r.size === "string" ? r.size : typeof r.sizing === "string" ? r.sizing : undefined,
    storyPoints,
    dependsOn: toStringArray(r.depends_on),
    sprintId,
    tags: toStringArray(r.tags),
    blockedReason: typeof r.blocked_reason === "string" ? r.blocked_reason : undefined,
    epicRef: typeof r.epic_ref === "string" ? r.epic_ref : typeof r.milestone === "string" ? r.milestone : undefined,
  };
}

function toMeta(raw: unknown): SprintBacklog["meta"] {
  if (!raw || typeof raw !== "object") return undefined;
  const m = raw as Record<string, unknown>;
  return {
    product: typeof m.product === "string" ? m.product : undefined,
    totalSprints: typeof m.total_sprints === "number" ? m.total_sprints : undefined,
    sprintDurationWeeks: typeof m.sprint_duration_weeks === "number" ? m.sprint_duration_weeks : undefined,
  };
}

/** Forma A — canônica: `meta:` + `sprints: [{id,name,goal,priority,items[]}]`. */
function parseCanonical(doc: Record<string, unknown>): SprintBacklog | null {
  if (!Array.isArray(doc.sprints)) return null;

  const sprints: SprintGroup[] = doc.sprints
    .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as Record<string, unknown>).id === "string")
    .map((s) => {
      const id = s.id as string;
      const items = Array.isArray(s.items)
        ? s.items.map((it) => toItem(it, id)).filter((it): it is SprintItem => it !== null)
        : [];
      return {
        id,
        name: typeof s.name === "string" ? s.name : id,
        goal: typeof s.goal === "string" ? s.goal : undefined,
        items,
      };
    });

  if (sprints.length === 0) return null;
  return { meta: toMeta(doc.meta), sprints, items: sprints.flatMap((s) => s.items) };
}

/** Forma B — `items:` flat + `milestones: {M1: {name,goal}}`, sem `sprints:`. Agrupa por milestone. */
function parseMilestoneFlat(doc: Record<string, unknown>): SprintBacklog | null {
  if (!Array.isArray(doc.items)) return null;
  const milestones = (doc.milestones && typeof doc.milestones === "object" ? doc.milestones : {}) as Record<string, unknown>;

  const byMilestone = new Map<string, unknown[]>();
  for (const raw of doc.items) {
    if (!raw || typeof raw !== "object") continue;
    const key = typeof (raw as Record<string, unknown>).milestone === "string" ? (raw as Record<string, unknown>).milestone as string : "sem-milestone";
    if (!byMilestone.has(key)) byMilestone.set(key, []);
    byMilestone.get(key)!.push(raw);
  }
  if (byMilestone.size === 0) return null;

  const sprints: SprintGroup[] = [...byMilestone.entries()].map(([key, rawItems]) => {
    const m = milestones[key] as Record<string, unknown> | undefined;
    return {
      id: key,
      name: typeof m?.name === "string" ? m.name : key,
      goal: typeof m?.goal === "string" ? m.goal : undefined,
      items: rawItems.map((it) => toItem(it, key)).filter((it): it is SprintItem => it !== null),
    };
  });

  return { meta: undefined, sprints, items: sprints.flatMap((s) => s.items) };
}

/** Formas C/D — `stories:` soltas (com ou sem `status`), sem agrupamento nenhum. Vira UM grupo sintetizado. */
function parseFlatStories(doc: Record<string, unknown>): SprintBacklog | null {
  if (!Array.isArray(doc.stories)) return null;
  const groupId = typeof doc.sprint === "number" || typeof doc.sprint === "string" ? String(doc.sprint) : "S1";
  const items = doc.stories.map((it) => toItem(it, groupId)).filter((it): it is SprintItem => it !== null);
  if (items.length === 0) return null;

  return {
    meta: undefined,
    sprints: [{ id: groupId, name: typeof doc.initiative === "string" ? doc.initiative : groupId, items }],
    items,
  };
}

/** Parseia `sprint-backlog.yaml` tolerando as 4 formas reais já observadas. Nunca lança. */
export function parseSprintBacklog(raw: string): SprintBacklog | null {
  let doc: unknown;
  try {
    doc = loadStateYaml(raw, { json: true });
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  const root = doc as Record<string, unknown>;

  return parseCanonical(root) ?? parseMilestoneFlat(root) ?? parseFlatStories(root) ?? null;
}

/** Contagem de itens por status — alimenta o donut de Delivery no Dashboard. */
export function sprintStatusCounts(backlog: SprintBacklog | null): Record<SprintItemStatus, number> {
  const counts: Record<SprintItemStatus, number> = { backlog: 0, "in-progress": 0, review: 0, done: 0, blocked: 0, descoped: 0 };
  for (const item of backlog?.items ?? []) counts[item.status]++;
  return counts;
}

/**
 * Story points concluídos/total — só conta itens com `storyPoints` definido
 * (nem todo item real tem, mesmo no formato canônico); nunca inventa um
 * número pra quem não estimou.
 */
export function sprintPointsSummary(backlog: SprintBacklog | null): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const item of backlog?.items ?? []) {
    if (typeof item.storyPoints !== "number") continue;
    total += item.storyPoints;
    if (item.status === "done") done += item.storyPoints;
  }
  return { done, total };
}
