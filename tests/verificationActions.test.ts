import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workspace, commands } from "vscode";
import { textDocumentContentProviders } from "./mocks/vscode";
import { ARTIFACT_DIFF_SCHEME, createOpenArtifactDiffHandler } from "../src/views/actions/verificationActions";
import type { GitRunner, GitResult } from "../src/adapters/git/GitRunner";
import type { ActionContext } from "../src/views/actions/CommandHandler";
import { YamlStateRepository } from "../src/state/repository/StateRepository";

/**
 * Onda 4 (Mecanismo M v1.1) — mesmo padrão de `FakeGit` de `repo-sync.test.ts`:
 * git falso injetado, sem subprocess de verdade. O que importa testar aqui
 * não é "o git funciona" (isso é responsabilidade do `GitRunner`), é "o
 * handler reage certo a cada resposta do git" — commit encontrado, sem
 * histórico, arquivo recém-criado, erro genérico.
 */
class FakeGit implements GitRunner {
  calls: Array<{ args: string[]; cwd?: string }> = [];
  logResult: GitResult | Error = { stdout: "abc123\n", stderr: "" };
  showResult: GitResult | Error = { stdout: "conteúdo antigo", stderr: "" };

  async run(args: string[], cwd?: string): Promise<GitResult> {
    this.calls.push({ args, ...(cwd ? { cwd } : {}) });
    const result = args[0] === "log" ? this.logResult : this.showResult;
    if (result instanceof Error) throw result;
    return result;
  }
}

const fakeCtx = (): ActionContext => ({
  configLoader: {} as ActionContext["configLoader"],
  extensionContext: {} as ActionContext["extensionContext"],
  promptMap: {},
  repository: new YamlStateRepository(),
  requestRefresh: vi.fn(),
  pushTelemetry: vi.fn(),
});

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-verify-actions-"));
  workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
});

describe("openArtifactDiffHandler (Mecanismo M v1.1)", () => {
  // F2.2 (ADR-0015, "nada gravado fora do workspace"): antes, a versão
  // anterior ia para `os.tmpdir()/helyx-diff-*/`, que nunca era apagado.
  // Agora é um documento virtual, só em memória.
  it("REGRESSÃO: commit anterior encontrado: abre vscode.diff entre a versão anterior (documento virtual, em memória) e o arquivo real, sem gravar nada no tmp do SO", async () => {
    const filePath = path.join(tmpRoot, "docs/domain/bounded-contexts.md");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "conteúdo novo", "utf-8");
    const tmpBefore = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("helyx-diff-"));

    const git = new FakeGit();
    const spy = vi.spyOn(commands, "executeCommand");
    const handler = createOpenArtifactDiffHandler(git);

    await handler.handle({ path: "docs/domain/bounded-contexts.md" }, fakeCtx());

    expect(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("helyx-diff-"))).toEqual(tmpBefore);
    expect(git.calls[0]).toMatchObject({ args: ["log", "-1", "--format=%H", "--", "docs/domain/bounded-contexts.md"] });
    expect(git.calls[1]).toMatchObject({ args: ["show", "abc123~1:docs/domain/bounded-contexts.md"] });
    expect(spy).toHaveBeenCalledTimes(1);
    const [cmd, oldUri, newUri, title] = spy.mock.calls[0]!;
    expect(cmd).toBe("vscode.diff");
    expect((newUri as { fsPath: string }).fsPath).toBe(filePath);
    expect((oldUri as { scheme: string }).scheme).toBe(ARTIFACT_DIFF_SCHEME);
    expect(textDocumentContentProviders.get(ARTIFACT_DIFF_SCHEME)?.provideTextDocumentContent(oldUri)).toBe("conteúdo antigo");
    expect(title).toBe("docs/domain/bounded-contexts.md — última alteração");
  });

  it("arquivo sem nenhum commit: avisa e não chama vscode.diff", async () => {
    const filePath = path.join(tmpRoot, "novo.md");
    fs.writeFileSync(filePath, "x", "utf-8");
    const git = new FakeGit();
    git.logResult = { stdout: "", stderr: "" };
    const spy = vi.spyOn(commands, "executeCommand");

    await createOpenArtifactDiffHandler(git).handle({ path: "novo.md" }, fakeCtx());

    expect(spy).not.toHaveBeenCalled();
  });

  it("arquivo criado no último commit (sem pai): avisa e não chama vscode.diff", async () => {
    const filePath = path.join(tmpRoot, "novo.md");
    fs.writeFileSync(filePath, "x", "utf-8");
    const git = new FakeGit();
    git.showResult = new Error("fatal: path 'novo.md' does not exist in 'abc123~1'");
    const spy = vi.spyOn(commands, "executeCommand");

    await createOpenArtifactDiffHandler(git).handle({ path: "novo.md" }, fakeCtx());

    expect(spy).not.toHaveBeenCalled();
  });

  it("git log falha (não é repo git): avisa e não chama vscode.diff", async () => {
    const filePath = path.join(tmpRoot, "novo.md");
    fs.writeFileSync(filePath, "x", "utf-8");
    const git = new FakeGit();
    git.logResult = new Error("fatal: not a git repository");
    const spy = vi.spyOn(commands, "executeCommand");

    await createOpenArtifactDiffHandler(git).handle({ path: "novo.md" }, fakeCtx());

    expect(spy).not.toHaveBeenCalled();
  });

  it("arquivo não existe mais no workspace: nem chama git", async () => {
    const git = new FakeGit();
    const spy = vi.spyOn(commands, "executeCommand");

    await createOpenArtifactDiffHandler(git).handle({ path: "sumiu.md" }, fakeCtx());

    expect(git.calls).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
