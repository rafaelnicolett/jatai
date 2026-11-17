/**
 * repos-contract.pure.ts
 *
 * A metade pura de `repos-contract.ts` — zero `fs`/`path`, seguro para bundle
 * de webview (browser). Tipos, parsing e queries vivem aqui; `loadRepos` e
 * `getRepoDir` (que tocam disco) ficam no arquivo original, que re-exporta
 * este módulo por inteiro para não quebrar nenhum consumidor existente.
 */

import { loadStateYaml } from "./state-yaml.shared.pure";

/** Path canônico do inventário, relativo à raiz do workspace. */
export const REPOS_PATH = [".github", "artifacts", "repos.yaml"] as const;
export const REPOS_REL = REPOS_PATH.join("/");

/** Pasta onde os repos são materializados (`repos/<id>/`). Sempre gitignored. */
export const REPOS_DIR = "repos";

/** `git` = clonado a partir de `url`. `local-path` = já existe no disco, não clonar. */
export type RepoSource = "git" | "local-path";

/**
 * Profundidade do assessment por repo. Nem todo repo merece arqueologia
 * profunda — é o que evita que 20 repos custem 20× em tempo e tokens.
 */
export type ScanProfile = "deep" | "shallow" | "ignore";

export interface RepoEntry {
  /** kebab-case, único. É a chave em todos os artefatos e o nome da pasta em `repos/<id>/`. */
  id: string;
  source: RepoSource;
  /** Obrigatório quando `source: git`. */
  url?: string;
  /** Obrigatório quando `source: local-path`. Absoluto ou relativo ao workspace. */
  path?: string;
  /** Branch/tag a materializar. Default: default branch do remote. */
  ref?: string;
  /** Commit assessado. Preenchido no clone — sem ele os findings apodrecem. */
  pinned_sha?: string;
  scan_profile: ScanProfile;
  owner?: string;

  /**
   * O repositório tem histórico git?
   *
   * `false` = **snapshot morto**: uma pasta de código sem `.git` (o caso do
   * cliente que manda um zip, ou do "Download ZIP" do GitHub). Detectado pelo
   * sync, nunca declarado à mão.
   *
   * Isto **não é detalhe**: sem histórico, `churn × complexidade` (hotspot) e a
   * arqueologia de PRs antigos ficam indisponíveis. Se o campo não existisse, os
   * agentes inventariam ou omitiriam esses achados em silêncio.
   */
  has_history?: boolean;
  /**
   * Âncora de versão de um snapshot — hash do conteúdo, no lugar do `pinned_sha`.
   *
   * Um snapshot não tem commit, mas um finding `arquivo:linha` ainda precisa
   * dizer *sobre qual versão* foi gerado. Sem isso, ninguém consegue reproduzir
   * ou conferir o achado depois.
   */
  content_sha?: string;

  // ── Descobertos pelo assessment (não declarar à mão) ──
  /** `@tech-mapper` — resolve qual `@backend-{stack}` / `@frontend-{stack}` usar. */
  stack?: string;
  /** `@arch-discoverer` — padrão que o repo **é** hoje. Nunca um alvo. */
  arch_current?: string;
  /** Confiança de `arch_current`, 0–100. */
  arch_confidence?: number;
  /**
   * O repositório tem frontend? Preenchido pelo `@tech-mapper`.
   *
   * Decide se a fase de design (`@design-archaeologist`) roda: um `billing-api`
   * sem tela não tem design a arqueologar. `undefined` = ainda não sabido (antes
   * do tech-mapper) → o plano mostra a fase por precaução, e ela some se vier `false`.
   */
  has_frontend?: boolean;
}

export interface ReposInventory {
  version: number;
  repos: RepoEntry[];
}

const DEFAULT_SCAN_PROFILE: ScanProfile = "deep";

function toScanProfile(raw: unknown): ScanProfile {
  switch (String(raw ?? "").trim()) {
    case "shallow": return "shallow";
    case "ignore":  return "ignore";
    case "deep":    return "deep";
    default:        return DEFAULT_SCAN_PROFILE;
  }
}

function toSource(raw: unknown): RepoSource {
  return String(raw ?? "").trim() === "local-path" ? "local-path" : "git";
}

