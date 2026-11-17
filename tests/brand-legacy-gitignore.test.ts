import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { GITIGNORE_KEEP_REPOS_MARKER, GITIGNORE_KEEP_REPOS_MARKERS, StructureGenerator } from "../src/generator/StructureGenerator";
import { BRAND } from "../src/data/brand.pure";

/**
 * Expand da F1.3 (ADR-0013), superfície "marcador do .gitignore": quem
 * decidiu versionar `repos/` gravou a linha de opt-out com o nome da marca da
 * época. Trocar a marca não pode reverter a decisão na próxima migração.
 */

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "brand-legacy-gitignore-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("marcadores de opt-out de repos/", () => {
  it("o atual primeiro, depois os do brand.json", () => {
    expect(GITIGNORE_KEEP_REPOS_MARKER).toBe(BRAND.gitignoreMarker);
    expect(GITIGNORE_KEEP_REPOS_MARKERS).toEqual([BRAND.gitignoreMarker, ...BRAND.legacy.gitignoreMarkers]);
  });

  it.each(GITIGNORE_KEEP_REPOS_MARKERS.map((m) => [m]))("com %s no .gitignore, o migrateKit não reinsere /repos/", async (marker) => {
    const before = `# decisão explícita\n${marker}\n`;
    await fs.writeFile(path.join(tmpDir, ".gitignore"), before);
    await new StructureGenerator().migrateKit(tmpDir, "ws", "copilot");
    const after = await fs.readFile(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(after.startsWith(before)).toBe(true);
    expect(after.split("\n")).not.toContain("/repos/");
  });
});
