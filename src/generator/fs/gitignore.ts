/**
 * gitignore.ts
 *
 * As entradas que o gerador garante no `.gitignore` da raiz do workspace
 * (F3.4, passo 1): `repos/` (com opt-out por marcador), a pasta efêmera do
 * State Service e, desde a onda 5, `runs/` (contrato agent-activity). As
 * escritas são aditivas e idempotentes: preservam o conteúdo existente e não
 * duplicam a entrada.
 */

import * as path from "path";
import * as fs from "fs/promises";
import { REPOS_DIR } from "../../data/repos-contract";
import { STATE_SERVICE_INFO_PATH } from "../../server/state-service-info";
import { RUNS_DIR } from "../../core/contracts/run-events-contract.pure";
import { BRAND } from "../../data/brand.pure";

/**
 * Marcador de opt-out reconhecido por `ensureReposGitignored` — um
 * workspace que decide versionar `repos/` (contra o padrão do framework)
 * escreve esta linha em qualquer lugar do `.gitignore` pra que `migrateKit`/
 * a geração inicial nunca mais reinsiram a exclusão. Sem isto, a decisão era
 * silenciosamente revertida a cada migração de kit.
 */
export const GITIGNORE_KEEP_REPOS_MARKER = BRAND.gitignoreMarker;

/**
 * Todo marcador de opt-out reconhecido: o atual e os de marcas anteriores
 * (`brand.json › legacy.gitignoreMarkers`). A decisão de versionar `repos/`
 * foi gravada com o nome da marca da época, e trocar a marca não pode
 * revertê-la (ADR-0013).
 */
export const GITIGNORE_KEEP_REPOS_MARKERS: readonly string[] = [GITIGNORE_KEEP_REPOS_MARKER, ...BRAND.legacy.gitignoreMarkers];

/**
 * Entrada do `.gitignore` gerado para a pasta efêmera do State Service
 * (`server.json` com o token local). BUG-48 / F2.2: sem ela, um `git add .`
 * versionava o token. O espelho SQLite que também morava ali saiu na ADR-0017.
 */
export const STATE_SERVICE_GITIGNORE_ENTRY = `/${STATE_SERVICE_INFO_PATH.slice(0, -1).join("/")}/`;

/**
 * Entrada do `.gitignore` gerado para os eventos de atividade de agente
 * (`.github/artifacts/runs/**`). Contrato agent-activity §6: `runs/` fica fora
 * do git por padrão; o estado durável (gates, fases) está nos YAML, que são
 * versionados.
 */
export const RUNS_GITIGNORE_ENTRY = `/${RUNS_DIR.join("/")}/`;

/**
 * Garante que `repos/` esteja no `.gitignore` do workspace — a menos que o
 * próprio `.gitignore` carregue o marcador de opt-out (ver `GITIGNORE_KEEP_REPOS_MARKER`).
 *
 * Os repositórios do cliente são materializados em `repos/<id>/` como
 * **referência agêntica** — por padrão, nunca entram no git do workspace.
 * Quem reconstrói a pasta é o inventário (`.github/artifacts/repos.yaml`),
 * que é versionado. Mas um workspace pode decidir explicitamente versionar
 * `repos/` mesmo assim (ex.: monorepo de demonstração) — sem o marcador,
 * essa decisão era silenciosamente revertida a cada `migrateKit`/geração
 * (o método só verificava se a entrada JÁ estava no arquivo; removê-la à
 * mão bastava pra reaparecer no próximo ciclo).
 *
 * Idempotente: preserva um `.gitignore` existente e não duplica a entrada.
 */
export async function ensureReposGitignored(targetDir: string): Promise<void> {
  const filePath = path.join(targetDir, ".gitignore");
  const entry = `/${REPOS_DIR}/`;
  const block = [
    "",
    "# Repositórios materializados pelo @assessor — referência agêntica, nunca versionados.",
    "# Reconstrua com o inventário em .github/artifacts/repos.yaml",
    entry,
    "",
  ].join("\n");

  try {
    let current = "";
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch { /* não existe ainda — será criado */ }

    if (GITIGNORE_KEEP_REPOS_MARKERS.some((marker) => current.includes(marker))) return;

    const alreadyIgnored = current
      .split("\n")
      .some((line) => {
        const l = line.trim();
        return l === entry || l === `${REPOS_DIR}/` || l === REPOS_DIR;
      });
    if (alreadyIgnored) return;

    await fs.writeFile(filePath, current + block, "utf-8");
  } catch (err) {
    // Sem isso, os repos do cliente entrariam no git do workspace.
    console.error(`[${BRAND.name}] falha ao escrever .gitignore em ${targetDir}:`, err);
  }
}

/**
 * Garante `entry` no `.gitignore` da raiz (cria o arquivo se não existir), com
 * o comentário acima dela. Idempotente: preserva o conteúdo existente e não
 * duplica a entrada (aceita as formas equivalentes, com ou sem `/` inicial e
 * final).
 */
async function ensureEntryGitignored(targetDir: string, entry: string, comment: string): Promise<void> {
  const filePath = path.join(targetDir, ".gitignore");
  const bare = entry.replace(/^\/|\/$/g, "");
  const equivalent = new Set([entry, bare, `/${bare}`, `${bare}/`]);
  const block = ["", comment, entry, ""].join("\n");

  try {
    let current = "";
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch { /* não existe ainda — será criado */ }

    if (current.split("\n").some((line) => equivalent.has(line.trim()))) return;

    const prefix = current === "" || current.endsWith("\n") ? current : `${current}\n`;
    await fs.writeFile(filePath, prefix + (current === "" ? block.replace(/^\n/, "") : block), "utf-8");
  } catch (err) {
    // Sem isso, o que a entrada protege entraria no git do workspace.
    console.error(`[${BRAND.name}] falha ao escrever .gitignore em ${targetDir}:`, err);
  }
}

/**
 * Garante `STATE_SERVICE_GITIGNORE_ENTRY` no `.gitignore` da raiz. Independe
 * do opt-out de `repos/`: a pasta só tem estado efêmero e o token local,
 * nunca é para versionar.
 */
export function ensureStateServiceGitignored(targetDir: string): Promise<void> {
  return ensureEntryGitignored(targetDir, STATE_SERVICE_GITIGNORE_ENTRY, "# Estado local do State Service (token em server.json) — nunca versionar.");
}

/**
 * Garante `RUNS_GITIGNORE_ENTRY` no `.gitignore` da raiz (contrato
 * agent-activity §6). Também independe do opt-out de `repos/`.
 */
export function ensureRunsGitignored(targetDir: string): Promise<void> {
  return ensureEntryGitignored(targetDir, RUNS_GITIGNORE_ENTRY, "# Eventos de atividade de agente (contrato agent-activity) — locais, nunca versionados.");
}
