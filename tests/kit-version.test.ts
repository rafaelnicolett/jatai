import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  compareVersions,
  readKitVersion,
  getKitStatus,
  upsertKitVersion,
  findConfigPath,
  isClientOwned,
  readProjectMode,
  CONFIG_FILENAME,
  LEGACY_CONFIG_FILENAMES,
} from "../src/data/kit-version";
import { BRAND } from "../src/data/brand.pure";

/** O config legado mais antigo (`ai-sdk.config.yaml`): a lista do brand.json vai do mais recente ao mais antigo. */
const LEGACY_CONFIG_FILENAME = LEGACY_CONFIG_FILENAMES[LEGACY_CONFIG_FILENAMES.length - 1]!;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-kit-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const writeConfig = (name: string, body: string) => fs.writeFile(path.join(tmpDir, name), body);

describe("compareVersions — string não serve para semver", () => {
  it("0.10.0 é MAIOR que 0.9.0 (comparação por string erraria)", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });
  it("0.4.0 < 0.4.1", () => expect(compareVersions("0.4.0", "0.4.1")).toBeLessThan(0));
  it("iguais dão 0", () => expect(compareVersions("1.2.3", "1.2.3")).toBe(0));
  it("ignora pré-release (0.4.0-alpha.1 == 0.4.0)", () => {
    expect(compareVersions("0.4.0-alpha.1", "0.4.0")).toBe(0);
  });
  it("versão malformada não explode", () => {
    expect(() => compareVersions("abc", "1.0.0")).not.toThrow();
  });
});

describe("findConfigPath — o nome novo, com fallback para o antigo", () => {
  it("acha helyx.config.yaml", async () => {
    await writeConfig(CONFIG_FILENAME, "version: '1.0.0'\n");
    expect(findConfigPath(tmpDir)).toBe(path.join(tmpDir, CONFIG_FILENAME));
  });

  it("cai para ai-sdk.config.yaml — renomear sem fallback quebraria todo workspace existente", async () => {
    await writeConfig(LEGACY_CONFIG_FILENAME, "version: '1.0.0'\n");
    expect(findConfigPath(tmpDir)).toBe(path.join(tmpDir, LEGACY_CONFIG_FILENAME));
  });

  it("o nome novo tem precedência sobre o antigo", async () => {
    await writeConfig(LEGACY_CONFIG_FILENAME, "version: '1.0.0'\n");
    await writeConfig(CONFIG_FILENAME, "version: '1.0.0'\n");
    expect(findConfigPath(tmpDir)).toBe(path.join(tmpDir, CONFIG_FILENAME));
  });

  it("sem config algum: não é workspace Helyx", () => {
    expect(findConfigPath(tmpDir)).toBeNull();
  });
});

describe("getKitStatus — o workspace está defasado?", () => {
  it("kit igual ao plugin: em dia", async () => {
    await writeConfig(CONFIG_FILENAME, 'version: "1.0.0"\nkit_version: "0.4.0"\n');
    expect(getKitStatus(tmpDir, "0.4.0")).toMatchObject({ installed: "0.4.0", outdated: false });
  });

  it("kit anterior ao plugin: defasado", async () => {
    await writeConfig(CONFIG_FILENAME, 'version: "1.0.0"\nkit_version: "0.3.8"\n');
    expect(getKitStatus(tmpDir, "0.4.0")).toMatchObject({ installed: "0.3.8", outdated: true });
  });

  it("SEM kit_version = estrutura anterior ao versionamento — a mais defasada de todas", async () => {
    await writeConfig(LEGACY_CONFIG_FILENAME, 'version: "1.0.0"\nproject:\n  name: "legado"\n');
    expect(getKitStatus(tmpDir, "0.4.0")).toMatchObject({
      installed: null,
      outdated: true,
      legacyConfigName: true,
    });
  });

  it("kit à frente do plugin (usuário fez downgrade) não é 'defasado'", async () => {
    await writeConfig(CONFIG_FILENAME, 'version: "1.0.0"\nkit_version: "0.9.0"\n');
    expect(getKitStatus(tmpDir, "0.4.0")?.outdated).toBe(false);
  });

  it("pasta que não é workspace Helyx devolve null", () => {
    expect(getKitStatus(tmpDir, "0.4.0")).toBeNull();
  });

  it("config corrompido não explode — trata como sem versão", async () => {
    await writeConfig(CONFIG_FILENAME, "version: [\n  quebrado");
    expect(readKitVersion(tmpDir)).toBeNull();
  });
});

