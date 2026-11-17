import { describe, it, expect, afterAll } from "vitest";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { StructureGenerator, type KitMigrationReport } from "../../src/generator/StructureGenerator";
import { KIT_LOCK_PATH, KIT_NEW_SUFFIX, type KitLock } from "../../src/generator/install/kit-lock";
import { kitVersion } from "../../src/data/kit-version";
import { BRAND } from "../../src/data/brand.pure";

/**
 * Step definitions de `kit-lock.feature` (F3.5, ADR-0018). O gerador roda
 * pelos pontos de entrada que a extensão chama (`installAgentStructure`,
 * `migrateKit`), em pastas temporárias.
 *
 * "Uma versão nova do kit" é simulada pelo lado do workspace: o arquivo
 * instalado e o lock passam a ser os de uma versão anterior (conteúdo antigo,
 * sha do conteúdo antigo), e a migração traz o kit de hoje.
 */
const FEATURE = path.join(__dirname, "kit-lock.feature");
const HD = ".claude";
const REFACTOR = `${HD}/agents/execution/refactor-agent.agent.md`;
const DISCONTINUED = `${HD}/agents/execution/agente-descontinuado.agent.md`;
const OLD_KIT = "---\nname: refactor-agent\ndescription: versão anterior do kit, só para o teste\n---\n# @refactor-agent (versão anterior do kit)\n";
const TEAM_EDIT = "\n<!-- regra do time: refatorar só com o par revisando -->\n";

type Steps = (() => void | Promise<void>) | "pendente";

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

const sha = (text: string | Buffer): string => crypto.createHash("sha256").update(text).digest("hex");
const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");
const write = (root: string, rel: string, body: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, "utf-8");
};
const lockOf = (root: string): KitLock => JSON.parse(read(root, KIT_LOCK_PATH)) as KitLock;
const setLock = (root: string, files: Record<string, string>): void => {
  const lock = lockOf(root);
  write(root, KIT_LOCK_PATH, `${JSON.stringify({ ...lock, files: { ...lock.files, ...files } }, null, 2)}\n`);
};

/** Dado um workspace instalado com o lock do kit. */
async function installed(harness: "claude" | "copilot" = "claude"): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-lock-"));
  tmpDirs.push(root);
  await new StructureGenerator().installAgentStructure(root, "ws", harness);
  return root;
}

/** E uma versão nova do kit que muda o agente "refactor-agent": o instalado e o lock passam a ser os da anterior. */
function previousKitVersionOfRefactorAgent(root: string, onDisk = OLD_KIT): void {
  write(root, REFACTOR, onDisk);
  setLock(root, { [REFACTOR]: sha(OLD_KIT) });
}

const migrate = (root: string): Promise<KitMigrationReport | null> => new StructureGenerator().migrateKit(root, "ws", "claude");

