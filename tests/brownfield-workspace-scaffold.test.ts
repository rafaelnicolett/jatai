import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { REPOS_DIR } from "../src/data/repos-contract";
import { BRAND } from "../src/data/brand.pure";

let tmpDir: string;
let gen: StructureGenerator;

const read = async (p: string) => fs.readFile(path.join(tmpDir, p), "utf-8");
const exists = async (p: string) => {
  try { await fs.access(path.join(tmpDir, p)); return true; } catch { return false; }
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-ws-"));
  gen = new StructureGenerator();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("workspace brownfield — repos/", () => {
  it("cria a pasta repos/ vazia (o @assessor a preenche)", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    expect(await exists(REPOS_DIR)).toBe(true);
    expect(await fs.readdir(path.join(tmpDir, REPOS_DIR))).toEqual([]);
  });
});

describe("workspace brownfield — .gitignore", () => {
  it("ignora repos/ — os repos do cliente nunca entram no git do workspace", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const gitignore = await read(".gitignore");
    expect(gitignore).toContain("/repos/");
  });

  it("explica o porquê e como reconstruir", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const gitignore = await read(".gitignore");
    expect(gitignore).toContain("repos.yaml");
  });

  it("preserva .gitignore existente em vez de sobrescrever", async () => {
    await fs.writeFile(path.join(tmpDir, ".gitignore"), "node_modules/\n*.log\n");
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const gitignore = await read(".gitignore");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain("*.log");
    expect(gitignore).toContain("/repos/");
  });

  it("é idempotente — rodar duas vezes não duplica a entrada", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const occurrences = (await read(".gitignore")).split("\n").filter((l) => l.trim() === "/repos/").length;
    expect(occurrences).toBe(1);
  });

  it("respeita entrada equivalente já presente (repos/ sem barra inicial)", async () => {
    await fs.writeFile(path.join(tmpDir, ".gitignore"), "repos/\n");
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const lines = (await read(".gitignore")).split("\n").filter((l) => l.trim().endsWith("repos/"));
    expect(lines).toHaveLength(1);
  });

  it("REGRESSÃO: respeita o marcador de opt-out — um workspace que decide versionar repos/ não tem a exclusão reinserida a cada geração/migração", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".gitignore"),
      `# decisão explícita do usuário\n${BRAND.gitignoreMarker}\n`
    );
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const gitignore = await read(".gitignore");
    expect(gitignore).not.toContain("/repos/");
  });
});

describe("workspace brownfield — host adapter", () => {
  it("Claude: agentes em .claude/ e CLAUDE.md na raiz", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    expect(await exists(".claude/agents")).toBe(true);
    expect(await exists("CLAUDE.md")).toBe(true);
  });

  it("REGRESSÃO: Claude não nasce sem CLAUDE.md (template existia mas não era encontrado)", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const claudeMd = await read("CLAUDE.md");
    expect(claudeMd.length).toBeGreaterThan(0);
    expect(claudeMd).toContain(`@${BRAND.participant.name}`);
  });

  it("CLAUDE.md do cliente não vaza a identidade do AI-SDK", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const claudeMd = await read("CLAUDE.md");
    expect(claudeMd).not.toContain("Este repositório é o **AI Software Delivery Kit");
    expect(claudeMd).not.toContain("comendo nossa própria comida");
  });

  it("Copilot: agentes em .github/ e copilot-instructions.md", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "copilot");
    expect(await exists(".github/agents")).toBe(true);
    expect(await exists(".github/copilot-instructions.md")).toBe(true);
    expect(await exists("CLAUDE.md")).toBe(false);
  });

  it("artifacts SEMPRE em .github/, independente do host", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    expect(await exists(".github/artifacts/assessment")).toBe(true);
    expect(await exists(".github/artifacts/runs")).toBe(true);
  });
});

describe("slash command /helyx", () => {
  it("Claude ganha .claude/commands/helyx.md", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    expect(await exists(`.claude/commands/${BRAND.files.slashCommand}`)).toBe(true);
  });

  it("REGRESSÃO: o comando aponta para .claude/agents, não .github/agents", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const cmd = await read(`.claude/commands/${BRAND.files.slashCommand}`);
    expect(cmd).toContain(".claude/agents/discovery/assessor.agent.md");
    expect(cmd).not.toContain(".github/agents/discovery");
  });

  it("o comando manda montar o inventário antes de analisar (workspace nasce vazio)", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const cmd = await read(`.claude/commands/${BRAND.files.slashCommand}`);
    expect(cmd).toContain("repos.yaml");
    expect(cmd).toContain("AskUserQuestion");
  });

  it("Copilot não ganha .claude/commands (o ponto de entrada é o chatmode)", async () => {
    await gen.installAgentStructure(tmpDir, "meu-ws", "copilot");
    expect(await exists(`.claude/commands/${BRAND.files.slashCommand}`)).toBe(false);
    expect(await exists(".github/chatmodes")).toBe(true);
  });
});

/** Fotografia `path → conteúdo` (pastas terminam em `/`) de tudo sob `tmpDir`. */
async function snapshotTree(prefix = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const entries = await fs.readdir(path.join(tmpDir, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out[`${rel}/`] = "dir";
      Object.assign(out, await snapshotTree(rel));
    } else {
      out[rel] = (await fs.readFile(path.join(tmpDir, rel))).toString("base64");
    }
  }
  return out;
}

