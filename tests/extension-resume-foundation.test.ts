import { describe, it, expect, vi, beforeEach } from "vitest";
import { commands, workspace } from "vscode";
import { resumePendingFoundation, PENDING_FOUNDATION_KEY } from "../src/extension";
import { BRAND } from "../src/data/brand.pure";

/**
 * Testes de `resumePendingFoundation` (hotfix-wizard-project-detection,
 * wave-2 item-2.2).
 *
 * Contexto (ver diagnosis-report-hotfix-wizard-project-detection.md, Sintoma
 * 2, item 4): ao instalar a estrutura brownfield via wizard num diretório
 * que precisa reabrir, `helyx._installAgentStructure` grava
 * `{ dir: targetDir, host }` em `globalState[PENDING_FOUNDATION_KEY]` e conta
 * com `resumePendingFoundation` (chamada no topo de `activate()`) para
 * retomar o Foundation na ativação seguinte, comparando o `fsPath` da pasta
 * reaberta com `pending.dir`.
 *
 * Histórico: nasceu 100% characterization (test-backfill, "pina o
 * comportamento atual, mesmo se estiver errado" — Michael Feathers), pinando
 * um bug confirmado: a comparação original usava `!==` estrito sobre
 * `fsPath` puro, sem nenhuma normalização de path — symlink do SO, barra
 * final ou case-fold faziam o resume falhar SILENCIOSAMENTE (ver
 * test-backfill-report-helyx-vscode-extension-resume-foundation.md).
 *
 * Nesta revisão (fix do mesmo item-2.2), os 3 testes de mismatch por
 * normalização abaixo foram invertidos: `resumePendingFoundation` agora usa
 * `isSameWorkspaceDir` (realpath + fallback tolerante + case-insensitive)
 * antes de comparar, então os três cenários passam a ser MATCH. Os 2 testes
 * de comportamento correto (caminho feliz, guard clause) continuam
 * inalterados. Um novo teste de mismatch GENUÍNO garante que a normalização
 * não ficou "generosa demais".
 */

// Os pendentes usam o host Copilot: estes testes cobrem a comparação de pasta;
// o destino do Foundation por host (H-BUG-24) está em extension-activate.characterization.
interface PendingFoundation {
  dir: string;
  host: string;
}

/**
 * Fake de `vscode.ExtensionContext` — só a fatia que `resumePendingFoundation`
 * usa (`globalState.get`/`update`). Mesmo padrão de fake inline usado em
 * `tests/notificationActions.test.ts` para `ActionContext["extensionContext"]`.
 */
function fakeExtensionContext(pending: PendingFoundation | undefined): Parameters<typeof resumePendingFoundation>[0] {
  const store = new Map<string, unknown>();
  if (pending !== undefined) store.set(PENDING_FOUNDATION_KEY, pending);

  const update = vi.fn(async (key: string, value: unknown): Promise<void> => {
    if (value === undefined) store.delete(key);
    else store.set(key, value);
  });

  return {
    globalState: {
      get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
      update,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
  workspace.workspaceFolders = undefined;
});

describe("resumePendingFoundation — caminho feliz (paths idênticos)", () => {
  it("caminho feliz: pasta reaberta com o MESMO fsPath do pendente → retoma o Foundation e limpa o pendente", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const dir = "/tmp/helyx-workspace-teste";
    const context = fakeExtensionContext({ dir, host: "copilot" });
    workspace.workspaceFolders = [{ uri: { fsPath: dir } }];

    await resumePendingFoundation(context);

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(
      "workbench.action.chat.open",
      expect.objectContaining({ mode: BRAND.participant.name, query: expect.not.stringContaining(`@${BRAND.participant.name}`) })
    );
    expect(context.globalState.update).toHaveBeenCalledWith(PENDING_FOUNDATION_KEY, undefined);
  });

  it("nenhum Foundation pendente → não faz nada (nem chat, nem escrita em globalState)", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const context = fakeExtensionContext(undefined);
    workspace.workspaceFolders = [{ uri: { fsPath: "/tmp/qualquer-coisa" } }];

    await resumePendingFoundation(context);

    expect(executeCommand).not.toHaveBeenCalled();
    expect(context.globalState.update).not.toHaveBeenCalled();
  });
});

