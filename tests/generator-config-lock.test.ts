import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import * as os from "os";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { CONFIG_FILENAME, kitVersion } from "../src/data/kit-version";

/**
 * O gerador grava o config do workspace (`<marca>.config.yaml`) sob o mesmo
 * lock de arquivo do estado (`src/state/lock`, ADR-0017): o config é editado
 * também por agente e pelo Cockpit, e uma escrita sem lock intercalada com
 * outra perde uma das duas. Antes, a instalação e o `migrateKit` gravavam com
 * `fs.writeFile` direto.
 *
 * O teste segura o lock (`<config>.lock`, como faz o `atomicWrite`) e confere
 * que o gerador espera a liberação antes de gravar.
 */

let tmpDir: string;
const configPath = (): string => path.join(tmpDir, CONFIG_FILENAME);
const lockPath = (): string => `${configPath()}.lock`;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jatai-config-lock-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("REGRESSÃO: o gerador grava o config sob o lock do src/state", () => {
  it("migrateKit espera o lock do config ser liberado para gravar o kit_version", async () => {
    await fs.writeFile(configPath(), '# config do time\nversion: "1.0.0"\nhost_adapter: "claude"\n', "utf-8");
    await fs.writeFile(lockPath(), "outro-processo", "utf-8");

    const migration = new StructureGenerator().migrateKit(tmpDir, "ws", "claude");
    await delay(600);
    expect(readFileSync(configPath(), "utf-8"), "gravou com o lock de outro processo").not.toContain("kit_version");

    await fs.rm(lockPath(), { force: true });
    await migration;
    expect(readFileSync(configPath(), "utf-8")).toContain(`kit_version: "${kitVersion()}"`);
    expect(readFileSync(configPath(), "utf-8")).toContain("# config do time");
    expect(existsSync(lockPath())).toBe(false);
  }, 15_000);

  it("installAgentStructure espera o lock do config ser liberado para criá-lo", async () => {
    await fs.writeFile(lockPath(), "outro-processo", "utf-8");

    const install = new StructureGenerator().installAgentStructure(tmpDir, "ws", "copilot");
    await delay(600);
    expect(existsSync(configPath()), "criou o config com o lock de outro processo").toBe(false);

    await fs.rm(lockPath(), { force: true });
    await install;
    expect(readFileSync(configPath(), "utf-8")).toContain(`kit_version: "${kitVersion()}"`);
    expect(existsSync(lockPath())).toBe(false);
  }, 15_000);
});
