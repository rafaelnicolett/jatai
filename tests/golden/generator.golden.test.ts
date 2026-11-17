import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import * as yaml from "js-yaml";

/**
 * Golden master do gerador — F0.4 lane A (mod-missao-open-source, ADR-0012).
 *
 * Congela, byte a byte, o que a metodologia instala no workspace do usuário,
 * pelos pontos de entrada reais de `src/generator/StructureGenerator.ts` que a
 * extensão chama: `generate()` (Wizard greenfield, comando
 * `helyx._generateStructure`), `installAgentStructure()` (Wizard brownfield,
 * `helyx._installAgentStructure`) e `migrateKit()` (`helyx.migrateKit`).
 * Casos em `lib/generator-cases.ts`, harness em `lib/`, goldens em
 * `__golden__/generator/`. Ver `tests/golden/README.md`.
 *
 * Isolamento:
 * - **Rede:** desde a F2.1 o gerador não tem registry (ADR-0015): os casos
 *   locais usam a `NullTemplateSource` padrão e os casos zip injetam uma
 *   `TemplateSource` falsa (`FakeTemplateSource`, abaixo). `fetch` global
 *   vira erro, como rede de segurança.
 * - **Disco:** toda escrita vai para pastas de `os.tmpdir()` (`lib/sandbox.ts`).
 * - **Sem SQLite:** desde a ADR-0017 (F3.3) o estado é só YAML. O greenfield
 *   não ganha mais `.github/artifacts/.state-service/state.sqlite`, e o caso
 *   `-sem-wasm`, que pinava essa diferença, saiu junto.
 *
 * Behavior pinned on 2026-11-14. Modifying these goldens requires reviewing if
 * the change is intentional (refactor = golden idêntico; ver README).
 */

const ctl = vi.hoisted(() => ({
  registry: { kind: "offline" } as { kind: "offline" } | { kind: "zip" } | { kind: "bytes"; text: string },
  zip: null as Buffer | null,
  cacheHit: false,
  calls: [] as Array<{ fn: string; args: unknown[]; result: string }>,
}));

import { StructureGenerator } from "../../src/generator/StructureGenerator";
import type { ResolvedTemplateManifest, TemplateSource } from "../../src/adapters/templates/TemplateSource";
import { WizardStateSchema } from "../../src/types";
import { CURRENT_BRAND, GOLDEN_BRAND, currentBrandNormalization, normalizeBrand } from "./lib/brand";
import { normalize, type NormalizeOptions } from "./lib/normalize";
import { GOLDEN_ROOT, REPO_ROOT, packageVersion } from "./lib/paths";
import { cleanupSandboxes, makeSandbox, writeFixture } from "./lib/sandbox";
import { snapshotTree, entryToString, type TreeSnapshot } from "./lib/tree";
import { TreeGoldenGroup, UPDATE_GOLDEN, assertUpdateAllowed, type TreeCaseRecord } from "./lib/golden-store";
import {
  BROWNFIELD_CASES,
  GENERATOR_CASE_ORDER,
  GREENFIELD_CASES,
  MIGRATE_CASES,
  PAIRWISE_FACTORS,
  PAIRWISE_LEVELS,
  PAIRWISE_ROWS,
  ZIP_FIXTURE,
  caseTitle,
  legacyWorkspaceFixture,
  multiRepoWorkspaceFixture,
  type BrownfieldCase,
  type GreenfieldCase,
  type MigrateCase,
  type RawWizardState,
} from "./lib/generator-cases";

/**
 * `TemplateSource` plugada nos casos zip: devolve o que `ctl` manda (zip-fixture
 * ou bytes que não são zip) e registra a chamada. Sem fonte plugada (`offline`)
 * o caso usa o padrão da edição aberta, `NullTemplateSource`.
 */
class FakeTemplateSource implements TemplateSource {
  async getManifest(): Promise<ResolvedTemplateManifest | null> {
    throw new Error("getManifest não faz parte da geração");
  }
  async getZip(templateId: string, version?: string): Promise<Buffer | null> {
    if (ctl.registry.kind === "bytes") {
      const bytes = Buffer.from(ctl.registry.text, "utf-8");
      ctl.calls.push({ fn: "templateSource.getZip", args: [templateId, version ?? null], result: `${bytes.length} bytes que não são zip` });
      return bytes;
    }
    ctl.calls.push({ fn: "templateSource.getZip", args: [templateId, version ?? null], result: `zip de ${ctl.zip!.length} bytes` });
    return ctl.zip;
  }
}

function pluggedTemplateSource(): TemplateSource | undefined {
  const plugged = ctl.registry.kind !== "offline" || (ctl.cacheHit && ctl.zip !== null);
  return plugged ? new FakeTemplateSource() : undefined;
}

const group = new TreeGoldenGroup(path.join(GOLDEN_ROOT, "generator"), GENERATOR_CASE_ORDER);
const results = new Map<string, TreeCaseRecord>();
const idempotency = new Map<string, { first: TreeSnapshot; second: TreeSnapshot }>();

function normalizeOptions(sandbox: string): NormalizeOptions {
  return { eol: true, roots: [{ path: sandbox, placeholder: "<SANDBOX>" }], kitVersion: packageVersion(), brand: currentBrandNormalization() };
}

