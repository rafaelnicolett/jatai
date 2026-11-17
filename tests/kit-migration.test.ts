import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { CONFIG_FILENAME, LEGACY_CONFIG_FILENAMES, readKitVersion, kitVersion } from "../src/data/kit-version";
import { BRAND } from "../src/data/brand.pure";
import { KIT_LOCK_PATH } from "../src/generator/install/kit-lock";

/** O config legado mais antigo (`ai-sdk.config.yaml`): a lista do brand.json vai do mais recente ao mais antigo. */
const LEGACY_CONFIG_FILENAME = LEGACY_CONFIG_FILENAMES[LEGACY_CONFIG_FILENAMES.length - 1]!;

/**
 * A migração atualiza o kit e **preserva o trabalho do cliente**.
 *
 * Sobrescrever a LLM Wiki (agents/domain/) ou o assessment (.github/artifacts/)
 * destruiria dias de trabalho — é o pior desfecho possível de uma atualização,
 * e o tipo de coisa que só se descobre depois de acontecer com um cliente.
 */

let tmpDir: string;
let gen: StructureGenerator;

const read = (p: string) => fs.readFile(path.join(tmpDir, p), "utf-8");
const exists = async (p: string) => {
  try { await fs.access(path.join(tmpDir, p)); return true; } catch { return false; }
};
const write = async (p: string, body: string) => {
  await fs.mkdir(path.dirname(path.join(tmpDir, p)), { recursive: true });
  await fs.writeFile(path.join(tmpDir, p), body);
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-mig-"));
  gen = new StructureGenerator();
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Workspace como ficaria após meses de uso: kit antigo + muito trabalho do cliente. */
async function seedOldWorkspace(): Promise<void> {
  await gen.installAgentStructure(tmpDir, "ws-antigo", "claude");

  // Simula versão antiga: nome de config legado, sem kit_version e sem o
  // lock do kit (ADR-0018), que as versões antigas não gravavam. Sem lock, a
  // migração sobrescreve o que é do kit, como sempre fez.
  await fs.rm(path.join(tmpDir, CONFIG_FILENAME), { force: true });
  await fs.rm(path.join(tmpDir, KIT_LOCK_PATH), { force: true });
  await write(LEGACY_CONFIG_FILENAME, '# Meu config\nversion: "1.0.0"\nhost_adapter: "claude"\nproject:\n  name: "ws-antigo"   # não perder\n');

  // ── Trabalho do cliente: o que NÃO pode ser destruído ──
  await write(".claude/agents/domain/faturamento.agent.md", "# @faturamento — regra de negócio do cliente");
  await write(".claude/agents/domain/sinistros.agent.md", "# @sinistros — regra de negócio do cliente");
  await write(".claude/skills/coding-guidelines-billing-api/SKILL.md", "# padrão descoberto do billing-api");
  await write(".github/artifacts/repos.yaml", "repos:\n  - id: billing-api\n    source: git\n    url: git@x/b.git\n");
  await write(".github/artifacts/assessment/foundation-state.yaml", "phases:\n  domain:\n    status: done\n");
  await write(".github/artifacts/assessment/repos/billing-api/debt/tech-debt.md", "# débito levantado");
  await write("docs/input/contrato.md", "# contrato do cliente");

  // Agente do kit adulterado, para provar que a migração o restaura
  await write(".claude/agents/discovery/assessor.agent.md", "VERSÃO ANTIGA DO KIT");
}

describe("migração — preserva o trabalho do cliente", () => {
  it.each([
    ".claude/agents/domain/faturamento.agent.md",
    ".claude/agents/domain/sinistros.agent.md",
  ])("a LLM Wiki sobrevive: %s", async (p) => {
    await seedOldWorkspace();
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");

    expect(await exists(p), `${p} foi DESTRUÍDO pela migração`).toBe(true);
    expect(await read(p)).toContain("regra de negócio do cliente");
  });

  // A21 (achado da F0.4): a adaptação de paths do Claude (`.github/agents/` →
  // `.claude/agents/`) percorria `agents/` inteiro e reescrevia a LLM Wiki.
  it("REGRESSÃO: a LLM Wiki que cita .github/agents/ sai byte a byte como entrou (A21)", async () => {
    await seedOldWorkspace();
    const wiki = "# @faturamento — regra de negócio do cliente\nVer .github/agents/discovery/assessor.agent.md\n";
    await write(".claude/agents/domain/faturamento.agent.md", wiki);
    await write(".claude/agents/domain/sub/glossario.agent.md", "cita .github/agents/planning/\n");

    await gen.migrateKit(tmpDir, "ws-antigo", "claude");

    expect(await read(".claude/agents/domain/faturamento.agent.md")).toBe(wiki);
    expect(await read(".claude/agents/domain/sub/glossario.agent.md")).toBe("cita .github/agents/planning/\n");
    expect(await read(".claude/agents/discovery/assessor.agent.md")).not.toContain(".github/agents/");
  });

  it("a skill de coding-guidelines por repo sobrevive", async () => {
    await seedOldWorkspace();
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");
    expect(await read(".claude/skills/coding-guidelines-billing-api/SKILL.md")).toContain("padrão descoberto");
  });

  it.each([
    ".github/artifacts/repos.yaml",
    ".github/artifacts/assessment/foundation-state.yaml",
    ".github/artifacts/assessment/repos/billing-api/debt/tech-debt.md",
  ])("o assessment sobrevive: %s", async (p) => {
    await seedOldWorkspace();
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");
    expect(await exists(p), `${p} foi DESTRUÍDO`).toBe(true);
  });

  it("docs/input do cliente sobrevive", async () => {
    await seedOldWorkspace();
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");
    expect(await read("docs/input/contrato.md")).toContain("contrato do cliente");
  });
});

describe("migração — atualiza o que é do kit", () => {
  it("restaura o agente do kit adulterado/antigo", async () => {
    await seedOldWorkspace();
    expect(await read(".claude/agents/discovery/assessor.agent.md")).toBe("VERSÃO ANTIGA DO KIT");

    await gen.migrateKit(tmpDir, "ws-antigo", "claude");

    const assessor = await read(".claude/agents/discovery/assessor.agent.md");
    expect(assessor).not.toBe("VERSÃO ANTIGA DO KIT");
    expect(assessor).toContain("@assessor");
  });

  it("traz estruturas que passaram a existir depois (repos/, docs/input/)", async () => {
    await gen.installAgentStructure(tmpDir, "ws", "claude");
    await fs.rm(path.join(tmpDir, "repos"), { recursive: true, force: true });
    await fs.rm(path.join(tmpDir, "docs"), { recursive: true, force: true });

    await gen.migrateKit(tmpDir, "ws", "claude");

    expect(await exists("repos")).toBe(true);
    expect(await exists("docs/input")).toBe(true);
  });

  it("o /helyx é regenerado com os paths do host", async () => {
    await seedOldWorkspace();
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");
    expect(await read(`.claude/commands/${BRAND.files.slashCommand}`)).toContain(".claude/agents/discovery/assessor.agent.md");
  });
});

describe("migração — o config", () => {
  it("carimba o kit_version", async () => {
    await seedOldWorkspace();
    expect(readKitVersion(tmpDir)).toBeNull();

    await gen.migrateKit(tmpDir, "ws-antigo", "claude");
    expect(readKitVersion(tmpDir)).toBe(kitVersion());
  });

  it("adota o nome canônico e remove o legado", async () => {
    await seedOldWorkspace();
    expect(await exists(LEGACY_CONFIG_FILENAME)).toBe(true);

    await gen.migrateKit(tmpDir, "ws-antigo", "claude");

    expect(await exists(CONFIG_FILENAME)).toBe(true);
    expect(await exists(LEGACY_CONFIG_FILENAME)).toBe(false);
  });

  it("preserva o conteúdo e os comentários do config do cliente", async () => {
    await seedOldWorkspace();
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");

    const config = await read(CONFIG_FILENAME);
    expect(config).toContain("# Meu config");
    expect(config).toContain("# não perder");
    expect(config).toContain('name: "ws-antigo"');
  });

  it("é idempotente — migrar duas vezes não duplica kit_version", async () => {
    await seedOldWorkspace();
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");
    await gen.migrateKit(tmpDir, "ws-antigo", "claude");

    const config = await read(CONFIG_FILENAME);
    expect(config.split("\n").filter((l) => l.startsWith("kit_version:")).length).toBe(1);
  });
});

describe("workspace novo já nasce versionado", () => {
  it("installAgentStructure grava kit_version no config canônico", async () => {
    await gen.installAgentStructure(tmpDir, "novo", "claude");

    expect(await exists(CONFIG_FILENAME)).toBe(true);
    expect(await exists(LEGACY_CONFIG_FILENAME)).toBe(false);
    expect(readKitVersion(tmpDir)).toBe(kitVersion());
  });
});

// A7 / BUG-11, corrigido na F3.5.
describe("REGRESSÃO: A7 / BUG-11 — o migrateKit atualiza o orquestrador e agents/operation", () => {
  it.each([["claude", ".claude", BRAND.files.orchestratorAgent], ["copilot", ".github", BRAND.files.orchestratorAgent]] as const)(
    "%s: orquestrador e operation/ adulterados voltam à versão do kit",
    async (host, hd, orchestrator) => {
      await gen.installAgentStructure(tmpDir, "ws", host);
      // Workspace de uma versão anterior ao lock do kit: sem lock, o kit sobrescreve o que é dele.
      await fs.rm(path.join(tmpDir, KIT_LOCK_PATH), { force: true });
      const fresh = { orq: await read(`${hd}/agents/${orchestrator}`), devops: await read(`${hd}/agents/operation/devops.agent.md`) };
      await write(`${hd}/agents/${orchestrator}`, "VERSÃO ANTIGA DO KIT");
      await write(`${hd}/agents/operation/devops.agent.md`, "VERSÃO ANTIGA DO KIT");
      await gen.migrateKit(tmpDir, "ws", host);
      expect(await read(`${hd}/agents/${orchestrator}`)).toBe(fresh.orq);
      expect(await read(`${hd}/agents/operation/devops.agent.md`)).toBe(fresh.devops);
    }
  );

  // ADR-0025: no Copilot o orquestrador também se chama pela marca. O
  // `maestro.agent.md` do kit anterior não é apagado: vira `.bak`, como o de
  // marca anterior no Claude (o time pode tê-lo customizado).
  it("REGRESSÃO: ADR-0025 — Copilot: o maestro.agent.md do kit anterior vira .bak e o orquestrador passa a ser o da marca", async () => {
    await gen.installAgentStructure(tmpDir, "ws", "copilot");
    await fs.rm(path.join(tmpDir, ".github/agents", BRAND.files.orchestratorAgent), { force: true });
    await write(".github/agents/maestro.agent.md", "# maestro customizado pelo time\n");
    await gen.migrateKit(tmpDir, "ws", "copilot");
    expect(await exists(".github/agents/maestro.agent.md")).toBe(false);
    expect(await read(".github/agents/maestro.agent.md.bak")).toBe("# maestro customizado pelo time\n");
    expect(await read(`.github/agents/${BRAND.files.orchestratorAgent}`)).toContain(`name: "${BRAND.name}"`);
    await gen.migrateKit(tmpDir, "ws", "copilot");
    expect(await exists(".github/agents/maestro.agent.md")).toBe(false);
    expect(await read(".github/agents/maestro.agent.md.bak")).toBe("# maestro customizado pelo time\n");
  });

  it.each(BRAND.legacy.orchestratorAgents.map((f) => [f]))("orquestrador de marca anterior (%s) é guardado como .bak e não volta na 2ª migração", async (legacy) => {
    await write(`.claude/agents/${legacy}`, "# orquestrador customizado pelo time\n");
    await gen.migrateKit(tmpDir, "ws", "claude");
    expect(await exists(`.claude/agents/${legacy}`)).toBe(false);
    expect(await read(`.claude/agents/${legacy}.bak`)).toBe("# orquestrador customizado pelo time\n");
    expect(await exists(`.claude/agents/${BRAND.files.orchestratorAgent}`)).toBe(true);
    await gen.migrateKit(tmpDir, "ws", "claude");
    expect(await exists(`.claude/agents/${legacy}`)).toBe(false);
    expect(await read(`.claude/agents/${legacy}.bak`)).toBe("# orquestrador customizado pelo time\n");
  });

  it.each(BRAND.legacy.orchestratorAgents.map((f) => [f]))("com um .bak de %s já existente, nenhum dos dois é sobrescrito nem apagado", async (legacy) => {
    await write(`.claude/agents/${legacy}`, "# o orquestrador\n");
    await write(`.claude/agents/${legacy}.bak`, "# um backup que o time guardou\n");
    await gen.migrateKit(tmpDir, "ws", "claude");
    expect(await read(`.claude/agents/${legacy}`)).toBe("# o orquestrador\n");
    expect(await read(`.claude/agents/${legacy}.bak`)).toBe("# um backup que o time guardou\n");
  });
});
