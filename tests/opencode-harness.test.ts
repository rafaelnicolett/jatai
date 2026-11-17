import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { WizardStateSchema } from "../src/types";

/**
 * Epic-9 (OpenCode): a instalação real do adaptador, sem golden ainda.
 * O golden de Claude/Copilot continua sendo o gate de não-regressão; aqui
 * provamos que o host novo produz o layout e o lock certos.
 */
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-opencode-"));
  tmpDirs.push(d);
  return d;
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");
const exists = (root: string, rel: string): boolean => fs.existsSync(path.join(root, rel));
const write = (root: string, rel: string, body: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, "utf-8");
};

function frontmatter(root: string, rel: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(read(root, rel));
  expect(m, `${rel} tem frontmatter`).not.toBeNull();
  return yaml.load(m![1]!) as Record<string, unknown>;
}

async function installBrownfield(): Promise<string> {
  const root = tmp();
  await new StructureGenerator().installAgentStructure(root, "ws-opencode", "opencode");
  return root;
}

describe("OpenCode — instalação brownfield", () => {
  it("instala os agentes planos em .opencode/agents, sem .agent e sem subpasta de stream", async () => {
    const root = await installBrownfield();
    expect(exists(root, ".opencode/agents/jatai.md")).toBe(true);
    expect(exists(root, ".opencode/agents/assessor.md")).toBe(true);
    expect(exists(root, ".opencode/agents/tech-mapper.md")).toBe(true);
    expect(exists(root, ".opencode/agents/discovery/assessor.agent.md")).toBe(false);
    expect(exists(root, ".opencode/agents/discovery")).toBe(false);
    expect(exists(root, ".opencode/agents/maestro.agent.md")).toBe(false);
  });

  it("o orquestrador é primary e os especialistas são subagent", async () => {
    const root = await installBrownfield();
    expect(frontmatter(root, ".opencode/agents/jatai.md").mode).toBe("primary");
    expect(frontmatter(root, ".opencode/agents/assessor.md").mode).toBe("subagent");
    expect(frontmatter(root, ".opencode/agents/tech-mapper.md").mode).toBe("subagent");
  });

  it("o frontmatter do kit não vaza: sem model, id, stream, uses_skills ou campos do Copilot", async () => {
    const root = await installBrownfield();
    for (const file of [".opencode/agents/jatai.md", ".opencode/agents/assessor.md"]) {
      const fm = frontmatter(root, file);
      for (const forbidden of ["id", "name", "layer", "stream", "phase", "scope", "uses_skills", "token_budget", "model", "argument-hint", "user-invocable"]) {
        expect(fm, `${file} não pode ter ${forbidden}`).not.toHaveProperty(forbidden);
      }
      expect(typeof fm.description).toBe("string");
      expect((fm.description as string).length).toBeGreaterThanOrEqual(20);
    }
  });

  it("uses_skills vira allowlist de skill e seção no corpo", async () => {
    const root = await installBrownfield();
    const fm = frontmatter(root, ".opencode/agents/assessor.md");
    const permissions = fm.permissions as Array<{ action: string; resource: string; effect: string }>;
    expect(permissions[0]).toEqual({ action: "skill", resource: "*", effect: "deny" });
    expect(permissions).toEqual(expect.arrayContaining([
      { action: "skill", resource: "codebase-enrichment", effect: "allow" },
      { action: "skill", resource: "domain-driven-design", effect: "allow" },
    ]));
    expect(read(root, ".opencode/agents/assessor.md")).toContain("## Skills desta fase");
  });

  it("as instruções do OpenCode viram AGENTS.md (o genérico não sobrepõe) e o comando seleciona jatai", async () => {
    const root = await installBrownfield();
    const agents = read(root, "AGENTS.md");
    expect(agents).toContain(".opencode/agents/");
    expect(agents).toContain(".opencode/skills/");
    expect(agents).not.toContain(".github/agents/");
    expect(exists(root, ".opencode/commands/jatai.md")).toBe(true);
    const command = read(root, ".opencode/commands/jatai.md");
    expect(command).toContain("agent: jatai");
    expect(command).toContain(".opencode/agents/assessor.md");
  });

  it("instala skills no .opencode/skills e não cria chatmodes", async () => {
    const root = await installBrownfield();
    expect(exists(root, ".opencode/skills/arch-layered/SKILL.md")).toBe(true);
    expect(exists(root, ".github/chatmodes")).toBe(false);
  });

  it("instala o plugin de atividade fora do lock", async () => {
    const root = await installBrownfield();
    const plugin = read(root, ".opencode/plugins/jatai-activity.ts");
    expect(plugin).toContain('import { Plugin } from "@opencode/plugin"');
    expect(plugin).toContain("session.created");
    expect(plugin).toContain("session.execution.succeeded");
    expect(plugin).toContain('"--harness", "opencode"');
    expect(plugin).toContain("agent-started");
    expect(plugin).toContain("agent-done");
    expect(plugin).toContain("blocked");
    const lock = JSON.parse(read(root, ".github/kit.lock.json")) as { files: Record<string, string> };
    expect(Object.keys(lock.files)).not.toContain(".opencode/plugins/jatai-activity.ts");
  });

  it("registra a migração do plugin como sempre regravado", async () => {
    const root = await installBrownfield();
    const before = read(root, ".opencode/plugins/jatai-activity.ts");
    write(root, ".opencode/plugins/jatai-activity.ts", `${before}\n// edição do time\n`);
    await new StructureGenerator().migrateKit(root, "ws-opencode", "opencode");
    expect(read(root, ".opencode/plugins/jatai-activity.ts")).not.toContain("edição do time");
  });

  it("configura o MCP no opencode.json com caminho relativo", async () => {
    const root = await installBrownfield();
    const doc = JSON.parse(read(root, "opencode.json")) as { mcp: { servers: Record<string, { type: string; command: string[]; cwd: string }> } };
    expect(doc.mcp.servers.jatai).toEqual({
      type: "local",
      command: ["node", ".github/scripts/jatai-mcp.cjs"],
      cwd: ".",
    });
    expect(exists(root, ".github/scripts/jatai-mcp.cjs")).toBe(true);
  });

  it("grava o lock com harness opencode e os paths finais planos", async () => {
    const root = await installBrownfield();
    const lock = JSON.parse(read(root, ".github/kit.lock.json")) as { harness: string; files: Record<string, string> };
    expect(lock.harness).toBe("opencode");
    expect(Object.keys(lock.files)).toContain(".opencode/agents/jatai.md");
    expect(Object.keys(lock.files)).toContain(".opencode/agents/assessor.md");
    expect(Object.keys(lock.files)).toContain("AGENTS.md");
    expect(Object.keys(lock.files).some((f) => f.includes(".agent.md"))).toBe(false);
    expect(Object.keys(lock.files).filter((f) => f === "AGENTS.md")).toHaveLength(1);
  });

  it("o config do workspace aponta host_adapter e host_dir para o OpenCode", async () => {
    const root = await installBrownfield();
    const config = read(root, "jatai.config.yaml");
    expect(config).toContain('host_adapter: "opencode"');
    expect(config).toContain('host_dir: ".opencode"');
  });

  it("não toca no layout Claude/Copilot", async () => {
    const root = await installBrownfield();
    expect(exists(root, ".claude")).toBe(false);
    expect(exists(root, ".github/agents")).toBe(false);
    expect(exists(root, ".github/copilot-instructions.md")).toBe(false);
  });

  it("merge do opencode.jsonc preserva comentários, o servidor do time e é idempotente", async () => {
    const root = await installBrownfield();
    fs.rmSync(path.join(root, "opencode.json"));
    const jsonc = `{
  // config do time
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "banco-do-time": { "type": "local", "command": ["npx", "servidor-do-time"] }, // fica
    },
  },
}
`;
    write(root, "opencode.jsonc", jsonc);
    await new StructureGenerator().installAgentStructure(root, "ws-opencode", "opencode");
    const merged = read(root, "opencode.jsonc");
    expect(merged).toContain("config do time");
    expect(merged).toContain("banco-do-time");
    expect(merged).toContain("jatai");
    expect(merged).toContain("// fica");
    expect(exists(root, "opencode.json")).toBe(false);
    await new StructureGenerator().installAgentStructure(root, "ws-opencode", "opencode");
    expect(read(root, "opencode.jsonc")).toBe(merged);
  });
});