function snap(sandbox: string): Promise<TreeSnapshot> {
  return snapshotTree(sandbox, { normalize: normalizeOptions(sandbox) });
}

/** Normaliza valores observados (mensagens, chamadas) do mesmo jeito que o conteúdo. */
function normalizeValue<T>(value: T, sandbox: string): T {
  return JSON.parse(normalize(JSON.stringify(value), { ...normalizeOptions(sandbox), eol: false })) as T;
}

async function buildZipFixture(): Promise<Buffer> {
  const zip = new JSZip();
  const date = new Date(Date.UTC(2020, 0, 1));
  for (const entry of ZIP_FIXTURE) {
    if (entry.dir) {
      zip.folder(entry.name.replace(/\/$/, ""));
      continue;
    }
    const data = entry.bytes ? Buffer.from(entry.bytes) : (entry.text ?? "");
    zip.file(entry.name, data, { date, binary: entry.bytes !== undefined, unixPermissions: entry.unixPermissions ?? 0o644 });
  }
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX", compression: "STORE" });
}

async function generateInto(state: RawWizardState, target: string): Promise<{ input: unknown; outcome: unknown }> {
  const parsed = WizardStateSchema.parse(state);
  try {
    const isLocal = await new StructureGenerator(pluggedTemplateSource()).generate({ ...parsed, targetDirectory: target });
    return { input: parsed, outcome: { resolved: { isLocal } } };
  } catch (err) {
    return { input: parsed, outcome: { rejected: err instanceof Error ? err.message : String(err) } };
  }
}

async function runGreenfield(c: GreenfieldCase): Promise<TreeCaseRecord> {
  const sandbox = makeSandbox("gen");
  const target = path.join(sandbox, "projeto");
  if (c.preexisting) writeFixture(target, c.preexisting);
  ctl.registry = c.registry;
  ctl.cacheHit = c.cacheHit ?? false;
  ctl.calls = [];
  const observed = await generateInto(c.state, target);
  return {
    id: c.id,
    base: c.base,
    input: observed.input,
    outcome: normalizeValue(observed.outcome, sandbox),
    calls: normalizeValue(ctl.calls, sandbox),
    snapshot: await snap(sandbox),
  };
}

async function runBrownfield(c: BrownfieldCase, hostOverride?: string, maturityOverride?: string[]): Promise<TreeCaseRecord> {
  const sandbox = makeSandbox("bf");
  const ws = path.join(sandbox, "workspace");
  fs.mkdirSync(ws, { recursive: true });
  if (c.preexisting) writeFixture(ws, c.preexisting);
  const host = hostOverride ?? c.host;
  const maturity = maturityOverride ?? (c.maturity ? [...c.maturity] : undefined);
  let outcome: unknown;
  try {
    await new StructureGenerator().installAgentStructure(ws, c.projectName, host, maturity);
    outcome = { resolved: true };
  } catch (err) {
    outcome = { rejected: err instanceof Error ? err.message : String(err) };
  }
  return {
    id: c.id,
    base: c.base,
    // Os nomes da fixture seguem a marca atual (`<slug>.config.yaml`, …): entram na marca do golden.
    input: { hostAdapter: host, projectName: c.projectName, maturityFrameworks: maturity ?? null, preexisting: Object.keys(c.preexisting ?? {}).map((k) => normalizeBrand(k, currentBrandNormalization())).sort() },
    outcome: normalizeValue(outcome, sandbox),
    calls: null,
    snapshot: await snap(sandbox),
  };
}

async function runMigrate(c: MigrateCase): Promise<TreeCaseRecord> {
  const sandbox = makeSandbox("mig");
  const root = path.join(sandbox, c.fixture === "greenfield" ? "projeto" : "workspace");
  if (c.fixture === "greenfield") {
    ctl.registry = { kind: "offline" };
    ctl.cacheHit = false;
    await generateInto({ projectName: c.projectName, hostAdapter: c.host, backendStack: "python-api" }, root);
  } else {
    fs.mkdirSync(root, { recursive: true });
    writeFixture(root, c.fixture === "legado" ? legacyWorkspaceFixture(c.host) : multiRepoWorkspaceFixture(c.host));
  }
  const gen = new StructureGenerator();
  let outcome: unknown;
  try {
    await gen.migrateKit(root, c.projectName, c.host);
    outcome = { resolved: true };
  } catch (err) {
    outcome = { rejected: err instanceof Error ? err.message : String(err) };
  }
  const first = await snap(sandbox);
  await gen.migrateKit(root, c.projectName, c.host);
  idempotency.set(c.id, { first, second: await snap(sandbox) });
  return {
    id: c.id,
    base: c.base,
    input: { hostAdapter: c.host, projectName: c.projectName, fixture: c.fixture },
    outcome: normalizeValue(outcome, sandbox),
    calls: null,
    snapshot: first,
  };
}

function entriesAsStrings(s: TreeSnapshot): Record<string, string> {
  return Object.fromEntries([...s.entries.entries()].map(([p, e]) => [p, entryToString(e)]));
}

function text(id: string, rel: string): string {
  const rec = results.get(id);
  const bytes = rec?.snapshot.contents.get(rel);
  if (!bytes) throw new Error(`${id}: arquivo ausente na saída: ${rel}`);
  return bytes.toString("utf-8");
}