/** Aceita apenas kebab-case: vira nome de pasta em `repos/<id>/` e chave de artefato. */
export function isValidRepoId(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

/**
 * Parseia o `repos.yaml`. Entradas inválidas (sem `id`, com `id` malformado,
 * duplicado, ou sem a fonte exigida pelo `source`) são descartadas e reportadas
 * em `errors` — nunca silenciosamente aceitas, porque um `id` errado corromperia
 * o path de todos os artefatos daquele repo.
 */
export function parseReposYaml(raw: string): { inventory: ReposInventory; errors: string[] } {
  const errors: string[] = [];
  const empty: ReposInventory = { version: 1, repos: [] };

  let doc: unknown;
  try {
    doc = loadStateYaml(raw);
  } catch (err) {
    return { inventory: empty, errors: [`YAML inválido: ${(err as Error).message}`] };
  }

  if (!doc || typeof doc !== "object") return { inventory: empty, errors };
  const root = doc as { version?: unknown; repos?: unknown };
  if (!Array.isArray(root.repos)) return { inventory: empty, errors };

  const repos: RepoEntry[] = [];
  const seen = new Set<string>();

  for (const [i, item] of root.repos.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`repos[${i}]: entrada não é um objeto`);
      continue;
    }
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";

    if (!id) { errors.push(`repos[${i}]: 'id' ausente`); continue; }
    if (!isValidRepoId(id)) { errors.push(`repos[${i}]: id '${id}' não é kebab-case`); continue; }
    if (seen.has(id)) { errors.push(`repos[${i}]: id '${id}' duplicado`); continue; }

    const source = toSource(r.source);
    const url = typeof r.url === "string" ? r.url.trim() : undefined;
    const repoPath = typeof r.path === "string" ? r.path.trim() : undefined;

    if (source === "git" && !url) { errors.push(`repos[${i}] '${id}': source 'git' exige 'url'`); continue; }
    if (source === "local-path" && !repoPath) { errors.push(`repos[${i}] '${id}': source 'local-path' exige 'path'`); continue; }

    seen.add(id);
    repos.push({
      id,
      source,
      scan_profile: toScanProfile(r.scan_profile),
      ...(url ? { url } : {}),
      ...(repoPath ? { path: repoPath } : {}),
      ...(typeof r.ref === "string" ? { ref: r.ref.trim() } : {}),
      ...(typeof r.pinned_sha === "string" ? { pinned_sha: r.pinned_sha.trim() } : {}),
      ...(typeof r.owner === "string" ? { owner: r.owner.trim() } : {}),
      ...(typeof r.has_history === "boolean" ? { has_history: r.has_history } : {}),
      ...(typeof r.content_sha === "string" ? { content_sha: r.content_sha.trim() } : {}),
      ...(typeof r.stack === "string" ? { stack: r.stack.trim() } : {}),
      ...(typeof r.arch_current === "string" ? { arch_current: r.arch_current.trim() } : {}),
      ...(typeof r.arch_confidence === "number" ? { arch_confidence: r.arch_confidence } : {}),
      ...(typeof r.has_frontend === "boolean" ? { has_frontend: r.has_frontend } : {}),
    });
  }

  return {
    inventory: { version: typeof root.version === "number" ? root.version : 1, repos },
    errors,
  };
}

/** Repos que entram no assessment (`ignore` fica de fora). */
export function scannableRepos(inventory: ReposInventory | null): RepoEntry[] {
  return (inventory?.repos ?? []).filter((r) => r.scan_profile !== "ignore");
}

/**
 * Grava um campo na entrada de um repo **preservando o arquivo original**.
 *
 * Reserializar com `yaml.dump()` apagaria os comentários e a ordem escritos pelo
 * `@assessor` — o `repos.yaml` é um artefato que o humano lê e revisa, não um
 * blob de dados. Por isso a edição é cirúrgica, linha a linha.
 *
 * Devolve o conteúdo inalterado se o repo não existir no arquivo.
 */
export function upsertRepoField(
  yamlContent: string,
  repoId: string,
  field: string,
  value: string | boolean | number
): string {
  const lines = yamlContent.split("\n");

  // Início da entrada: `  - id: <repoId>`
  const startIdx = lines.findIndex((l) => new RegExp(`^\\s*-\\s+id:\\s*["']?${escapeRegExp(repoId)}["']?\\s*$`).test(l));
  if (startIdx === -1) return yamlContent;

  const itemIndent = lines[startIdx]!.match(/^(\s*)-/)?.[1] ?? "";
  // Campos ficam alinhados sob o `- `, ou seja, dois espaços à frente do hífen.
  const fieldIndent = `${itemIndent}  `;

  // Fim da entrada: próximo item da lista (mesmo nível) ou primeira linha
  // com indentação menor (fim do bloco `repos:`).
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const isNextItem = new RegExp(`^${escapeRegExp(itemIndent)}-\\s`).test(line);
    const dedented = !line.startsWith(fieldIndent);
    if (isNextItem || dedented) { endIdx = i; break; }
  }

  const rendered = `${fieldIndent}${field}: ${value}`;
  const existingIdx = lines.findIndex(
    (l, i) => i > startIdx && i < endIdx && new RegExp(`^\\s*${escapeRegExp(field)}:`).test(l)
  );

  if (existingIdx !== -1) {
    lines[existingIdx] = rendered;
    return lines.join("\n");
  }

  lines.splice(startIdx + 1, 0, rendered);
  return lines.join("\n");
}

/** Grava o `pinned_sha` — a âncora de versão de um repositório com git. */
export function upsertPinnedSha(yamlContent: string, repoId: string, sha: string): string {
  return upsertRepoField(yamlContent, repoId, "pinned_sha", sha);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
