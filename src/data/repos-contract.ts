/**
 * repos-contract.ts
 *
 * Inventário de repositórios do workspace brownfield (`repos.yaml`).
 *
 * Um workspace brownfield aponta para N repositórios. **One repo é multi repo
 * com N=1**: nunca existe caminho especial para um único repo — sempre lista,
 * sempre `repos.yaml`, sempre `repos/<id>/`.
 *
 * O arquivo tem dois tipos de campo:
 *
 *   - **Declarados** (o humano responde ao `@assessor`): `id`, `source`, `url`,
 *     `ref`, `path`, `scan_profile`, `owner`.
 *   - **Descobertos** (o assessment preenche, não declarar à mão):
 *     `pinned_sha` (no clone), `stack` (`@tech-mapper`),
 *     `arch_current` + `arch_confidence` (`@arch-discoverer`).
 *
 * `pinned_sha` é o que impede os findings (`arquivo:linha`) de apodrecerem: ele
 * registra contra qual commit o assessment foi feito. Como `repos/` é
 * gitignored, este arquivo também é o manifesto que permite re-hidratar o
 * workspace em outra máquina.
 *
 * O padrão arquitetural aqui é **fato descoberto**, nunca alvo. O alvo
 * (`arch_target`) vive na iniciativa de `modernization` — ver `initiatives.yaml`.
 *
 * Tipos, parsing e queries puras vivem em `repos-contract.pure.ts` (zero
 * `fs`/`path`, seguro para o bundle do webview) e são re-exportados abaixo por
 * inteiro — todo consumidor existente continua importando deste arquivo sem
 * nenhuma mudança.
 */

import * as fs from "fs";
import * as path from "path";
import { REPOS_PATH, REPOS_REL, REPOS_DIR, parseReposYaml, type RepoEntry, type ReposInventory } from "./repos-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./repos-contract.pure";

/** Lê o inventário do workspace. Retorna `null` se o arquivo não existe (ainda não há repos). */
export function loadRepos(workspaceRoot: string, onError?: OnDataIssue): ReposInventory | null {
  const filePath = path.join(workspaceRoot, ...REPOS_PATH);
  if (!fs.existsSync(filePath)) return null;
  try {
    const { inventory, errors } = parseReposYaml(fs.readFileSync(filePath, "utf-8"));
    if (errors.length > 0) {
      const message = `${REPOS_REL}: ${errors.join("; ")}`;
      console.error(`[${BRAND.name}] ${REPOS_REL}:\n  - ${errors.join("\n  - ")}`);
      onError?.({ source: "repos", message });
    }
    return inventory;
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao ler ${REPOS_REL}:`, err);
    onError?.({ source: "repos", message: `falha ao ler ${REPOS_REL}: ${(err as Error).message}` });
    return null;
  }
}

/** Diretório onde o repo é materializado. `local-path` aponta para fora de `repos/`. */
export function getRepoDir(workspaceRoot: string, repo: RepoEntry): string {
  if (repo.source === "local-path" && repo.path) {
    return path.isAbsolute(repo.path) ? repo.path : path.join(workspaceRoot, repo.path);
  }
  return path.join(workspaceRoot, REPOS_DIR, repo.id);
}