function entry(id: string, rel: string): string | undefined {
  const e = results.get(id)?.snapshot.entries.get(rel);
  return e ? entryToString(e) : undefined;
}

function checkAgainstGolden(id: string): void {
  const rec = results.get(id);
  if (!rec) throw new Error(`caso não executado: ${id}`);
  if (UPDATE_GOLDEN) return; // gravado no afterAll
  const { differences } = group.compare(rec);
  const report = `\n${differences.length} diferença(s) em '${id}' (UPDATE_GOLDEN=1 regrava; revise antes):\n${differences.slice(0, 40).join("\n")}`;
  expect(differences, report).toEqual([]);
}

beforeAll(async () => {
  assertUpdateAllowed();
  vi.stubGlobal("fetch", () => Promise.reject(new Error("golden: rede proibida")));
  ctl.zip = await buildZipFixture();
}, 60_000);

afterAll(() => {
  if (UPDATE_GOLDEN) {
    for (const id of GENERATOR_CASE_ORDER) {
      const rec = results.get(id);
      if (rec) group.record(rec);
    }
    group.writeAll();
  }
  vi.unstubAllGlobals();
  cleanupSandboxes();
});

/**
 * ADR-0025: as instruções dos dois harnesses dizem a mesma coisa — a entrada
 * é o agente orquestrador da marca (`helyx` na marca do golden), escolhido
 * como `@helyx` no Claude Code e no seletor de agentes do Copilot. Nenhuma
 * manda usar o `@maestro` ou um chat mode.
 */
function expectEntryByOrchestratorAgent(id: string, files: readonly string[]): void {
  for (const file of files) {
    const body = text(id, file);
    expect(body, `${id}: ${file}`).toContain("agente orquestrador `helyx`");
    expect(body, `${id}: ${file}`).not.toContain("@maestro");
    expect(body, `${id}: ${file}`).not.toMatch(/chat mode/i);
  }
}

