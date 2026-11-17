/**
 * syncReposCommand.ts — `<marca>.syncRepos` (F3.6, um módulo por comando).
 *
 * Materializa os repositórios declarados em repos.yaml. É o que o @assessor
 * pede após montar o inventário, e o que re-hidrata o workspace quando
 * outra pessoa o clona (repos/ é gitignored — só o manifesto é versionado).
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { loadRepos, scannableRepos, upsertPinnedSha, upsertRepoField, REPOS_PATH } from "../../data/repos-contract";
import { RepoSync } from "../../repos/RepoSync";
import { SystemGitRunner } from "../../adapters/git/GitRunner";
import { atomicWrite } from "../../state/lock/atomic-write";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerSyncReposCommand({ ports }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.syncRepos`, async () => {
    const root = ports.workspaceRoot.current();
    if (!root) {
      void ports.notifier.warn(`${BRAND.displayName}: abra o workspace antes de sincronizar os repositórios.`);
      return;
    }

    const inventory = loadRepos(root);
    const pending = scannableRepos(inventory);
    if (pending.length === 0) {
      void ports.notifier.info(
        `${BRAND.displayName}: nenhum repositório em repos.yaml. Peça ao @${BRAND.participant.name} para mapear os repositórios.`
      );
      return;
    }

    const sync = new RepoSync(new SystemGitRunner());
    const results = await ports.notifier.progress(`${BRAND.displayName}: sincronizando repositórios…`, (report) =>
      sync.syncAll(root, inventory, (id, current, total) => {
        report({ message: `${id} (${current}/${total})`, increment: 100 / total });
      })
    );

    // Persiste a âncora de versão: é ela que amarra cada finding a uma versão
    // do código. Repo com git → pinned_sha; snapshot (zip, sem .git) →
    // content_sha. `has_history: false` é o que faz os agentes degradarem com
    // honestidade em vez de inventar churn/hotspot.
    // A escrita é cirúrgica para não apagar o repos.yaml do agente.
    const reposFile = path.join(root, ...REPOS_PATH);
    try {
      await fs.access(reposFile);
      // Sob o mesmo lock do CLI, gravação atômica (A10 / D13, ADR-0017).
      await atomicWrite(reposFile, (before) => {
        let content = before;
        for (const r of results) {
          if (r.status === "failed") continue;
          // Pin declarado é a âncora: nunca é regravado com o HEAD (A8 / H-BUG-12).
          if (r.sha && !r.pinnedSha) content = upsertPinnedSha(content, r.id, r.sha);
          if (r.contentSha) content = upsertRepoField(content, r.id, "content_sha", r.contentSha);
          content = upsertRepoField(content, r.id, "has_history", r.hasHistory);
        }
        return content;
      });
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao gravar a âncora de versão:`, err);
    }

    const failed = results.filter((r) => r.status === "failed");
    const snapshots = results.filter((r) => r.status === "snapshot");
    const ok = results.length - failed.length;

    // Cópia já materializada em outro commit: o pin fica, e o operador decide (A8 / H-BUG-12).
    const diverged = results.filter((r) => r.status !== "failed" && r.pinMismatch);
    if (diverged.length > 0) {
      void ports.notifier.warn(
        `${BRAND.displayName}: ${diverged.map((r) => `${r.id} está em ${r.sha?.slice(0, 7) ?? "?"}, mas o repos.yaml fixa ${r.pinnedSha?.slice(0, 7)}`).join("; ")}. ` +
          "O pinned_sha não foi alterado: faça checkout do pin em repos/<id>/ ou atualize o pinned_sha."
      );
    }

    if (failed.length > 0) {
      void ports.notifier.warn(
        `${BRAND.displayName}: ${ok}/${results.length} repositórios prontos. Falhou: ${failed.map((f) => f.id).join(", ")}`,
        "Ver detalhes"
      ).then((a) => {
        if (a === "Ver detalhes") {
          for (const f of failed) console.error(`[${BRAND.name}] ${f.id}: ${f.error}`);
          void vscode.commands.executeCommand("workbench.action.toggleDevTools");
        }
      });
    } else if (snapshots.length > 0) {
      // Snapshot não é erro, mas o operador precisa saber o que perdeu — senão
      // vai estranhar a ausência de hotspots e achar que o kit falhou.
      void ports.notifier.warn(
        `${BRAND.displayName}: ${ok} repositório(s) prontos. ${snapshots.length} sem histórico git (${snapshots.map((s) => s.id).join(", ")}) — hotspots e arqueologia de commits ficam indisponíveis.`,
        "Entender"
      ).then((a) => {
        if (a === "Entender") {
          void ports.chatHost.open(
            `@${BRAND.guide.name} Os repositórios ${snapshots.map((s) => s.id).join(", ")} são snapshots sem histórico git. O que exatamente eu perco no assessment e o que posso fazer a respeito?`
          );
        }
      });
    } else {
      void ports.notifier.info(`${BRAND.displayName}: ${ok} repositório(s) prontos em repos/.`);
    }
  });
}
