import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { resolveInsideWorkspace } from "../src/data/workspace-path";

/**
 * A16b / L12 / D28 (F6.2): caminho vindo do webview (`openFile`) ou do chat
 * (`revealArtifact`) só pode ser aberto se ficar dentro do workspace, também
 * depois de seguir symlinks.
 */
describe("resolveInsideWorkspace — contenção no workspace (A16b)", () => {
  let base: string;
  let root: string;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-path-"));
    root = path.join(base, "ws");
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "a.md"), "# a\n");
    fs.mkdirSync(path.join(base, "fora-dir"));
    fs.writeFileSync(path.join(base, "fora-dir", "segredo.txt"), "segredo sintético\n");
    fs.mkdirSync(path.join(base, "ws-irmao"));
    // "junction" no Windows dispensa privilégio de admin; fora dele o tipo é ignorado
    fs.symlinkSync(path.join(base, "fora-dir"), path.join(root, "atalho"), "junction");
    fs.symlinkSync(path.join(root, "docs"), path.join(root, "docs-link"), "junction");
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it.each([
    ["docs/a.md", ["docs", "a.md"]],
    ["docs", ["docs"]],
    ["docs/nao-existe.md", ["docs", "nao-existe.md"]],
    ["docs/../docs/a.md", ["docs", "a.md"]],
    ["docs-link/a.md", ["docs-link", "a.md"]],
    ["..nome-estranho.md", ["..nome-estranho.md"]],
  ])("aceita %j e devolve o caminho lexical dentro do workspace", (rel, partes) => {
    expect(resolveInsideWorkspace(root, rel)).toBe(path.join(root, ...partes));
  });

  it("REGRESSÃO: recusa '../', pasta irmã com prefixo igual, absoluto, NUL, vazio e não-string", () => {
    expect(resolveInsideWorkspace(root, "../fora-dir/segredo.txt")).toBeNull();
    expect(resolveInsideWorkspace(root, "..")).toBeNull();
    expect(resolveInsideWorkspace(root, "docs/../../fora-dir")).toBeNull();
    expect(resolveInsideWorkspace(root, "../ws-irmao")).toBeNull();
    expect(resolveInsideWorkspace(root, path.join(root, "docs", "a.md"))).toBeNull();
    expect(resolveInsideWorkspace(root, path.join(base, "fora-dir", "segredo.txt"))).toBeNull();
    expect(resolveInsideWorkspace(root, "docs/a.md\0")).toBeNull();
    expect(resolveInsideWorkspace(root, "")).toBeNull();
    expect(resolveInsideWorkspace(root, undefined)).toBeNull();
    expect(resolveInsideWorkspace(root, 42)).toBeNull();
  });

  it("REGRESSÃO: recusa symlink dentro do workspace que aponta para fora", () => {
    expect(resolveInsideWorkspace(root, "atalho/segredo.txt")).toBeNull();
    expect(resolveInsideWorkspace(root, "atalho")).toBeNull();
  });

  it.runIf(process.platform === "win32")("Windows: recusa '..\\' e letra de outro drive", () => {
    expect(resolveInsideWorkspace(root, "..\\fora-dir\\segredo.txt")).toBeNull();
    expect(resolveInsideWorkspace(root, "C:\\Windows\\win.ini")).toBeNull();
    expect(resolveInsideWorkspace(root, "\\Windows\\win.ini")).toBeNull();
  });
});
