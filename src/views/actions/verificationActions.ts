/**
 * verificationActions.ts — Mecanismo M v1.1 (Onda 4): diff real pra
 * artefatos de código, além do checklist "promessa cumprida" (v1, já
 * existente de graça via `item.artifacts`/`wave.status.artifacts` — esta
 * onda só acrescenta o "ver diff" a cada chip).
 *
 * Reaproveita `GitRunner` (já usado por `RepoSync` pra `pinned_sha`) em vez
 * de inventar um novo jeito de invocar git. Estratégia: acha o ÚLTIMO commit
 * que tocou o arquivo, pega o conteúdo dele no commit ANTERIOR, expõe esse
 * conteúdo como documento virtual (só leitura, em memória) e abre o diff
 * editor NATIVO do VS Code (`vscode.diff`) comparando contra o arquivo real —
 * zero UI de diff pra construir/manter. Nada é gravado fora do workspace
 * (F2.2, ADR-0015): antes, a versão anterior ia para `os.tmpdir()` e nunca
 * era apagada.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SystemGitRunner, type GitRunner } from "../../adapters/git/GitRunner";
import type { CommandHandler } from "./CommandHandler";
import { BRAND } from "../../data/brand.pure";

const DIFF_GIT_TIMEOUT_MS = 10_000;

/** Esquema dos documentos virtuais com a versão anterior de um artefato (só leitura, em memória). */
export const ARTIFACT_DIFF_SCHEME = `${BRAND.name}-diff`;

/** Conteúdo de cada documento virtual aberto nesta sessão, por `uri.toString()`. */
const diffContents = new Map<string, string>();
let diffProvider: vscode.Disposable | undefined;

/** Registra o provedor do esquema uma vez por ativação; some junto com as subscriptions da extensão. */
function ensureDiffProvider(subscriptions: vscode.Disposable[] | undefined): void {
  if (diffProvider) return;
  const registration = vscode.workspace.registerTextDocumentContentProvider(ARTIFACT_DIFF_SCHEME, {
    provideTextDocumentContent: (uri: vscode.Uri): string => diffContents.get(uri.toString()) ?? "",
  });
  diffProvider = {
    dispose: (): void => {
      registration.dispose();
      diffContents.clear();
      diffProvider = undefined;
    },
  };
  subscriptions?.push(diffProvider);
}

/**
 * Fábrica (não um handler pronto) pra aceitar um `GitRunner` injetado — o
 * MESMO padrão de `RepoSync` (ver `repo-sync.test.ts`), pra poder testar sem
 * `git` de verdade no disco. `registry.ts` usa `openArtifactDiffHandler`
 * (já com `SystemGitRunner` embutido); os testes usam esta fábrica com um
 * `GitRunner` falso.
 */
export function createOpenArtifactDiffHandler(git: GitRunner): CommandHandler {
  return {
    type: "openArtifactDiff",
    async handle(msg, ctx): Promise<void> {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return;
      const relPath = msg.path as string;
      const fullPath = path.join(root, relPath);
      if (!fs.existsSync(fullPath)) {
        void vscode.window.showWarningMessage(`${BRAND.displayName}: ${relPath} não existe mais no workspace.`);
        return;
      }

      let lastCommit: string;
      try {
        const { stdout } = await git.run(["log", "-1", "--format=%H", "--", relPath], root);
        lastCommit = stdout.trim();
      } catch (err) {
        void vscode.window.showWarningMessage(`${BRAND.displayName}: não foi possível ler o histórico git de ${relPath} — ${(err as Error).message}`);
        return;
      }
      if (!lastCommit) {
        void vscode.window.showInformationMessage(`${BRAND.displayName}: ${relPath} ainda não tem commit — nada pra comparar ainda.`);
        return;
      }

      let oldContent: string;
      try {
        const { stdout } = await git.run(["show", `${lastCommit}~1:${relPath}`], root);
        oldContent = stdout;
      } catch {
        // Sem commit-pai com este arquivo — não é falha, é "o arquivo nasceu agora".
        void vscode.window.showInformationMessage(`${BRAND.displayName}: ${relPath} foi criado no último commit — sem versão anterior pra comparar.`);
        return;
      }

      ensureDiffProvider(ctx.extensionContext.subscriptions as vscode.Disposable[] | undefined);
      // O path do URI mantém a extensão do arquivo: o VS Code escolhe a linguagem por ela.
      const oldUri = vscode.Uri.from({
        scheme: ARTIFACT_DIFF_SCHEME,
        path: `/${relPath.split(path.sep).join("/")}`,
        query: `${lastCommit}~1`,
      });
      diffContents.set(oldUri.toString(), oldContent);

      await vscode.commands.executeCommand(
        "vscode.diff",
        oldUri,
        vscode.Uri.file(fullPath),
        `${relPath} — última alteração`
      );
    },
  };
}

export const openArtifactDiffHandler: CommandHandler = createOpenArtifactDiffHandler(new SystemGitRunner(DIFF_GIT_TIMEOUT_MS));