describe("golden do gerador — greenfield (generate)", () => {
  beforeAll(async () => {
    for (const c of GREENFIELD_CASES) results.set(c.id, await runGreenfield(c));
  }, 180_000);

  for (const c of GREENFIELD_CASES) {
    it(caseTitle(c), () => checkAgainstGolden(c.id));
  }

  it("a matriz pairwise cobre todo par de níveis de quaisquer dois eixos do Wizard", () => {
    const missing: string[] = [];
    PAIRWISE_FACTORS.forEach((fa, i) => {
      PAIRWISE_FACTORS.forEach((fb, j) => {
        if (j <= i) return;
        for (const a of PAIRWISE_LEVELS[fa]) {
          for (const b of PAIRWISE_LEVELS[fb]) {
            if (!PAIRWISE_ROWS.some((row) => row[i] === a && row[j] === b)) missing.push(`${fa}=${a} × ${fb}=${b}`);
          }
        }
      });
    });
    expect(missing).toEqual([]);
  });

  it("ADR-0017: o greenfield não grava mais nada em .github/artifacts/.state-service/ (sem espelho SQLite)", () => {
    const tree = entriesAsStrings(results.get("greenfield-claude-padrao")!.snapshot);
    expect(Object.keys(tree).filter((p) => p.includes(".state-service/"))).toEqual([]);
  });

  it("determinismo: gerar duas vezes o mesmo caso produz árvores idênticas", async () => {
    const c = GREENFIELD_CASES.find((x) => x.id === "greenfield-copilot-padrao")!;
    const again = await runGreenfield(c);
    expect(entriesAsStrings(again.snapshot)).toEqual(entriesAsStrings(results.get(c.id)!.snapshot));
  });

  // Corrigido na F3.5 (era @known-bug F0.2 §7.1 / GAP-10): o greenfield recebia
  // os 20 agentes do roster brownfield. O manifesto do kit não os manda mais.
  it("REGRESSÃO: F0.2 §7.1 — projeto greenfield não recebe o roster brownfield (discovery/planning/execution), só os agentes greenfield", () => {
    for (const [id, dir] of [["greenfield-claude-padrao", ".claude"], ["greenfield-copilot-padrao", ".github"]] as const) {
      const agents = [...results.get(id)!.snapshot.entries.keys()].filter((p) => p.startsWith(`projeto/${dir}/agents/`) && p.endsWith(".agent.md"));
      for (const stream of ["discovery", "planning", "execution"]) {
        expect(agents.filter((p) => p.startsWith(`projeto/${dir}/agents/${stream}/`)), `${id}: ${stream}`).toEqual([]);
      }
      expect(agents.some((p) => p.startsWith(`projeto/${dir}/agents/upstream/`))).toBe(true);
    }
  });

  // A18, corrigido na F3.5: o orquestrador greenfield detectava o host por duas
  // linhas (".claude/agents/ → Claude Code", ".github/agents/ → Copilot"); a
  // adaptação ao Claude reescreve .github/agents/ e a segunda linha passava a
  // dizer que .claude/agents/ é o host do Copilot.
  it("REGRESSÃO: A18 — o orquestrador greenfield aponta a pasta de agentes do próprio harness, sem detecção que a adaptação ao Claude contradiz", () => {
    const claude = text("greenfield-claude-padrao", "projeto/.claude/agents/helyx.agent.md");
    expect(claude).not.toContain("(GitHub Copilot host)");
    expect(claude).toContain("`<AGENTS_DIR>` = `.claude/agents/`");
    expect(claude).not.toContain(".github/agents/");
    const copilot = text("greenfield-copilot-padrao", "projeto/.github/agents/helyx.agent.md");
    expect(copilot).toContain("`<AGENTS_DIR>` = `.github/agents/`");
  });

  // ADR-0025: o orquestrador é o agente da marca nos dois harnesses. No
  // Copilot era `maestro.agent.md`, com `name` igual ao nome de exibição; o
  // Claude Code só aceita nome de subagente em minúsculas e hífen.
  it("REGRESSÃO: ADR-0025 — o orquestrador é o agente da marca nos dois harnesses (arquivo e name), greenfield", () => {
    for (const [id, file] of [
      ["greenfield-claude-padrao", "projeto/.claude/agents/helyx.agent.md"],
      ["greenfield-copilot-padrao", "projeto/.github/agents/helyx.agent.md"],
    ] as const) {
      expect(text(id, file), id).toMatch(/^name: "helyx"$/m);
      expect([...results.get(id)!.snapshot.entries.keys()].filter((p) => p.endsWith("/maestro.agent.md")), id).toEqual([]);
    }
  });

  it("REGRESSÃO: ADR-0025 — CLAUDE.md, copilot-instructions.md e AGENTS.md mandam entrar pelo agente orquestrador da marca (greenfield)", () => {
    expectEntryByOrchestratorAgent("greenfield-claude-padrao", ["projeto/CLAUDE.md", "projeto/AGENTS.md"]);
    expectEntryByOrchestratorAgent("greenfield-copilot-padrao", ["projeto/.github/copilot-instructions.md", "projeto/AGENTS.md"]);
    expect(text("greenfield-copilot-padrao", "projeto/.github/copilot-instructions.md")).toContain("seletor de agentes");
  });

  // A18, corrigido na F3.5: os agentes pedem AskUserQuestion (ferramenta do
  // Claude Code) nas pausas de validação humana, e o Copilot não tinha alternativa.
  it("REGRESSÃO: A18 — as instruções do Copilot dizem como fazer o AskUserQuestion e o TodoWrite no chat (greenfield)", () => {
    const instructions = text("greenfield-copilot-padrao", "projeto/.github/copilot-instructions.md");
    expect(instructions).toContain("## Perguntas ao humano no Copilot");
    expect(instructions).toContain("`AskUserQuestion`");
    expect(instructions).toContain("`TodoWrite`");
    expect(text("greenfield-claude-padrao", "projeto/CLAUDE.md")).not.toContain("## Perguntas ao humano no Copilot");
  });

  it("@known-bug: BUG-47 — CLAUDE.md diz 'Hexagonal / Ports & Adapters' mesmo com backendArchitecture=layered", () => {
    const id = "greenfield-pw-08"; // claude · java-spring · layered
    expect(results.get(id)!.input).toMatchObject({ hostAdapter: "claude", backendArchitecture: "layered" });
    expect(text(id, "projeto/CLAUDE.md")).toContain("- Hexagonal / Ports & Adapters (domain → application → adapters)");
  });

  it("@known-bug: BUG-45 — startupIdea com aspas/quebra de linha entra cru em main.py, pyproject.toml e pubspec.yaml", () => {
    const id = "greenfield-bug45-startupidea-sem-escape";
    expect(text(id, "projeto/code/services/orbita-api/src/main.py")).toContain('description="Agenda "fictícia" de testes\ncom segunda linha"');
    expect(text(id, "projeto/code/services/orbita-api/pyproject.toml")).toContain('description = "Agenda "fictícia" de testes\ncom segunda linha"');
    expect(text(id, "projeto/code/apps/orbita-web/pubspec.yaml")).toContain('description: "Agenda "fictícia" de testes\ncom segunda linha"');
  });

  it("@known-bug: BUG-46 — pasta não vazia é mesclada: arquivo do usuário fica, colisões são sobrescritas", () => {
    const id = "greenfield-bug46-pasta-existente";
    expect(results.get(id)!.outcome).toEqual({ resolved: { isLocal: true } });
    expect(text(id, "projeto/notas-do-usuario.md")).toBe("# notas que o usuário já tinha na pasta\n");
    expect(text(id, "projeto/docs/README.md")).toContain("# Documentação — orbita");
    expect(text(id, "projeto/AGENTS.md")).toContain("# Agents — orbita");
  });

  it("@known-bug: BUG-44 — caminho zip: PNG corrompido, {{message}} apagado, sem bit de execução e sem kit de agentes", () => {
    const id = "greenfield-zip-registry";
    const png = results.get(id)!.snapshot.contents.get("projeto/assets/logo.png")!;
    expect(png.subarray(0, 3).toString("hex")).toBe("efbfbd");
    const readme = text(id, "projeto/README.md");
    expect(readme).toContain("Vue colado: []");
    expect(readme).toContain("desconhecida: []");
    expect(readme).toContain("com espaços: [{{ project_name }}]");
    if (process.platform !== "win32") expect(entry(id, "projeto/scripts/mvnw")).toMatch(/^file 100644 /);
    const paths = [...results.get(id)!.snapshot.entries.keys()];
    expect(paths.filter((p) => p.startsWith("projeto/.claude/agents/") && p.endsWith(".agent.md"))).toEqual(["projeto/.claude/agents/backend-python-api.agent.md"]);
    expect(paths.some((p) => p.includes(".github/scripts/"))).toBe(false);
  });

  it("zip-slip: a entrada '../fora-do-projeto.txt' cai DENTRO do projeto (o JSZip 3.10.1 resolve o nome; o gerador também valida, A16a)", () => {
    const id = "greenfield-zip-registry";
    const top = [...results.get(id)!.snapshot.entries.keys()].filter((p) => !p.slice(0, -1).includes("/"));
    expect(top).toEqual(["projeto/"]);
    expect(text(id, "projeto/fora-do-projeto.txt")).toBe("zip-slip painel-ficticio\n");
  });

  // F2.1 (ADR-0015): antes, o caminho zip consultava o cache, baixava do
  // registry e gravava em ~/.helyx/templates. Agora o gerador só pede o zip à
  // TemplateSource plugada; sem fonte plugada, nem isso.
  it("caminho zip: o gerador só pede o zip à TemplateSource plugada; sem fonte, nenhuma chamada", () => {
    expect((results.get("greenfield-zip-registry")!.calls as Array<{ fn: string }>).map((c) => c.fn)).toEqual(["templateSource.getZip"]);
    expect((results.get("greenfield-zip-cache")!.calls as Array<{ fn: string }>).map((c) => c.fn)).toEqual(["templateSource.getZip"]);
    expect(results.get("greenfield-claude-padrao")!.calls).toEqual([]);
  });

  it("@known-bug: BUG-43 — payload 200 que não é zip faz a geração falhar, com rollback (sandbox vazio)", () => {
    const rec = results.get("greenfield-zip-bug43-nao-zip")!;
    expect(rec.outcome).toMatchObject({ rejected: expect.stringContaining("is this a zip file") });
    expect(rec.snapshot.entries.size).toBe(0);
  });

  it("stack divergente lança 'Stack mismatch' e não deixa nada no sandbox", () => {
    const rec = results.get("greenfield-stack-divergente")!;
    expect(rec.outcome).toMatchObject({ rejected: expect.stringMatching(/^Stack mismatch: wizard selected "java-spring"/) });
    expect(rec.snapshot.entries.size).toBe(0);
  });

  // BUG-48, corrigido na F2.2 (ADR-0015): `.state-service/` guarda o token do
  // State Service (`server.json`); nunca pode ir para o git. O espelho SQLite
  // que também morava ali saiu na ADR-0017.
  it("BUG-48 — o .gitignore da raiz do greenfield ignora .github/artifacts/.state-service/", () => {
    for (const id of ["greenfield-claude-padrao", "greenfield-copilot-padrao", "greenfield-zip-registry"]) {
      expect(text(id, "projeto/.gitignore").split("\n"), id).toContain("/.github/artifacts/.state-service/");
    }
  });

  // Contrato agent-activity §6: `runs/` (eventos de atividade de agente) fica
  // fora do git. E o SQLite saiu na ADR-0017: o comentário não fala mais dele.
  it("REGRESSÃO: agent-activity §6 — o .gitignore do greenfield ignora .github/artifacts/runs/ e não fala de espelho SQLite", () => {
    for (const id of ["greenfield-claude-padrao", "greenfield-copilot-padrao", "greenfield-zip-registry"]) {
      const gitignore = text(id, "projeto/.gitignore");
      expect(gitignore.split("\n"), id).toContain("/.github/artifacts/runs/");
      expect(gitignore, id).not.toMatch(/sqlite/i);
    }
  });
});