describe("resumePendingFoundation — path-mismatch por normalização (FIX: hotfix-wizard-project-detection wave-2 item-2.2)", () => {
  // Era @known-bug: `resumePendingFoundation` comparava `openDir !== pending.dir`
  // com igualdade de STRING estrita, sem normalização dos dois lados. Um
  // symlink resolvido pelo SO entre o momento do `showOpenDialog` (wizard) e
  // o reload da janela (ex.: macOS expõe /tmp como symlink pra /private/tmp)
  // fazia os dois fsPath apontarem pro MESMO diretório real, mas como
  // strings diferentes — o `if` retornava cedo, SEM log, SEM toast, SEM
  // erro. FIXADO: `isSameWorkspaceDir` resolve o caminho real (com fallback
  // tolerante a path que não existe mais) antes de comparar.
  it("REGRESSÃO: symlink resolvido (macOS /tmp → /private/tmp) é tratado como o MESMO diretório → Foundation retoma", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const pendingDir = "/tmp/helyx-workspace-teste"; // fsPath escolhido no showOpenDialog do wizard
    const reopenedDir = "/private/tmp/helyx-workspace-teste"; // mesmo diretório real, symlink resolvido no reload
    const context = fakeExtensionContext({ dir: pendingDir, host: "copilot" });
    workspace.workspaceFolders = [{ uri: { fsPath: reopenedDir } }];

    await resumePendingFoundation(context);

    expect(executeCommand).toHaveBeenCalledWith(
      "workbench.action.chat.open",
      expect.objectContaining({ mode: BRAND.participant.name, query: expect.not.stringContaining(`@${BRAND.participant.name}`) })
    );
    expect(context.globalState.update).toHaveBeenCalledWith(PENDING_FOUNDATION_KEY, undefined);
  });

  // Era @known-bug: mesma classe de bug do teste acima — barra final
  // quebrava a igualdade estrita, mesmo os dois fsPath apontando pro mesmo
  // diretório. FIXADO: `fs.realpath` normaliza barra final.
  it("REGRESSÃO: barra final divergente é tratada como o MESMO diretório → Foundation retoma", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const pendingDir = "/tmp/helyx-workspace-teste";
    const context = fakeExtensionContext({ dir: pendingDir, host: "copilot" });
    workspace.workspaceFolders = [{ uri: { fsPath: `${pendingDir}/` } }];

    await resumePendingFoundation(context);

    expect(executeCommand).toHaveBeenCalledWith(
      "workbench.action.chat.open",
      expect.objectContaining({ mode: BRAND.participant.name, query: expect.not.stringContaining(`@${BRAND.participant.name}`) })
    );
    expect(context.globalState.update).toHaveBeenCalledWith(PENDING_FOUNDATION_KEY, undefined);
  });

  // Era @known-bug: mesma classe de bug — case-fold diferente (volume
  // case-insensitive, comum em macOS/Windows) também quebrava a igualdade
  // estrita. FIXADO: fallback case-insensitive final em `isSameWorkspaceDir`
  // (trade-off documentado no feature-report deste fix).
  it("REGRESSÃO: case divergente (volume case-insensitive) é tratado como o MESMO diretório → Foundation retoma", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const pendingDir = `/tmp/${BRAND.displayName}-Workspace-Teste`;
    const context = fakeExtensionContext({ dir: pendingDir, host: "copilot" });
    workspace.workspaceFolders = [{ uri: { fsPath: pendingDir.toLowerCase() } }];

    await resumePendingFoundation(context);

    expect(executeCommand).toHaveBeenCalledWith(
      "workbench.action.chat.open",
      expect.objectContaining({ mode: BRAND.participant.name, query: expect.not.stringContaining(`@${BRAND.participant.name}`) })
    );
    expect(context.globalState.update).toHaveBeenCalledWith(PENDING_FOUNDATION_KEY, undefined);
  });
});

describe("resumePendingFoundation — mismatch genuíno (regressão contrária: normalização não pode virar 'match de qualquer coisa')", () => {
  it("REGRESSÃO: pastas realmente diferentes (sem relação de normalização) continuam BLOQUEANDO o resume, e o mismatch é logado", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pendingDir = "/tmp/helyx-workspace-teste"; // pendente de um wizard anterior
    const openDir = "/tmp/outro-projeto-sem-relacao"; // usuário abriu uma pasta genuinamente diferente
    const context = fakeExtensionContext({ dir: pendingDir, host: "copilot" });
    workspace.workspaceFolders = [{ uri: { fsPath: openDir } }];

    await resumePendingFoundation(context);

    expect(executeCommand).not.toHaveBeenCalled();
    // O pendente NÃO é limpo nesse caso — decisão deliberada (permite
    // retomar se o usuário abrir a pasta certa depois), ver feature-report.
    expect(context.globalState.update).not.toHaveBeenCalled();
    // A falha deixou de ser silenciosa: um mismatch genuíno é logado.
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    const [warnMessage] = consoleWarn.mock.calls[0] as [string];
    expect(warnMessage).toContain(`[${BRAND.name}]`);
    expect(warnMessage).toContain(openDir);
    expect(warnMessage).toContain(pendingDir);
  });
});
