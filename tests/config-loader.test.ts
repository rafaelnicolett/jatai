import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ConfigLoader } from "../src/adapters/config/ConfigLoader";
import { CONFIG_FILENAME, LEGACY_CONFIG_FILENAMES } from "../src/data/kit-version";
import { getHostAdapter } from "../src/views/actions/hostChat";

/** O config legado mais antigo (`ai-sdk.config.yaml`): a lista do brand.json vai do mais recente ao mais antigo. */
const LEGACY_CONFIG_FILENAME = LEGACY_CONFIG_FILENAMES[LEGACY_CONFIG_FILENAMES.length - 1]!;

/**
 * `ConfigLoader` decide "este workspace já foi configurado?" — sinal usado
 * pelo `MainPanelProvider` (sidebar) e pelo auto-detect do `extension.ts`
 * pra rotear entre Wizard e Cockpit. `load()` só reconhece o formato
 * single-project do wizard antigo; `isConfigured()` reconhece esse formato
 * E o multi-repo escrito pelo Foundation brownfield (`@assessor`, fase
 * skill-linking) — sem isso, todo workspace que passou pelo Foundation
 * ficava indistinguível de um workspace nunca configurado.
 */

let tmpDir: string;

const folders = () => [{ uri: { fsPath: tmpDir } }];
const write = (name: string, body: string) => fs.writeFile(path.join(tmpDir, name), body);

const SINGLE_PROJECT_CONFIG = `
version: "1.0.0"
project:
  name: "My SaaS"
  slug: "my-saas"
host_adapter: "claude"
`;

const BROWNFIELD_CONFIG = `
repos:
  helyx-vscode:
    skills:
      - coding-guidelines-helyx-vscode
      - design-system-helyx-vscode
  helyx-landing:
    skills:
      - coding-guidelines-helyx-landing
`;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-configloader-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ConfigLoader.load() — comportamento pinado (single-project apenas)", () => {
  it("retorna null quando nenhum workspace está aberto", async () => {
    const loader = new ConfigLoader(undefined);
    expect(await loader.load()).toBeNull();
  });

  it("retorna null quando não há arquivo de config", async () => {
    const loader = new ConfigLoader(folders());
    expect(await loader.load()).toBeNull();
  });

  it("retorna o config parseado para um workspace single-project válido", async () => {
    await write(CONFIG_FILENAME, SINGLE_PROJECT_CONFIG);
    const loader = new ConfigLoader(folders());
    const config = await loader.load();
    expect(config?.project.slug).toBe("my-saas");
  });

  it("cai para o nome legado (ai-sdk.config.yaml) se o canônico não existir", async () => {
    await write(LEGACY_CONFIG_FILENAME, SINGLE_PROJECT_CONFIG);
    const loader = new ConfigLoader(folders());
    const config = await loader.load();
    expect(config?.project.slug).toBe("my-saas");
  });

  it(
    "known-limitation: retorna null para um config multi-repo do Foundation brownfield, mesmo válido — " +
      "load() é só pro shape single-project; isConfigured() (abaixo) é o sinal certo pra 'existe config'",
    async () => {
      await write(CONFIG_FILENAME, BROWNFIELD_CONFIG);
      const loader = new ConfigLoader(folders());
      expect(await loader.load()).toBeNull();
    }
  );

  it("retorna null para YAML inválido", async () => {
    await write(CONFIG_FILENAME, "not: [valid: yaml");
    const loader = new ConfigLoader(folders());
    expect(await loader.load()).toBeNull();
  });
});

