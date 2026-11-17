import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { BRAND, type Brand } from "../src/data/brand.pure";
import { claudeOrchestratorFilenames } from "../src/data/orchestrator-entry-prompt";
import { helyxCommandContent } from "../src/data/foundation-prompt";
import { KIT_OWNED } from "../src/data/kit-version";
import { ConfigLoader } from "../src/adapters/config/ConfigLoader";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { toClaudeCodePrompt } from "../src/views/actions/hostChat";

/**
 * Expand da F1.3 (ADR-0013), superfície "pontos de entrada": o orquestrador
 * do Claude Code (`.claude/agents/<marca>.agent.md`), o slash command
 * (`.claude/commands/<marca>.md`) e o `@<participante>` de marcas anteriores
 * continuam reconhecidos. Os casos com nome legado vêm do brand.json: com a
 * marca atual as listas estão vazias, e a troca de marca as preenche.
 */

/** Marca sintética com uma marca anterior, para os casos que não dependem do disco. */
const NOVA: Brand = {
  ...BRAND,
  name: "nova",
  participant: { id: "nova.concierge", name: "nova" },
  legacy: { ...BRAND.legacy, participants: ["velha"] },
};

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "brand-legacy-entry-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const write = async (rel: string, body: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(tmpDir, rel)), { recursive: true });
  await fs.writeFile(path.join(tmpDir, rel), body);
};
const exists = (rel: string): Promise<boolean> => fs.access(path.join(tmpDir, rel)).then(() => true, () => false);

describe("toClaudeCodePrompt — @participante vira o slash command do Claude Code", () => {
  it("participante atual, de marca anterior e @maestro viram /<marca>", () => {
    expect(toClaudeCodePrompt("@nova Me ajude", NOVA)).toBe("/nova Me ajude");
    expect(toClaudeCodePrompt("@velha Me ajude", NOVA)).toBe("/nova Me ajude");
    expect(toClaudeCodePrompt("@maestro Me ajude", NOVA)).toBe("/nova Me ajude");
  });

  it("menção no meio do texto ou outro agente não mudam", () => {
    expect(toClaudeCodePrompt("Fale com @nova depois", NOVA)).toBe("Fale com @nova depois");
    expect(toClaudeCodePrompt("@novato oi", NOVA)).toBe("@novato oi");
    expect(toClaudeCodePrompt("@assessor rode", NOVA)).toBe("@assessor rode");
  });

  it("com a marca em uso, o mesmo resultado de antes", () => {
    expect(toClaudeCodePrompt(`@${BRAND.participant.name} status`)).toBe(`/${BRAND.name} status`);
  });
});

describe("orquestrador do Claude Code — host detectado também pelo nome legado", () => {
  it("o atual primeiro, depois os do brand.json", () => {
    expect(claudeOrchestratorFilenames()).toEqual([BRAND.files.orchestratorAgent, ...BRAND.legacy.orchestratorAgents]);
  });

  it.each(BRAND.legacy.orchestratorAgents.map((f) => [f]))("só .claude/agents/%s no disco: host claude", async (legacy) => {
    await write(`.claude/agents/${legacy}`, "# orquestrador da marca anterior\n");
    const loader = new ConfigLoader([{ uri: { fsPath: tmpDir } }] as never);
    expect(await loader.hostAdapter()).toBe("claude");
  });
});

describe("slash command legado — alias do atual", () => {
  it("é do kit (KIT_OWNED): a migração pode reescrevê-lo", () => {
    for (const legacy of BRAND.legacy.slashCommands) expect(KIT_OWNED).toContain(`commands/${legacy}`);
    expect(KIT_OWNED).toContain(`commands/${BRAND.files.slashCommand}`);
  });

  it.each(BRAND.legacy.slashCommands.map((f) => [f]))("o migrateKit reescreve .claude/commands/%s com o conteúdo atual", async (legacy) => {
    await write(`.claude/commands/${legacy}`, "conteúdo antigo\n");
    await new StructureGenerator().migrateKit(tmpDir, "ws", "claude");
    expect(await fs.readFile(path.join(tmpDir, ".claude/commands", legacy), "utf-8")).toBe(helyxCommandContent("claude"));
    expect(await fs.readFile(path.join(tmpDir, ".claude/commands", BRAND.files.slashCommand), "utf-8")).toBe(helyxCommandContent("claude"));
  });

  it("workspace sem o slash command legado não o ganha", async () => {
    await new StructureGenerator().migrateKit(tmpDir, "ws", "claude");
    for (const legacy of BRAND.legacy.slashCommands) expect(await exists(`.claude/commands/${legacy}`)).toBe(false);
    expect(await exists(`.claude/commands/${BRAND.files.slashCommand}`)).toBe(true);
  });
});
