/**
 * context-repos-contract.pure.ts
 *
 * A metade pura de `context-repos-contract.ts` — zero `fs`/`path`, seguro para
 * bundle de webview (browser). Tipos, parsing e queries vivem aqui;
 * `loadContextRepos` (que toca disco) fica no arquivo original, que re-exporta
 * este módulo por inteiro para não quebrar nenhum consumidor existente.
 */

import { loadStateYaml } from "./state-yaml.shared.pure";
import type { ReposInventory } from "./repos-contract.pure";
import { isValidRepoId } from "./repos-contract.pure";
import { normalizeEnum } from "./enum-normalize.shared.pure";

/** Path canônico do mapa, relativo à raiz do workspace. */
export const CONTEXT_REPOS_PATH = [".github", "artifacts", "context-repos.yaml"] as const;
export const CONTEXT_REPOS_REL = CONTEXT_REPOS_PATH.join("/");

/**
 * `candidate` = proposto pelo `@domain-extractor`, aguardando o gate humano.
 * `accepted`  = aprovado — só estes viram agente de domínio.
 * `rejected`  = descartado no gate; preservado para auditoria (não some do arquivo).
 */
export type ContextStatus = "candidate" | "accepted" | "rejected";

/** Onde um contexto se materializa dentro de um repo. */
export interface ContextLocation {
  repo: string;
  /** Globs relativos à raiz do repo. `["**"]` = o repo inteiro. */
  paths: string[];
}

export interface BoundedContextEntry {
  /** kebab-case, único. Vira o nome do agente de domínio (`<slug>.agent.md`). */
  slug: string;
  name: string;
  status: ContextStatus;
  description?: string;
  /** N:N — um contexto pode viver em vários repos. Nunca vazio. */
  lives_in: ContextLocation[];
}

export interface ContextReposMap {
  version: number;
  contexts: BoundedContextEntry[];
}

/** Glob padrão quando o contexto ocupa o repo inteiro. */
const ALL_PATHS = ["**"];

const CONTEXT_STATUSES = ["candidate", "accepted", "rejected"] as const;

function toStatus(raw: unknown): ContextStatus {
  return normalizeEnum(raw, CONTEXT_STATUSES, "candidate");
}

function toPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...ALL_PATHS];
  const paths = raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
                   .map((p) => p.trim());
  return paths.length > 0 ? paths : [...ALL_PATHS];
}

/** Mesma regra do repo id: vira nome de agente e chave de artefato. */
export function isValidContextSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * Parseia o `context-repos.yaml`. Entradas inválidas são descartadas e
 * reportadas — um contexto sem `lives_in` é inútil (o agente não saberia onde
 * atuar) e um slug duplicado colidiria dois agentes de domínio.
 */
export function parseContextReposYaml(raw: string): { map: ContextReposMap; errors: string[] } {
  const errors: string[] = [];
  const empty: ContextReposMap = { version: 1, contexts: [] };

  let doc: unknown;
  try {
    doc = loadStateYaml(raw);
  } catch (err) {
    return { map: empty, errors: [`YAML inválido: ${(err as Error).message}`] };
  }

  if (!doc || typeof doc !== "object") return { map: empty, errors };
  const root = doc as { version?: unknown; contexts?: unknown };
  if (!Array.isArray(root.contexts)) return { map: empty, errors };

  const contexts: BoundedContextEntry[] = [];
  const seen = new Set<string>();

  for (const [i, item] of root.contexts.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`contexts[${i}]: entrada não é um objeto`);
      continue;
    }
    const c = item as Record<string, unknown>;
    const slug = typeof c.slug === "string" ? c.slug.trim() : "";

    if (!slug) { errors.push(`contexts[${i}]: 'slug' ausente`); continue; }
    if (!isValidContextSlug(slug)) { errors.push(`contexts[${i}]: slug '${slug}' não é kebab-case`); continue; }
    if (seen.has(slug)) { errors.push(`contexts[${i}]: slug '${slug}' duplicado`); continue; }

    const rawLocations = Array.isArray(c.lives_in) ? c.lives_in : [];
    const lives_in: ContextLocation[] = [];
    for (const loc of rawLocations) {
      if (!loc || typeof loc !== "object") continue;
      const l = loc as Record<string, unknown>;
      const repo = typeof l.repo === "string" ? l.repo.trim() : "";
      if (!repo) { errors.push(`contexts[${i}] '${slug}': lives_in com 'repo' ausente`); continue; }
      if (!isValidRepoId(repo)) { errors.push(`contexts[${i}] '${slug}': repo '${repo}' não é kebab-case`); continue; }
      lives_in.push({ repo, paths: toPaths(l.paths) });
    }

    if (lives_in.length === 0) {
      errors.push(`contexts[${i}] '${slug}': 'lives_in' vazio — o agente não saberia onde atuar`);
      continue;
    }

    seen.add(slug);
    contexts.push({
      slug,
      name: typeof c.name === "string" && c.name.trim() ? c.name.trim() : slug,
      status: toStatus(c.status),
      lives_in,
      ...(typeof c.description === "string" ? { description: c.description.trim() } : {}),
    });
  }

  return {
    map: { version: typeof root.version === "number" ? root.version : 1, contexts },
    errors,
  };
}

/** Só os aprovados no gate humano viram agente de domínio. */
export function acceptedContexts(map: ContextReposMap | null): BoundedContextEntry[] {
  return (map?.contexts ?? []).filter((c) => c.status === "accepted");
}

/** Onde este contexto vive. Usado pelo agente de domínio para saber onde atuar. */
export function reposForContext(map: ContextReposMap | null, slug: string): ContextLocation[] {
  return (map?.contexts ?? []).find((c) => c.slug === slug)?.lives_in ?? [];
}

/** Quais contextos este repo materializa. Um repo pode conter vários (N:N). */
export function contextsInRepo(map: ContextReposMap | null, repoId: string): BoundedContextEntry[] {
  return (map?.contexts ?? []).filter((c) => c.lives_in.some((l) => l.repo === repoId));
}

/**
 * Validação cruzada com o inventário: um contexto que aponta para repo
 * inexistente quebraria o agente em runtime. O parser sozinho não detecta —
 * ele não conhece o `repos.yaml`.
 */
export function validateAgainstInventory(
  map: ContextReposMap | null,
  inventory: ReposInventory | null
): string[] {
  const known = new Set((inventory?.repos ?? []).map((r) => r.id));
  const errors: string[] = [];
  for (const c of map?.contexts ?? []) {
    for (const l of c.lives_in) {
      if (!known.has(l.repo)) {
        errors.push(`contexto '${c.slug}': repo '${l.repo}' não existe em repos.yaml`);
      }
    }
  }
  return errors;
}