// A6 / H-BUG-10: o `migrateKit` aplicava o kit brownfield num projeto
// greenfield — precisa saber o modo, e o config greenfield não grava `project.mode`.
describe("readProjectMode — greenfield ou brownfield, pelo config (A6 / H-BUG-10)", () => {
  it("project.mode declarado vale", async () => {
    await writeConfig(CONFIG_FILENAME, 'project:\n  name: "a"\n  mode: greenfield\n');
    expect(readProjectMode(tmpDir)).toBe("greenfield");
    await writeConfig(CONFIG_FILENAME, 'project:\n  name: "a"\n  mode: brownfield\nstacks:\n  backend: "x"\n');
    expect(readProjectMode(tmpDir)).toBe("brownfield");
  });

  it("REGRESSÃO: config do Wizard greenfield (sem project.mode, com stacks:) é greenfield — inclusive no nome legado", async () => {
    await writeConfig(LEGACY_CONFIG_FILENAME, 'version: "1.0.0"\nproject:\n  name: "orbita"\n  slug: "orbita"\n  \nstacks:\n  backend: "python-api"\nhost_adapter: "claude"\n');
    expect(readProjectMode(tmpDir)).toBe("greenfield");
  });

  it("config brownfield do Wizard e config multi-repo do Foundation são brownfield", async () => {
    await writeConfig(CONFIG_FILENAME, 'version: "1.0.0"\nproject:\n  name: "ws"\n  slug: "ws"\n  mode: brownfield\nhost_adapter: "claude"\n');
    expect(readProjectMode(tmpDir)).toBe("brownfield");
    await writeConfig(CONFIG_FILENAME, 'kit_version: "0.9.10"\nrepos:\n  app-a:\n    skills: [coding-guidelines-app-a]\n');
    expect(readProjectMode(tmpDir)).toBe("brownfield");
  });

  it("sem config ou com config corrompido: null (modo desconhecido)", async () => {
    expect(readProjectMode(tmpDir)).toBeNull();
    await writeConfig(CONFIG_FILENAME, "version: [\n  quebrado");
    expect(readProjectMode(tmpDir)).toBeNull();
  });
});

describe("isClientOwned — a migração não pode destruir trabalho", () => {
  it.each([
    "agents/domain/faturamento.agent.md",
    "agents/domain/sinistros.agent.md",
    "skills/coding-guidelines-billing-api/SKILL.md",
    "skills/coding-guidelines-legacy-erp/SKILL.md",
  ])("%s é do CLIENTE — jamais sobrescrever", (p) => {
    expect(isClientOwned(p)).toBe(true);
  });

  it.each([
    "agents/discovery/assessor.agent.md",
    "agents/planning/modernization-planner.agent.md",
    "agents/execution/feature-adder.agent.md",
    "skills/arch-hexagonal/SKILL.md",
    "chatmodes/maestro.chatmode.md",
  ])("%s é do KIT — pode migrar", (p) => {
    expect(isClientOwned(p)).toBe(false);
  });

  it("a LLM Wiki é o ativo mais caro do workspace — protegida por prefixo", () => {
    // Qualquer agente de domínio, com qualquer nome, é do cliente.
    expect(isClientOwned("agents/domain/qualquer-contexto-novo.agent.md")).toBe(true);
  });

  it("skill de coding-guidelines de QUALQUER repo é do cliente", () => {
    expect(isClientOwned("skills/coding-guidelines-repo-que-nem-existia.md")).toBe(true);
  });
});