const SCENARIOS: Record<string, Steps> = {
  ...Object.fromEntries(
    (["claude", "copilot"] as const).map((harness) => [
      `A instalação registra o que o kit instalou [${harness}]`,
      async () => {
        const root = await installed(harness);
        const hd = harness === "claude" ? ".claude" : ".github";
        const lock = lockOf(root);
        expect({ schema: lock.schema, kit_version: lock.kit_version, edition: lock.edition, harness: lock.harness }).toEqual({ schema: 1, kit_version: kitVersion(), edition: "brownfield", harness });
        const instructions = harness === "claude" ? "CLAUDE.md" : ".github/copilot-instructions.md";
        for (const rel of [`${hd}/agents/execution/refactor-agent.agent.md`, `${hd}/agents/${BRAND.files.orchestratorAgent}`, `${hd}/skills/bdd-gherkin/SKILL.md`, instructions, "AGENTS.md"]) {
          expect(lock.files[rel], rel).toBe(sha(fs.readFileSync(path.join(root, rel))));
        }
        expect(Object.keys(lock.files).filter((rel) => rel.startsWith(`${hd}/agents/`)).length).toBeGreaterThan(20);
      },
    ])
  ),

  "A migração atualiza o arquivo do kit que o time não alterou": async () => {
    const root = await installed();
    const current = read(root, REFACTOR);
    previousKitVersionOfRefactorAgent(root);
    const report = await migrate(root);
    expect(read(root, REFACTOR)).toBe(current);
    expect(lockOf(root).files[REFACTOR]).toBe(sha(current));
    expect(fs.existsSync(path.join(root, `${REFACTOR}${KIT_NEW_SUFFIX}`))).toBe(false);
    expect(report?.keptClientEdits).toEqual([]);
  },

  "A migração não sobrescreve o arquivo do kit que o time alterou e avisa": async () => {
    const root = await installed();
    const current = read(root, REFACTOR);
    previousKitVersionOfRefactorAgent(root, OLD_KIT + TEAM_EDIT);
    const report = await migrate(root);
    expect(read(root, REFACTOR)).toBe(OLD_KIT + TEAM_EDIT);
    expect(read(root, `${REFACTOR}${KIT_NEW_SUFFIX}`)).toBe(current);
    expect(report?.keptClientEdits).toEqual([REFACTOR]);
  },

  "A alteração do time continua protegida nas migrações seguintes": async () => {
    const root = await installed();
    write(root, REFACTOR, read(root, REFACTOR) + TEAM_EDIT);
    const edited = read(root, REFACTOR);
    expect((await migrate(root))?.keptClientEdits).toEqual([REFACTOR]);
    expect((await migrate(root))?.keptClientEdits).toEqual([REFACTOR]);
    expect(read(root, REFACTOR)).toBe(edited);
  },

  "Um arquivo que o kit deixou de ter sai, se o time não o alterou": async () => {
    const root = await installed();
    const body = "---\nname: agente-descontinuado\ndescription: agente de uma versão anterior do kit\n---\n";
    write(root, DISCONTINUED, body);
    setLock(root, { [DISCONTINUED]: sha(body) });
    const report = await migrate(root);
    expect(fs.existsSync(path.join(root, DISCONTINUED))).toBe(false);
    expect(report?.removed).toEqual([DISCONTINUED]);
    expect(lockOf(root).files[DISCONTINUED]).toBeUndefined();
  },

  "Um arquivo que o kit deixou de ter fica, se o time o alterou": async () => {
    const root = await installed();
    const body = "---\nname: agente-descontinuado\ndescription: agente de uma versão anterior do kit\n---\n";
    write(root, DISCONTINUED, body + TEAM_EDIT);
    setLock(root, { [DISCONTINUED]: sha(body) });
    const report = await migrate(root);
    expect(read(root, DISCONTINUED)).toBe(body + TEAM_EDIT);
    expect(report?.keptDiscontinued).toEqual([DISCONTINUED]);
  },

  "Um workspace anterior ao lock ganha o lock na primeira migração": async () => {
    const root = await installed();
    fs.rmSync(path.join(root, KIT_LOCK_PATH));
    const report = await migrate(root);
    expect(report?.withoutPreviousLock).toBe(true);
    expect(lockOf(root).files[REFACTOR]).toBe(sha(fs.readFileSync(path.join(root, REFACTOR))));
  },

  "O que é do time nunca entra no lock": async () => {
    const root = await installed();
    const team = [`${HD}/agents/domain/faturamento.agent.md`, `${HD}/skills/coding-guidelines-billing-api/SKILL.md`, `${HD}/skills/design-system-billing-web/SKILL.md`, ".github/artifacts/assessment/foundation-state.yaml", "docs/input/contrato.md"];
    for (const rel of team) write(root, rel, `# do time: ${rel}\n`);
    await migrate(root);
    const files = Object.keys(lockOf(root).files);
    expect(files.filter((rel) => team.includes(rel))).toEqual([]);
    for (const rel of team) expect(read(root, rel)).toBe(`# do time: ${rel}\n`);
  },
};

describe("Funcionalidade: Lock do kit que separa o que é do kit do que o time alterou", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) {
    if (steps === "pendente") it.todo(`Cenário: ${title}`);
    else it(`Cenário: ${title}`, steps, 30_000);
  }
});
