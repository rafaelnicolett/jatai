/**
 * RepoSync.ts
 *
 * Materializa os repositórios do inventário em `repos/<id>/`.
 *
 * **Divisão de responsabilidade**: o `@assessor` *decide* (coleta com o humano e
 * escreve o `repos.yaml`); esta classe *executa*. Clonar é determinístico demais
 * para depender de um LLM lembrar dos flags certos — esquecer
 * `--filter=blob:none` num monorepo baixa gigabytes, e esquecer o `pinned_sha`
 * faz todo finding `arquivo:linha` apodrecer sem ninguém perceber.
 *
 * Como `repos/` é gitignored, este sync também é o que **re-hidrata** o
 * workspace quando outra pessoa o clona: o manifesto é versionado, o código não.
 */

import * as path from "path";
import { existsSync, readdirSync, statSync, type Dirent } from "fs";
import { createHash } from "crypto";
import type { GitRunner } from "../adapters/git/GitRunner";
import { getRepoDir, scannableRepos, type RepoEntry, type ReposInventory } from "../data/repos-contract";

/**
 * `snapshot` = pasta de código **sem `.git`** — o zip que o cliente mandou, ou o
 * "Download ZIP" do GitHub. Materializa normalmente, mas **não tem histórico**.
 */
export type RepoSyncStatus = "cloned" | "already-present" | "local-path" | "snapshot" | "failed";

export interface RepoSyncResult {
  id: string;
  status: RepoSyncStatus;
  /** Commit materializado. É o que ancora os findings a uma versão. */
  sha?: string;
  /** Âncora de um snapshot: hash do conteúdo, no lugar do commit. */
  contentSha?: string;
  /** Há histórico git? `false` desliga churn/hotspot e arqueologia de PRs. */
  hasHistory: boolean;
  dir: string;
  error?: string;
  /**
   * `pinned_sha` declarado no `repos.yaml` (A8 / H-BUG-12). Quando existe, é
   * ele a âncora: quem chama não o regrava com `sha`.
   */
  pinnedSha?: string;
  /** O commit materializado (`sha`) não é o pin declarado — quem chama avisa, sem regravar nada. */
  pinMismatch?: true;
}

/**
 * Pastas que não entram no hash do snapshot: são geradas, mudam sem o código
 * mudar, e tornariam a âncora não-determinística.
 */
const HASH_IGNORED = new Set([
  ".git", "node_modules", "target", "dist", "build", "out", "bin", "obj",
  ".venv", "venv", "__pycache__", ".gradle", ".mvn", "vendor", ".next",
  "coverage", ".idea", ".vscode", ".DS_Store",
]);

export interface SyncProgress {
  (message: string, current: number, total: number): void;
}

export class RepoSync {
  private readonly _git: GitRunner;

  constructor(git: GitRunner) {
    this._git = git;
  }

  /**
   * Materializa todos os repositórios scannable do inventário.
   *
   * Um repositório que falha **não interrompe os outros** — num workspace de 20
   * repos, um remote fora do ar não pode matar o assessment inteiro. A falha
   * volta no resultado para quem chamou decidir.
   */
  async syncAll(
    workspaceRoot: string,
    inventory: ReposInventory | null,
    onProgress?: SyncProgress
  ): Promise<RepoSyncResult[]> {
    const repos = scannableRepos(inventory);
    const results: RepoSyncResult[] = [];

    for (const [i, repo] of repos.entries()) {
      onProgress?.(repo.id, i + 1, repos.length);
      results.push(await this.syncOne(workspaceRoot, repo));
    }
    return results;
  }

  async syncOne(workspaceRoot: string, repo: RepoEntry): Promise<RepoSyncResult> {
    const dir = getRepoDir(workspaceRoot, repo);

    // local-path: o repositório já é do cliente e está no lugar dele.
    // Nunca clonar, nunca mover — só confirmar que existe.
    if (repo.source === "local-path") {
      if (!existsSync(dir)) {
        return { id: repo.id, status: "failed", dir, hasHistory: false, error: `Pasta não encontrada: ${dir}` };
      }
      return this._inspectLocal(repo.id, dir);
    }

    if (!repo.url) {
      return { id: repo.id, status: "failed", dir, hasHistory: false, error: "source 'git' sem 'url'" };
    }

    // Pasta já preenchida sem .git = o cliente descompactou um zip aqui.
    // Clonar por cima falharia ("destination path already exists"), e o erro do
    // git não explicaria o que fazer. Trata como snapshot e diz o que se perde.
    if (existsSync(dir) && !existsSync(path.join(dir, ".git")) && this._hasFiles(dir)) {
      const snap = await this._inspectLocal(repo.id, dir);
      return {
        ...snap,
        error:
          "declarado como 'git' mas a pasta já tem código sem .git — tratado como snapshot. " +
          "Se veio de um zip, declare source: local-path no repos.yaml.",
      };
    }

    const pin = repo.pinned_sha || undefined;

    // Já materializado → não re-clonar (sync é idempotente e barato de repetir).
    // Também não move o HEAD: a cópia pode ter trabalho local. Só aponta a divergência.
    if (existsSync(path.join(dir, ".git"))) {
      const sha = await this._headSha(dir);
      return { id: repo.id, status: "already-present", dir, hasHistory: true, ...(sha ? { sha } : {}), ...this._pinFields(pin, sha) };
    }

    try {
      await this._git.run(this._cloneArgs(repo, dir));
    } catch (err) {
      return { id: repo.id, status: "failed", dir, hasHistory: false, error: (err as Error).message };
    }

    // O clone traz o HEAD do remote; os findings estão ancorados no pin (A8 / H-BUG-12).
    if (pin) {
      // O pin vem de um YAML que o agente ou o humano escreve: só hex vira
      // argumento do git (nunca uma opção como `--orphan`).
      if (!/^[0-9a-f]{4,64}$/i.test(pin)) {
        return {
          id: repo.id,
          status: "failed",
          dir,
          hasHistory: true,
          pinnedSha: pin,
          error: `clonado, mas o pinned_sha "${pin}" não é um SHA de commit (hexadecimal). Corrija o pinned_sha no repos.yaml.`,
        };
      }
      try {
        await this._git.run(["checkout", "--detach", pin], dir);
      } catch (err) {
        return {
          id: repo.id,
          status: "failed",
          dir,
          hasHistory: true,
          pinnedSha: pin,
          error:
            `clonado, mas o pinned_sha ${pin} não foi encontrado (${(err as Error).message}). ` +
            "Corrija o pinned_sha no repos.yaml, ou apague a linha para ancorar no commit atual.",
        };
      }
    }

    const sha = await this._headSha(dir);
    return { id: repo.id, status: "cloned", dir, hasHistory: true, ...(sha ? { sha } : {}), ...this._pinFields(pin, sha) };
  }