describe("OpenCode — greenfield", () => {
  it("gera AGENTS.md, stub de backend plano, comando e MCP", async () => {
    const root = tmp();
    const target = path.join(root, "projeto");
    const state = WizardStateSchema.parse({ projectName: "projeto", hostAdapter: "opencode", backendStack: "python-api" });
    await new StructureGenerator().generate({ ...state, targetDirectory: target });

    expect(exists(target, ".opencode/agents/jatai.md")).toBe(true);
    expect(exists(target, ".opencode/agents/business.md")).toBe(true);
    expect(exists(target, ".opencode/agents/backend-python-api.md")).toBe(true);
    expect(frontmatter(target, ".opencode/agents/backend-python-api.md").mode).toBe("subagent");
    expect(exists(target, ".opencode/commands/jatai.md")).toBe(true);
    expect(exists(target, "AGENTS.md")).toBe(true);
    expect(read(target, "AGENTS.md")).toContain(".opencode/agents/");
    expect(JSON.parse(read(target, "opencode.json")).mcp.servers.jatai.type).toBe("local");
  });
});

describe("OpenCode — migração preserva o que é do time", () => {
  it("arquivo do kit editado vira .kit-new; agents/domain e skills do cliente ficam intactos", async () => {
    const root = await installBrownfield();
    const edited = `${read(root, ".opencode/agents/assessor.md")}\nlinha do time\n`;
    write(root, ".opencode/agents/assessor.md", edited);
    write(root, ".opencode/agents/domain/faturamento.md", "---\ndescription: \"Domínio: Faturamento, regra do cliente.\"\n---\n# Faturamento\n");
    write(root, ".opencode/skills/coding-guidelines-acme/SKILL.md", "---\nname: coding-guidelines-acme\ndescription: \"Skill do cliente para o repo acme.\"\n---\n# Acme\n");

    await new StructureGenerator().migrateKit(root, "ws-opencode", "opencode");

    expect(read(root, ".opencode/agents/assessor.md")).toBe(edited);
    expect(exists(root, ".opencode/agents/assessor.md.kit-new")).toBe(true);
    expect(read(root, ".opencode/agents/domain/faturamento.md")).toContain("Faturamento");
    expect(read(root, ".opencode/skills/coding-guidelines-acme/SKILL.md")).toContain("Acme");
  });

  it("migrar duas vezes é idempotente para o kit", async () => {
    const root = await installBrownfield();
    await new StructureGenerator().migrateKit(root, "ws-opencode", "opencode");
    const first = read(root, ".opencode/agents/assessor.md");
    await new StructureGenerator().migrateKit(root, "ws-opencode", "opencode");
    expect(read(root, ".opencode/agents/assessor.md")).toBe(first);
  });
});
