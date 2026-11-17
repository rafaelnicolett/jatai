import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { CONFIG_FILENAME, CONFIG_FILENAMES, LEGACY_CONFIG_FILENAMES, findConfigPath, getKitStatus, kitVersion, readKitVersion } from "../src/data/kit-version";
import { isHelyxWorkspace, shouldStartWorkspaceServices } from "../src/data/workspace-activation";
import { validateWorkspaceDir } from "../src/wizard/workspace-validation";
import { ConfigLoader } from "../src/adapters/config/ConfigLoader";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { BRAND } from "../src/data/brand.pure";

/**
 * Expand da F1.3 (ADR-0013), superfície "config": todo config de marca
 * anterior (`brand.json › legacy.configFiles`) é reconhecido como workspace e
 * migrado para o nome canônico, no modelo da migração
 * `ai-sdk.config.yaml → helyx.config.yaml` que já existia.
 *
 * Os casos vêm da lista do brand.json: hoje ela tem o `ai-sdk.config.yaml`;
 * quando a marca troca, o config da marca anterior entra na lista e passa a
 * ser coberto aqui sem mudar o teste.
 */

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "brand-legacy-config-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const write = async (rel: string, body: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(tmpDir, rel)), { recursive: true });
  await fs.writeFile(path.join(tmpDir, rel), body);
};
const exists = (rel: string): Promise<boolean> => fs.access(path.join(tmpDir, rel)).then(() => true, () => false);

describe("nomes de config — o canônico primeiro, depois os legados do brand.json", () => {
  it("CONFIG_FILENAMES = [files.config, ...legacy.configFiles]", () => {
    expect(CONFIG_FILENAMES).toEqual([BRAND.files.config, ...BRAND.legacy.configFiles]);
    expect(LEGACY_CONFIG_FILENAMES).not.toContain(CONFIG_FILENAME);
  });

  it("o manifesto ativa por todos eles (workspaceContains)", async () => {
    const pkg = JSON.parse(await fs.readFile(path.resolve(__dirname, "../package.json"), "utf-8")) as { activationEvents: string[] };
    const fromManifest = pkg.activationEvents.filter((e) => e.startsWith("workspaceContains:")).map((e) => e.slice("workspaceContains:".length));
    expect(fromManifest).toEqual([...CONFIG_FILENAMES]);
  });
});

describe.each(LEGACY_CONFIG_FILENAMES.map((name) => [name]))("config legado %s", (legacy) => {
  it("findConfigPath acha e getKitStatus marca como legado", async () => {
    await write(legacy, 'version: "1.0.0"\nkit_version: "0.9.10"\n');
    expect(findConfigPath(tmpDir)).toBe(path.join(tmpDir, legacy));
    expect(getKitStatus(tmpDir, "1.0.0")).toMatchObject({ installed: "0.9.10", legacyConfigName: true });
  });

  it("com o canônico presente, o canônico vence", async () => {
    await write(legacy, 'kit_version: "0.1.0"\n');
    await write(CONFIG_FILENAME, 'kit_version: "0.2.0"\n');
    expect(findConfigPath(tmpDir)).toBe(path.join(tmpDir, CONFIG_FILENAME));
    expect(readKitVersion(tmpDir)).toBe("0.2.0");
  });

  it("ativa os serviços do workspace (predicado de ativação)", () => {
    expect(isHelyxWorkspace([legacy])).toBe(true);
    expect(shouldStartWorkspaceServices({ hasFolder: true, trusted: true, rootEntries: [legacy] })).toBe(true);
  });

  it("o Wizard reconhece como workspace existente (retomada, não pasta suja)", async () => {
    await write(legacy, 'version: "1.0.0"\n');
    const result = await validateWorkspaceDir(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.reason).toMatch(/retomado/);
  });

  it("o ConfigLoader enxerga o config (isConfigured)", async () => {
    await write(legacy, "repos:\n  app-a:\n    skills:\n      - coding-guidelines-app-a\n");
    const loader = new ConfigLoader([{ uri: { fsPath: tmpDir } }] as never);
    expect(await loader.isConfigured()).toBe(true);
  });

  it("o migrateKit adota o nome canônico, preserva comentários e só então apaga o legado", async () => {
    await write(legacy, '# meu config\nversion: "1.0.0"\nhost_adapter: "copilot"\nproject:\n  name: "ws"   # não perder\n');
    await new StructureGenerator().migrateKit(tmpDir, "ws", "copilot");
    expect(await exists(legacy)).toBe(false);
    const canonical = await fs.readFile(path.join(tmpDir, CONFIG_FILENAME), "utf-8");
    expect(canonical).toContain("# meu config");
    expect(canonical).toContain('name: "ws"   # não perder');
    expect(canonical).toContain(`kit_version: "${kitVersion()}"`);
  });
});