  /** Pin declarado e se o commit materializado bate com ele (prefixo: o pin pode ser abreviado). */
  private _pinFields(pin: string | undefined, sha: string | undefined): Pick<RepoSyncResult, "pinnedSha" | "pinMismatch"> {
    if (!pin) return {};
    const matches = sha !== undefined && sha.toLowerCase().startsWith(pin.toLowerCase());
    return { pinnedSha: pin, ...(matches ? {} : { pinMismatch: true as const }) };
  }

  /**
   * Inspeciona uma pasta local: tem `.git` (histórico) ou é snapshot morto?
   *
   * Essa distinção **não pode falhar em silêncio**: sem histórico, o
   * `@quality-auditor` não calcula hotspot (churn × complexidade) e o
   * `@coding-archaeologist` não lê convenção de PR antigo. O agente precisa
   * saber para declarar a limitação em vez de inventar o dado.
   */
  private async _inspectLocal(id: string, dir: string): Promise<RepoSyncResult> {
    if (existsSync(path.join(dir, ".git"))) {
      const sha = await this._headSha(dir);
      if (sha) return { id, status: "local-path", dir, hasHistory: true, sha };
    }
    // Sem commit legível: snapshot. A âncora passa a ser o hash do conteúdo —
    // um finding `arquivo:linha` continua precisando dizer sobre qual versão é.
    return { id, status: "snapshot", dir, hasHistory: false, contentSha: this._contentSha(dir) };
  }

  /** A pasta tem algum conteúdo relevante (ignorando metadados do SO)? */
  private _hasFiles(dir: string): boolean {
    try {
      return readdirSync(dir).some((e) => e !== ".DS_Store" && e !== "Thumbs.db");
    } catch {
      return false;
    }
  }

  /**
   * Âncora de versão de um snapshot: hash determinístico do conteúdo.
   *
   * Um zip não tem commit, mas o assessment precisa registrar *sobre o quê* foi
   * feito — senão nenhum finding é reproduzível. Hash de `path + tamanho` de
   * cada arquivo, ordenado: determinístico entre máquinas e barato (não lê o
   * conteúdo, que em repo grande custaria caro).
   *
   * Não é criptográfico: serve para identificar o snapshot, não para provar
   * integridade.
   */
  private _contentSha(dir: string): string {
    const entries: string[] = [];

    const walk = (current: string, depth: number): void => {
      if (depth > 12) return; // profundidade patológica: para em vez de travar
      let items: Dirent[];
      try {
        items = readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
        if (HASH_IGNORED.has(item.name)) continue;
        const full = path.join(current, item.name);
        if (item.isDirectory()) {
          walk(full, depth + 1);
        } else if (item.isFile()) {
          try {
            entries.push(`${path.relative(dir, full)}:${statSync(full).size}`);
          } catch { /* arquivo sumiu no meio do walk */ }
        }
      }
    };

    walk(dir, 0);
    return createHash("sha256").update(entries.join("\n")).digest("hex").slice(0, 12);
  }

  /**
   * Argumentos do clone.
   *
   * `--filter=blob:none` (partial clone) é a escolha central: mantém **todo o
   * histórico de commits** — necessário para churn, hotspots e arqueologia —
   * baixando os blobs sob demanda. `--depth 1` seria menor, mas destruiria a
   * análise histórica, que é justamente o que o brownfield precisa.
   */
  private _cloneArgs(repo: RepoEntry, dir: string): string[] {
    return [
      "clone",
      "--filter=blob:none",
      ...(repo.ref ? ["--branch", repo.ref] : []),
      repo.url!,
      dir,
    ];
  }

  /** SHA do commit materializado. `undefined` se não for um repositório git. */
  private async _headSha(dir: string): Promise<string | undefined> {
    try {
      const { stdout } = await this._git.run(["rev-parse", "HEAD"], dir);
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