describe("ConfigLoader.isConfigured() — reconhece single-project E multi-repo", () => {
  it("false quando nenhum workspace está aberto", async () => {
    const loader = new ConfigLoader(undefined);
    expect(await loader.isConfigured()).toBe(false);
  });

  it("false quando não há arquivo de config", async () => {
    const loader = new ConfigLoader(folders());
    expect(await loader.isConfigured()).toBe(false);
  });

  it("true para um config single-project válido", async () => {
    await write(CONFIG_FILENAME, SINGLE_PROJECT_CONFIG);
    const loader = new ConfigLoader(folders());
    expect(await loader.isConfigured()).toBe(true);
  });

  it("true para um config multi-repo do Foundation brownfield — regressão do bug reportado", async () => {
    await write(CONFIG_FILENAME, BROWNFIELD_CONFIG);
    const loader = new ConfigLoader(folders());
    expect(await loader.isConfigured()).toBe(true);
  });

  it("true também via o nome legado (ai-sdk.config.yaml) com shape multi-repo", async () => {
    await write(LEGACY_CONFIG_FILENAME, BROWNFIELD_CONFIG);
    const loader = new ConfigLoader(folders());
    expect(await loader.isConfigured()).toBe(true);
  });

  it("false para YAML presente mas que não bate com nenhum dos dois shapes", async () => {
    await write(CONFIG_FILENAME, "algo: totalmente diferente\nnada: a ver\n");
    const loader = new ConfigLoader(folders());
    expect(await loader.isConfigured()).toBe(false);
  });

  it("false para YAML malformado", async () => {
    await write(CONFIG_FILENAME, "not: [valid: yaml");
    const loader = new ConfigLoader(folders());
    expect(await loader.isConfigured()).toBe(false);
  });
});

// A5 / H-BUG-09: o Foundation regrava o config no formato multi-repo (sem
// `host_adapter`), `load()` devolve null e o host virava "copilot" — o
// `migrateKit` instalava o kit Copilot num workspace Claude Code e os botões do
// Cockpit abriam o chat do Copilot.
describe("ConfigLoader.hostAdapter() — host do workspace em qualquer formato de config (A5 / H-BUG-09)", () => {
  const claudeOrchestrator = async (): Promise<void> => {
    await fs.mkdir(path.join(tmpDir, ".claude", "agents"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".claude", "agents", "helyx.agent.md"), "# orquestrador\n");
  };

  it("REGRESSÃO: config multi-repo do Foundation (sem host_adapter) num workspace Claude → claude, pelo orquestrador em .claude/agents", async () => {
    await write(CONFIG_FILENAME, `kit_version: "0.9.10"\n${BROWNFIELD_CONFIG}`);
    await claudeOrchestrator();
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("claude");
  });

  it("REGRESSÃO: getHostAdapter (botões do Cockpit) também vê claude depois do Foundation", async () => {
    await write(CONFIG_FILENAME, BROWNFIELD_CONFIG);
    await claudeOrchestrator();
    expect(await getHostAdapter(new ConfigLoader(folders()))).toBe("claude");
  });

  it("host_adapter declarado vence o disco, nos dois formatos de config", async () => {
    await claudeOrchestrator();
    await write(CONFIG_FILENAME, SINGLE_PROJECT_CONFIG.replace('"claude"', '"copilot"'));
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("copilot");
    await write(CONFIG_FILENAME, `host_adapter: copilot\n${BROWNFIELD_CONFIG}`);
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("copilot");
  });

  it("config single-project com host_adapter claude → claude (sem depender do disco)", async () => {
    await write(CONFIG_FILENAME, SINGLE_PROJECT_CONFIG);
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("claude");
  });

  it("config multi-repo sem host_adapter e sem orquestrador Claude → copilot (default de sempre)", async () => {
    await write(CONFIG_FILENAME, BROWNFIELD_CONFIG);
    await fs.mkdir(path.join(tmpDir, ".github", "agents"), { recursive: true });
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("copilot");
  });

  it("config multi-repo sem host_adapter num workspace OpenCode → opencode, pelo orquestrador .opencode/agents/<marca>.md", async () => {
    await write(CONFIG_FILENAME, BROWNFIELD_CONFIG);
    await fs.mkdir(path.join(tmpDir, ".opencode", "agents"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".opencode", "agents", "jatai.md"), "# orquestrador\n");
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("opencode");
  });

  it("host_adapter declarado opencode vence o disco", async () => {
    await claudeOrchestrator();
    await write(CONFIG_FILENAME, `host_adapter: opencode\n${BROWNFIELD_CONFIG}`);
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("opencode");
  });

  it("YAML malformado ou sem pasta aberta: não lança; cai no disco ou em copilot", async () => {
    await write(CONFIG_FILENAME, "not: [valid: yaml");
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("copilot");
    await claudeOrchestrator();
    expect(await new ConfigLoader(folders()).hostAdapter()).toBe("claude");
    expect(await new ConfigLoader(undefined).hostAdapter()).toBe("copilot");
  });
});