describe("golden do gerador — brownfield (installAgentStructure)", () => {
  beforeAll(async () => {
    for (const c of BROWNFIELD_CASES) results.set(c.id, await runBrownfield(c));
  }, 120_000);

  for (const c of BROWNFIELD_CASES) {
    it(caseTitle(c), () => checkAgainstGolden(c.id));
  }

  // G8, corrigido na F3.5: o orquestrador do kit traz `model` com nomes de
  // modelo do Copilot ("... (copilot)"), que o Claude Code não reconhece. A
  // adaptação ao Claude tira a linha; o Copilot continua recebendo.
  it("REGRESSÃO: G8 — o orquestrador instalado no Claude Code não traz `model` com nomes do Copilot (greenfield e brownfield); o do Copilot traz", () => {
    for (const [id, file] of [["brownfield-claude-padrao", "workspace/.claude/agents/helyx.agent.md"], ["greenfield-claude-padrao", "projeto/.claude/agents/helyx.agent.md"]] as const) {
      expect(text(id, file), id).not.toContain("(copilot)");
      expect(text(id, file), id).not.toMatch(/^model:/m);
      expect(text(id, file), id).toMatch(/^description: /m);
    }
    expect(text("brownfield-copilot-padrao", "workspace/.github/agents/helyx.agent.md")).toContain('model: ["Claude Sonnet 4.5 (copilot)", "GPT-5 (copilot)"]');
  });

  it("REGRESSÃO: ADR-0025 — o orquestrador é o agente da marca nos dois harnesses (arquivo e name), brownfield", () => {
    for (const [id, file] of [
      ["brownfield-claude-padrao", "workspace/.claude/agents/helyx.agent.md"],
      ["brownfield-copilot-padrao", "workspace/.github/agents/helyx.agent.md"],
    ] as const) {
      expect(text(id, file), id).toMatch(/^name: "helyx"$/m);
      expect([...results.get(id)!.snapshot.entries.keys()].filter((p) => p.endsWith("/maestro.agent.md")), id).toEqual([]);
    }
  });

  it("REGRESSÃO: ADR-0025 — CLAUDE.md, copilot-instructions.md e AGENTS.md mandam entrar pelo agente orquestrador da marca (brownfield)", () => {
    expectEntryByOrchestratorAgent("brownfield-claude-padrao", ["workspace/CLAUDE.md", "workspace/AGENTS.md"]);
    expectEntryByOrchestratorAgent("brownfield-copilot-padrao", ["workspace/.github/copilot-instructions.md", "workspace/AGENTS.md"]);
    expect(text("brownfield-copilot-padrao", "workspace/.github/copilot-instructions.md")).toContain("seletor de agentes");
  });

  // A18, corrigido na F3.5 (o mesmo texto do greenfield, no kit brownfield).
  it("REGRESSÃO: A18 — as instruções do Copilot dizem como fazer o AskUserQuestion e o TodoWrite no chat (brownfield)", () => {
    const instructions = text("brownfield-copilot-padrao", "workspace/.github/copilot-instructions.md");
    expect(instructions).toContain("## Perguntas ao humano no Copilot");
    expect(instructions).toContain("`AskUserQuestion`");
    expect(instructions).toContain("`TodoWrite`");
    expect(text("brownfield-claude-padrao", "workspace/CLAUDE.md")).not.toContain("## Perguntas ao humano no Copilot");
  });

  it("hostAdapter desconhecido ('vscode') cai em copilot: árvore idêntica à do caso copilot padrão", async () => {
    const c = BROWNFIELD_CASES.find((x) => x.id === "brownfield-copilot-padrao")!;
    const rec = await runBrownfield(c, "vscode");
    expect(entriesAsStrings(rec.snapshot)).toEqual(entriesAsStrings(results.get(c.id)!.snapshot));
  });

  it("maturityFrameworks vazio ([]) equivale ao default ['dora-4keys']", async () => {
    const c = BROWNFIELD_CASES.find((x) => x.id === "brownfield-claude-padrao")!;
    const rec = await runBrownfield(c, undefined, []);
    expect(entriesAsStrings(rec.snapshot)).toEqual(entriesAsStrings(results.get(c.id)!.snapshot));
  });

  it("determinismo: instalar duas vezes em pastas novas produz árvores idênticas", async () => {
    const c = BROWNFIELD_CASES.find((x) => x.id === "brownfield-claude-padrao")!;
    const rec = await runBrownfield(c);
    expect(entriesAsStrings(rec.snapshot)).toEqual(entriesAsStrings(results.get(c.id)!.snapshot));
  });

  // C5 / BUG-08 corrigido na F6.1: o workspace tem config na raiz, então é
  // retomada. Nada do usuário ou do Foundation é sobrescrito; o kit só ganha
  // o que falta (e o .gitignore ganha /repos/, sem perder linha).
  it("REGRESSÃO: BUG-08 — retomada sobre trabalho existente preserva instruções, config do Foundation, docs/input/README, orquestrador do usuário e .github/artifacts", () => {
    const id = "brownfield-claude-workspace-existente";
    const pre = BROWNFIELD_CASES.find((c) => c.id === id)!.preexisting!;
    const asGolden = (rel: string): string => rel.split(`${CURRENT_BRAND.slug}.`).join(`${GOLDEN_BRAND.slug}.`);
    // .gitignore e .claude/settings.json recebem acréscimos do kit (abaixo); o resto fica byte a byte.
    for (const rel of Object.keys(pre).filter((r) => r !== ".gitignore" && r !== ".claude/settings.json")) {
      expect(text(id, `workspace/${asGolden(rel)}`), rel).toBe(pre[rel]);
    }
    // Contrato agent-activity: os hooks do kit entram no settings.json do time, que não perde nada.
    const settings = JSON.parse(text(id, "workspace/.claude/settings.json")) as { hooks: Record<string, unknown[]> } & Record<string, unknown>;
    expect({ ...settings, hooks: undefined }).toEqual({ ...(JSON.parse(pre[".claude/settings.json"]!) as Record<string, unknown>), hooks: undefined });
    expect(Object.keys(settings.hooks).sort()).toEqual(["PostToolUse", "SubagentStart", "SubagentStop"]);
    expect(text(id, "workspace/helyx.config.yaml")).toContain("repos:");
    expect(text(id, "workspace/helyx.config.yaml")).not.toContain("status: pending");
    expect(text(id, "workspace/.gitignore").startsWith(pre[".gitignore"]!)).toBe(true);
    expect(text(id, "workspace/.gitignore")).toContain("/repos/");
    expect(entry(id, "workspace/.claude/agents/discovery/assessor.agent.md")).toMatch(/^file /);
    expect(entry(id, "workspace/.claude/commands/helyx.md")).toMatch(/^file /);
    expect(entry(id, "workspace/.github/scripts/helyx-state.cjs")).toMatch(/kit-cli-bundle$/);
  });

  it("REGRESSÃO: na retomada, o agente de domínio do usuário não é reescrito ('.github/agents/' fica como está)", () => {
    expect(text("brownfield-claude-workspace-existente", "workspace/.claude/agents/domain/agendamento.agent.md")).toContain(
      "Referência: .github/agents/discovery/assessor.agent.md"
    );
  });

  // O opt-out vale só para `repos/`. O `.state-service/` (token local) é
  // sempre ignorado: BUG-48, F2.2 (ADR-0015).
  it("opt-out de repos/ no .gitignore é respeitado (/repos/ não volta) no workspace copilot existente; só a pasta do State Service e a de runs/ são acrescentadas", () => {
    expect(text("brownfield-copilot-workspace-existente", "workspace/.gitignore")).toBe(
      "# decisão explícita do usuário\nhelyx:repos-versionado-por-decisao-explicita\n\n" +
        "# Estado local do State Service (token em server.json) — nunca versionar.\n/.github/artifacts/.state-service/\n\n" +
        "# Eventos de atividade de agente (contrato agent-activity) — locais, nunca versionados.\n/.github/artifacts/runs/\n"
    );
  });

  it("@known-bug: projectName com aspas gera helyx.config.yaml que não é YAML válido", () => {
    const cfg = text("brownfield-copilot-nome-com-aspas", "workspace/helyx.config.yaml");
    expect(cfg).toContain('  name: "Workspace "Fictício" 2"');
    expect(() => yaml.load(cfg)).toThrow();
  });

  it("BUG-48 — o .gitignore do workspace ignora /repos/ e .github/artifacts/.state-service/ (token do State Service)", () => {
    for (const id of ["brownfield-claude-padrao", "brownfield-copilot-padrao", "brownfield-claude-workspace-existente"]) {
      const lines = text(id, "workspace/.gitignore").split("\n");
      expect(lines, id).toContain("/repos/");
      expect(lines, id).toContain("/.github/artifacts/.state-service/");
    }
  });

  it("REGRESSÃO: agent-activity §6 — o .gitignore do workspace brownfield instalado ignora .github/artifacts/runs/ e não fala de espelho SQLite", () => {
    for (const id of ["brownfield-claude-padrao", "brownfield-copilot-padrao", "brownfield-claude-workspace-existente"]) {
      const gitignore = text(id, "workspace/.gitignore");
      expect(gitignore.split("\n"), id).toContain("/.github/artifacts/runs/");
      expect(gitignore, id).not.toMatch(/sqlite/i);
    }
  });
});