/** Workspace instalado + o que o Foundation e o humano gravam depois (estado que não pode sumir). */
async function foundationInProgress(host: "claude" | "copilot"): Promise<void> {
  await gen.installAgentStructure(tmpDir, "meu-ws", host);
  const hostDir = host === "claude" ? ".claude" : ".github";
  const write = async (rel: string, content: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(tmpDir, rel)), { recursive: true });
    await fs.writeFile(path.join(tmpDir, rel), content, "utf-8");
  };
  const config = (await read(BRAND.files.config)).replace("  status: pending", "  status: in-progress");
  await write(BRAND.files.config, config + "repos:\n  app-a:\n    skills:\n      - coding-guidelines-app-a\n");
  await write(".github/artifacts/initiatives.yaml", 'version: 1\nactive: "foundation"\ninitiatives:\n  - id: "foundation"\n    name: "Foundation"\n    status: in-progress\n');
  await write(".github/artifacts/assessment/report.md", "# relatório do assessment (dias de trabalho)\n");
  await write(".github/artifacts/assessment/.gitkeep", "# gitkeep editado\n");
  await write(".github/artifacts/repos.yaml", 'repos:\n  - id: app-a\n    pinned_sha: "abc1234"\n');
  await write("docs/input/README.md", "# README do time em docs/input\n");
  await write("docs/input/contrato.md", "# contrato\n");
  await write(host === "claude" ? "CLAUDE.md" : ".github/copilot-instructions.md", "# instruções ajustadas pelo time\n");
  await write("AGENTS.md", "# AGENTS.md ajustado pelo time\n");
  await write(`${hostDir}/agents/domain/agendamento.agent.md`, "# LLM Wiki do cliente\nVer .github/agents/discovery/assessor.agent.md\n");
  await write(`${hostDir}/skills/coding-guidelines-app-a/SKILL.md`, "# padrão do app-a\n");
  await write("repos/app-a/README.md", "# código do cliente\n");
}

// C5 / H-BUG-08: a "retomada" do Wizard chama o mesmo installAgentStructure,
// que reinstalava tudo por cima: o config perdia `repos:` e voltava a
// `assessment.status: pending`, e docs/input/README.md, CLAUDE.md, AGENTS.md
// e o .gitkeep do assessment eram sobrescritos.
describe("REGRESSÃO C5 / H-BUG-08 — retomada (helyx.config.yaml já existe) não reinstala por cima", () => {
  for (const host of ["claude", "copilot"] as const) {
    it(`REGRESSÃO (${host}): instalar de novo sobre um Foundation em andamento não muda nem apaga nenhum byte`, async () => {
      await foundationInProgress(host);
      const before = await snapshotTree();
      await gen.installAgentStructure(tmpDir, "outro-nome", host, ["tech-radar"]);
      expect(await snapshotTree()).toEqual(before);
    });
  }

  it("REGRESSÃO: a retomada recria só o que falta do kit, sem tocar no resto", async () => {
    await foundationInProgress("claude");
    const before = await snapshotTree();
    await fs.rm(path.join(tmpDir, ".claude/agents/discovery"), { recursive: true });
    await fs.rm(path.join(tmpDir, `.claude/commands/${BRAND.files.slashCommand}`));
    await fs.rm(path.join(tmpDir, `.github/scripts/${BRAND.files.cli}`));
    await fs.rm(path.join(tmpDir, ".github/artifacts/runs"), { recursive: true });

    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");

    expect(await snapshotTree()).toEqual(before);
  });

  it("REGRESSÃO: workspace com o config legado (ai-sdk.config.yaml) também é retomada — não nasce um helyx.config.yaml novo por cima", async () => {
    await foundationInProgress("claude");
    await fs.rename(path.join(tmpDir, BRAND.files.config), path.join(tmpDir, "ai-sdk.config.yaml"));
    const before = await snapshotTree();
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    expect(await snapshotTree()).toEqual(before);
    expect(await exists(BRAND.files.config)).toBe(false);
  });

  it("retomada ainda acrescenta /repos/ ao .gitignore que não o tem (upsert, sem apagar linha)", async () => {
    await foundationInProgress("claude");
    await fs.writeFile(path.join(tmpDir, ".gitignore"), "node_modules/\n", "utf-8");
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    const gitignore = await read(".gitignore");
    expect(gitignore.startsWith("node_modules/\n")).toBe(true);
    expect(gitignore).toContain("/repos/");
  });

  it("pasta sem config continua recebendo a instalação completa (o Wizard já confirmou ou a pasta está vazia)", async () => {
    await fs.mkdir(path.join(tmpDir, ".claude"));
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "# antigo\n");
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    expect(await read("AGENTS.md")).not.toBe("# antigo\n");
    expect(await read(BRAND.files.config)).toContain("  status: pending");
  });
});

// A21: a adaptação de paths do Claude percorria `agents/` inteiro, inclusive a
// LLM Wiki do cliente (CLIENT_OWNED).
describe("REGRESSÃO A21 — agents/domain/ do cliente não é reescrito", () => {
  it("REGRESSÃO: instalação completa (Claude) numa pasta confirmada não reescreve o agents/domain/ que já estava lá", async () => {
    const wiki = "# LLM Wiki\nVer .github/agents/discovery/assessor.agent.md\n";
    await fs.mkdir(path.join(tmpDir, ".claude/agents/domain"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".claude/agents/domain/agendamento.agent.md"), wiki, "utf-8");
    await gen.installAgentStructure(tmpDir, "meu-ws", "claude");
    expect(await read(".claude/agents/domain/agendamento.agent.md")).toBe(wiki);
    expect(await read(".claude/agents/discovery/assessor.agent.md")).not.toContain(".github/agents/");
  });
});