describe("upsertKitVersion — preserva o config do cliente", () => {
  const CONFIG = `# Generated by Helyx on 2026-01-01
version: "1.0.0"
project:
  name: "meu-ws"    # nome do projeto
host: claude
`;

  it("insere kit_version logo após version:", () => {
    const out = upsertKitVersion(CONFIG, "0.4.0");
    expect(out).toMatch(/version: "1\.0\.0"\nkit_version: "0\.4\.0"/);
  });

  it("NÃO destrói comentários (yaml.dump apagaria)", () => {
    const out = upsertKitVersion(CONFIG, "0.4.0");
    expect(out).toContain("# Generated by Helyx on 2026-01-01");
    expect(out).toContain("# nome do projeto");
  });

  it("atualiza versão existente em vez de duplicar", () => {
    const once = upsertKitVersion(CONFIG, "0.4.0");
    const twice = upsertKitVersion(once, "0.5.0");
    expect(twice.split("\n").filter((l) => l.startsWith("kit_version:")).length).toBe(1);
    expect(twice).toMatch(/kit_version: "0\.5\.0"/);
  });

  it("config sem `version:` ainda recebe o kit_version", () => {
    const out = upsertKitVersion('host: claude\n', "0.4.0");
    expect(out).toMatch(/kit_version: "0\.4\.0"/);
  });

  // M1 (achado da F0.4): a 1ª chamada insere a linha com comentário; a 2ª a
  // reescrevia sem ele — o migrateKit não era idempotente byte a byte.
  it("REGRESSÃO M1: atualizar o kit_version existente preserva o comentário da linha", () => {
    const once = upsertKitVersion(CONFIG, "0.4.0");
    expect(once).toContain(`kit_version: "0.4.0"   # versão da ${BRAND.displayName} que instalou esta estrutura\n`);
    expect(upsertKitVersion(once, "0.4.0")).toBe(once);
    expect(upsertKitVersion(once, "0.5.0")).toBe(once.replace('kit_version: "0.4.0"', 'kit_version: "0.5.0"'));
  });

  it("REGRESSÃO M1: comentário do usuário na linha sobrevive com valor entre aspas simples, duplas ou sem aspas", () => {
    for (const value of ['"0.3.0"', "'0.3.0'", "0.3.0"]) {
      const out = upsertKitVersion(`version: "1"\nkit_version: ${value}  # fixado pelo time\nhost: claude\n`, "0.4.0");
      expect(out, value).toBe('version: "1"\nkit_version: "0.4.0"  # fixado pelo time\nhost: claude\n');
    }
  });

  it("linha kit_version sem comentário continua sem comentário", () => {
    expect(upsertKitVersion('kit_version: "0.3.0"\nhost: claude\n', "0.4.0")).toBe('kit_version: "0.4.0"\nhost: claude\n');
  });
});

describe("kitVersion — fonte única: o package.json da extensão", () => {
  it("lê a versão real do plugin (hardcodar divergiria no primeiro release)", async () => {
    const { kitVersion } = await import("../src/data/kit-version");
    const pkg = JSON.parse(
      await fs.readFile(path.resolve(__dirname, "../package.json"), "utf-8")
    ) as { version: string };
    expect(kitVersion()).toBe(pkg.version);
  });

  it("nunca devolve string vazia (o fallback é 0.0.0 = defasado, o lado seguro)", async () => {
    const { kitVersion } = await import("../src/data/kit-version");
    expect(kitVersion().length).toBeGreaterThan(0);
  });

  it("reconhece o package.json pelo nome do pacote no brand.json, não por um nome fixo (ADR-0013)", async () => {
    const { kitVersion } = await import("../src/data/kit-version");
    const { BRAND } = await import("../src/data/brand.pure");
    const pkg = JSON.parse(await fs.readFile(path.resolve(__dirname, "../package.json"), "utf-8")) as { name: string };
    expect(pkg.name).toBe(BRAND.package.name);
    expect(kitVersion()).not.toBe("0.0.0");
  });
});
