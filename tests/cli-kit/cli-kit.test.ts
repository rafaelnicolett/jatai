import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runCli } from "../../src/cli-kit/main";
import { StructureGenerator } from "../../src/generator/StructureGenerator";
import type { CliIO } from "../../src/cli-kit/io";

/**
 * CLI headless (epic-10, Wave 1): init/doctor/harness list e a paridade com a
 * extensão. Roda o `runCli` em processo, com IO de teste e diretórios
 * temporários; o smoke do pacote montado fica em scripts/cli-kit-check.mjs.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-cli-"));
  dirs.push(d);
  return d;
}

function capture(): { io: CliIO; out: () => string; err: () => string } {
  let out = "";
  let err = "";
  return {
    io: { stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, isTTY: false },
    out: () => out,
    err: () => err,
  };
}

function walk(root: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, child));
    else out.push(child);
  }
  return out.sort();
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");

describe("CLI — harness list", () => {
  it("lista os três harnesses em JSON", async () => {
    const cap = capture();
    const code = await runCli(["harness", "list", "--json"], cap.io, tmp());
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.out());
    expect(parsed.ok).toBe(true);
    expect(parsed.harnesses.map((h: { name: string }) => h.name)).toEqual(["copilot", "claude", "opencode"]);
    expect(parsed.harnesses.find((h: { name: string }) => h.name === "opencode").mcp).toEqual(["opencode.json"]);
    expect(cap.err()).toBe("");
  });
});

describe("CLI — init e doctor (OpenCode)", () => {
  it("instala, o doctor passa e aponta o arquivo ausente quando o kit quebra", async () => {
    const root = tmp();
    const cap = capture();
    const init = await runCli(["init", "--harness", "opencode", "--dir", root, "--name", "ws-cli", "--yes", "--json"], cap.io, root);
    expect(init).toBe(0);
    const initResult = JSON.parse(cap.out());
    expect(initResult).toMatchObject({ ok: true, dryRun: false, harness: "opencode", name: "ws-cli" });
    expect(fs.existsSync(path.join(root, ".opencode/agents/jatai.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".opencode/agents/assessor.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "opencode.json"))).toBe(true);
    expect(read(root, "jatai.config.yaml")).toContain('host_adapter: "opencode"');

    const doctorCap = capture();
    const doctor = await runCli(["doctor", "--dir", root, "--json"], doctorCap.io, root);
    expect(doctor).toBe(0);
    const diagnosis = JSON.parse(doctorCap.out());
    expect(diagnosis.ok).toBe(true);
    expect(diagnosis.host).toBe("opencode");
    expect(diagnosis.checks.find((c: { id: string }) => c.id === "lock-files").status).toBe("ok");

    fs.rmSync(path.join(root, ".opencode/agents/assessor.md"));
    const brokenCap = capture();
    const broken = await runCli(["doctor", "--dir", root, "--json"], brokenCap.io, root);
    expect(broken).toBe(1);
    const brokenResult = JSON.parse(brokenCap.out());
    expect(brokenResult.ok).toBe(false);
    expect(brokenResult.errors).toBeGreaterThan(0);
  });

  it("--dry-run não escreve no alvo e lista o que seria gravado", async () => {
    const root = tmp();
    const cap = capture();
    const code = await runCli(["init", "--harness", "opencode", "--dir", root, "--name", "ws-dry", "--dry-run", "--json"], cap.io, root);
    expect(code).toBe(0);
    const result = JSON.parse(cap.out());
    expect(result.dryRun).toBe(true);
    expect(result.files.length).toBeGreaterThan(50);
    expect(fs.existsSync(path.join(root, ".opencode"))).toBe(false);
    expect(fs.existsSync(path.join(root, "jatai.config.yaml"))).toBe(false);
  });

  it("--json devolve erro de uso sem texto humano no stdout", async () => {
    const root = tmp();
    const cap = capture();
    const code = await runCli(["init", "--harness", "inexistente", "--dir", root, "--json"], cap.io, root);
    expect(code).toBe(1);
    const result = JSON.parse(cap.out());
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("INVALID_HARNESS");
    expect(cap.err()).toBe("");
  });

  it("recusa trocar o harness de um workspace existente", async () => {
    const root = tmp();
    const first = capture();
    expect(await runCli(["init", "--harness", "opencode", "--dir", root, "--name", "ws-cli", "--yes", "--json"], first.io, root)).toBe(0);
    const second = capture();
    const code = await runCli(["init", "--harness", "claude", "--dir", root, "--yes", "--json"], second.io, root);
    expect(code).toBe(2);
    expect(JSON.parse(second.out()).error.code).toBe("HOST_MISMATCH");
  });
});

describe("CLI × extensão — paridade de árvore", () => {
  it("a CLI instala a mesma árvore do StructureGenerator para OpenCode", async () => {
    const cliRoot = tmp();
    const extRoot = tmp();
    const cap = capture();
    expect(await runCli(["init", "--harness", "opencode", "--dir", cliRoot, "--name", "ws-parity", "--yes", "--json"], cap.io, cliRoot)).toBe(0);
    await new StructureGenerator().installAgentStructure(extRoot, "ws-parity", "opencode");

    expect(walk(cliRoot)).toEqual(walk(extRoot));
    for (const rel of [".opencode/agents/jatai.md", ".opencode/agents/assessor.md", "AGENTS.md", "opencode.json", ".github/kit.lock.json"]) {
      expect(read(cliRoot, rel), rel).toBe(read(extRoot, rel));
    }
    const config = (root: string): string => read(root, "jatai.config.yaml").split("\n").filter((line) => !line.startsWith("# Generated")).join("\n");
    expect(config(cliRoot)).toBe(config(extRoot));
  });
});

describe("CLI — update", () => {
  it("preserva a edição do time e grava .kit-new", async () => {
    const root = tmp();
    const init = capture();
    expect(await runCli(["init", "--harness", "opencode", "--dir", root, "--name", "ws-up", "--yes", "--json"], init.io, root)).toBe(0);
    const original = `${read(root, ".opencode/agents/assessor.md")}\nlinha do time\n`;
    fs.writeFileSync(path.join(root, ".opencode/agents/assessor.md"), original);

    const cap = capture();
    const code = await runCli(["update", "--dir", root, "--yes", "--json"], cap.io, root);
    expect(code).toBe(0);
    const result = JSON.parse(cap.out());
    expect(result.report.keptClientEdits).toContain(".opencode/agents/assessor.md");
    expect(read(root, ".opencode/agents/assessor.md")).toBe(original);
    expect(fs.existsSync(path.join(root, ".opencode/agents/assessor.md.kit-new"))).toBe(true);
  });

  it("--dry-run não escreve no alvo", async () => {
    const root = tmp();
    const init = capture();
    expect(await runCli(["init", "--harness", "opencode", "--dir", root, "--name", "ws-up-dry", "--yes", "--json"], init.io, root)).toBe(0);
    const original = `${read(root, ".opencode/agents/assessor.md")}\nlinha do time\n`;
    fs.writeFileSync(path.join(root, ".opencode/agents/assessor.md"), original);
    const cap = capture();
    const code = await runCli(["update", "--dir", root, "--dry-run", "--json"], cap.io, root);
    expect(code).toBe(0);
    const result = JSON.parse(cap.out());
    expect(result.dryRun).toBe(true);
    expect(result.report.keptClientEdits).toContain(".opencode/agents/assessor.md");
    expect(read(root, ".opencode/agents/assessor.md")).toBe(original);
    expect(fs.existsSync(path.join(root, ".opencode/agents/assessor.md.kit-new"))).toBe(false);
  });
});

describe("CLI — uninstall", () => {
  it("remove o kit, preserva domínio, edição do time, config e artefatos", async () => {
    const root = tmp();
    const init = capture();
    expect(await runCli(["init", "--harness", "opencode", "--dir", root, "--name", "ws-un", "--yes", "--json"], init.io, root)).toBe(0);
    const edited = `${read(root, ".opencode/agents/assessor.md")}\nlinha do time\n`;
    fs.writeFileSync(path.join(root, ".opencode/agents/assessor.md"), edited);
    fs.mkdirSync(path.join(root, ".opencode/agents/domain"), { recursive: true });
    fs.writeFileSync(path.join(root, ".opencode/agents/domain/faturamento.md"), "---\ndescription: \"Domínio do cliente.\"\n---\n");
    fs.mkdirSync(path.join(root, ".github/artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github/artifacts/marker.md"), "# artefato do cliente\n");

    const cap = capture();
    const code = await runCli(["uninstall", "--dir", root, "--yes", "--json"], cap.io, root);
    expect(code).toBe(0);
    const result = JSON.parse(cap.out());
    expect(result.preserved).toContain(".opencode/agents/assessor.md");
    expect(result.lockRemoved).toBe(false);
    expect(fs.existsSync(path.join(root, ".opencode/agents/jatai.md"))).toBe(false);
    expect(read(root, ".opencode/agents/assessor.md")).toBe(edited);
    expect(fs.existsSync(path.join(root, ".opencode/agents/domain/faturamento.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "jatai.config.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".github/artifacts/marker.md"))).toBe(true);
    const mcp = JSON.parse(read(root, "opencode.json"));
    expect(mcp.mcp?.servers?.["jatai"]).toBeUndefined();
  });

  it("num kit intacto, remove os arquivos, a entrada MCP e o lock", async () => {
    const root = tmp();
    const init = capture();
    expect(await runCli(["init", "--harness", "opencode", "--dir", root, "--name", "ws-un-clean", "--yes", "--json"], init.io, root)).toBe(0);
    fs.mkdirSync(path.join(root, ".github/artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github/artifacts/marker.md"), "# artefato\n");

    const cap = capture();
    const code = await runCli(["uninstall", "--dir", root, "--yes", "--json"], cap.io, root);
    expect(code).toBe(0);
    const result = JSON.parse(cap.out());
    expect(result.lockRemoved).toBe(true);
    expect(fs.existsSync(path.join(root, ".opencode/agents/jatai.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, "jatai.config.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".github/artifacts/marker.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".github/kit.lock.json"))).toBe(false);
    const mcp = JSON.parse(read(root, "opencode.json"));
    expect(mcp.mcp?.servers?.["jatai"]).toBeUndefined();
  });

  it("no Claude, remove hooks e MCP do kit e preserva o domínio", async () => {
    const root = tmp();
    const init = capture();
    expect(await runCli(["init", "--harness", "claude", "--dir", root, "--name", "ws-un-claude", "--yes", "--json"], init.io, root)).toBe(0);
    fs.mkdirSync(path.join(root, ".claude/agents/domain"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude/agents/domain/faturamento.agent.md"), "# domínio\n");
    const cap = capture();
    const code = await runCli(["uninstall", "--dir", root, "--yes", "--json"], cap.io, root);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(root, ".claude/agents/jatai.agent.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".claude/agents/domain/faturamento.agent.md"))).toBe(true);
    expect(read(root, ".claude/settings.json")).not.toContain("jatai-hook.cjs");
    expect(read(root, ".mcp.json")).not.toContain('"jatai"');
    expect(read(root, ".vscode/mcp.json")).not.toContain('"jatai"');
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(false);
  });
});