describe("golden do gerador — migrateKit", () => {
  beforeAll(async () => {
    for (const c of MIGRATE_CASES) results.set(c.id, await runMigrate(c));
  }, 120_000);

  for (const c of MIGRATE_CASES) {
    it(caseTitle(c), () => checkAgainstGolden(c.id));
  }

  for (const c of MIGRATE_CASES.filter((x) => x.fixture !== "legado")) {
    it(`${c.id}: migrar duas vezes é idempotente (a 2ª execução não muda nada)`, () => {
      const run = idempotency.get(c.id)!;
      expect(entriesAsStrings(run.second)).toEqual(entriesAsStrings(run.first));
    });
  }

  // M1 (achado da F0.4), corrigido na F6.1: a 1ª migração de um config legado
  // insere `kit_version: "x"   # versão da Helyx que instalou esta estrutura`;
  // a 2ª achava a linha e a reescrevia SEM o comentário (`upsertKitVersion`).
  // Agora o comentário da linha é preservado e a migração é idempotente.
  for (const c of MIGRATE_CASES.filter((x) => x.fixture === "legado")) {
    it(`REGRESSÃO: ${c.id}: migrar duas vezes é idempotente byte a byte — o comentário da linha kit_version sobrevive (M1)`, () => {
      const run = idempotency.get(c.id)!;
      expect(entriesAsStrings(run.second)).toEqual(entriesAsStrings(run.first));
      const after = run.second.contents.get("workspace/helyx.config.yaml")!.toString("utf-8");
      expect(after).toContain('kit_version: "<KIT_VERSION>"   # versão da Helyx que instalou esta estrutura\n');
    });
  }

  // A7 / BUG-11, corrigido na F3.5: o migrateKit também reaplica agents/operation/
  // e o orquestrador do kit (no Claude, renomeado para <marca>.agent.md).
  it("REGRESSÃO: A7 / BUG-11 — o migrateKit atualiza o orquestrador e os agentes de agents/operation", () => {
    for (const [id, orchestrator] of [["migrate-claude-legado", ".claude/agents/helyx.agent.md"], ["migrate-copilot-legado", ".github/agents/helyx.agent.md"]] as const) {
      const hd = orchestrator.split("/")[0];
      expect(text(id, `workspace/${orchestrator}`), id).not.toContain("VERSÃO ANTIGA");
      expect(text(id, `workspace/${orchestrator}`), id).toContain("Orquestrador Brownfield");
      expect(text(id, `workspace/${hd}/agents/operation/devops.agent.md`), id).not.toContain("VERSÃO ANTIGA");
      expect(text(id, `workspace/${hd}/agents/operation/devops.agent.md`), id).toContain("id: devops");
      expect(text(id, `workspace/${hd}/agents/discovery/assessor.agent.md`), id).not.toContain("VERSÃO ANTIGA");
    }
    // O orquestrador do Claude é o do kit adaptado: paths do Claude, nada de maestro.agent.md solto.
    expect(entry("migrate-claude-legado", "workspace/.claude/agents/maestro.agent.md")).toBeUndefined();
    // ADR-0025: no Copilot o orquestrador do kit anterior (maestro.agent.md) fica guardado como .bak.
    expect(entry("migrate-copilot-legado", "workspace/.github/agents/maestro.agent.md")).toBeUndefined();
    expect(text("migrate-copilot-legado", "workspace/.github/agents/maestro.agent.md.bak")).toContain("VERSÃO ANTIGA DO KIT (fixture)");
  });

  it("REGRESSÃO: agent-activity §6 — o migrateKit acrescenta .github/artifacts/runs/ ao .gitignore e não fala de espelho SQLite", () => {
    for (const c of MIGRATE_CASES.filter((x) => x.fixture !== "greenfield")) {
      const gitignore = text(c.id, "workspace/.gitignore");
      expect(gitignore.split("\n"), c.id).toContain("/.github/artifacts/runs/");
      expect(gitignore, c.id).not.toMatch(/sqlite/i);
    }
  });

  // A21 corrigido na F6.1: a adaptação de paths do Claude pula o que é
  // CLIENT_OWNED (`isClientOwned`), e a LLM Wiki sai como entrou.
  it("REGRESSÃO: migrateKit (claude) não reescreve nada dentro de agents/domain/, que é CLIENT_OWNED (A21)", () => {
    const fixture = legacyWorkspaceFixture("claude")[".claude/agents/domain/agendamento.agent.md"];
    expect(fixture).toContain(".github/agents/discovery");
    expect(text("migrate-claude-legado", "workspace/.claude/agents/domain/agendamento.agent.md")).toBe(fixture);
    expect(text("migrate-copilot-legado", "workspace/.github/agents/domain/agendamento.agent.md")).toContain(".github/agents/discovery");
  });

  it("migra ai-sdk.config.yaml → helyx.config.yaml preservando comentários e inserindo kit_version após version:", () => {
    const id = "migrate-claude-legado";
    expect(entry(id, "workspace/ai-sdk.config.yaml")).toBeUndefined();
    expect(text(id, "workspace/helyx.config.yaml")).toBe(
      '# Config do workspace fictício (comentário do usuário)\nversion: "1.0.0"\nkit_version: "<KIT_VERSION>"   # versão da Helyx que instalou esta estrutura\nhost_adapter: "claude"\nproject:\n  name: "ws-legado"   # não perder\n'
    );
  });

  it("preserva trabalho do cliente e skills que o kit não traz mais (nada é apagado)", () => {
    const id = "migrate-copilot-multi-repo";
    expect(text(id, "workspace/repos/app-b/src/index.js")).toBe("module.exports = 1;\n");
    expect(text(id, "workspace/.github/skills/coding-guidelines-app-a/SKILL.md")).toBe("# padrão do app-a\n");
    expect(text("migrate-claude-legado", "workspace/.claude/skills/skill-removida-do-kit/SKILL.md")).toBe("# skill que o kit não traz mais\n");
    expect(entry(id, "workspace/.github/scripts/helyx-state.cjs")).toMatch(/kit-cli-bundle$/);
    expect(text(id, "workspace/helyx.config.yaml")).toBe(
      'kit_version: "<KIT_VERSION>"\nrepos:\n  app-a:\n    skills:\n      - coding-guidelines-app-a\n  app-b:\n    skills:\n      - coding-guidelines-app-b\n'
    );
  });

  // A6 / BUG-10 corrigido na F6.1: o config do Wizard greenfield (com `stacks:`)
  // identifica o projeto, e o migrateKit não aplica o kit brownfield nele.
  it("REGRESSÃO: BUG-10 — migrateKit num projeto greenfield não aplica o kit brownfield: a árvore fica igual à recém-gerada", async () => {
    const id = "migrate-claude-projeto-greenfield";
    const c = MIGRATE_CASES.find((x) => x.id === id)!;
    const sandbox = makeSandbox("mig-ref");
    ctl.registry = { kind: "offline" };
    ctl.cacheHit = false;
    await generateInto({ projectName: c.projectName, hostAdapter: c.host, backendStack: "python-api" }, path.join(sandbox, "projeto"));
    expect(entriesAsStrings(results.get(id)!.snapshot)).toEqual(entriesAsStrings(await snap(sandbox)));
    expect(text(id, "projeto/CLAUDE.md")).not.toBe(
      fs.readFileSync(path.join(REPO_ROOT, "dist", "kit", "brownfield-templates", "claude-instructions.md"), "utf-8").replace(/\r\n/g, "\n")
    );
    expect(entry(id, "projeto/repos/")).toBeUndefined();
    expect(entry(id, "projeto/docs/input/")).toBeUndefined();
    // O greenfield nasce com .gitignore só com a pasta do State Service (BUG-48);
    // o /repos/ do kit brownfield não pode aparecer.
    expect(text(id, "projeto/.gitignore")).not.toContain("/repos/");
  });
});

describe("golden do gerador — integridade do próprio golden", () => {
  it.skipIf(UPDATE_GOLDEN)("cada caso tem golden, não há caso órfão e as cópias legíveis batem com os sha256", () => {
    expect(group.integrityProblems()).toEqual([]);
  });
});
