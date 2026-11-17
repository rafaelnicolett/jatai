import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { execFile, execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { RUN_EVENT_MESSAGE_MAX, RUNS_DIR, parseRunEvents, type RunEvent } from "../../src/core/contracts/run-events-contract.pure";
import type { FieldError } from "../../src/core/validation/validation";
import { appendRunEvent, previousRunEventFilePath, runEventFilePath } from "../../src/state/runs/run-event-log";
import { StateCommands } from "../../src/state/application/StateCommands";
import { StateServiceServer } from "../../src/server/StateServiceServer";
import { EventBus } from "../../src/server/EventBus";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { registerStateServiceTools } from "../../src/mcp/tools";
import { ArtifactWatcher, type FileWatch, type FileWatcher } from "../../src/state/runs/ArtifactWatcher";
import { RunEventReader, nodeRunFiles, type RunFiles } from "../../src/state/runs/RunEventReader";
import { YamlStateRepository } from "../../src/state/repository/StateRepository";

/**
 * Step definitions de `eventos-de-atividade.feature` (F5.2, contrato
 * agent-activity). Cada parte do contrato liga os seus cenários no commit em
 * que existe; até lá o cenário fica pendente (`it.todo`). A ordem de entrega é
 * a do contrato (§8).
 */
const FEATURE = path.join(__dirname, "eventos-de-atividade.feature");
const tmpDirs: string[] = [];
let producerBundle: string;

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A porta do observador, escrita à mão com a forma da porta do host (`watch(baseDir, glob)`): o step grava o
 * arquivo de verdade e avisa, como o FileSystemWatcher avisaria, só para o que está dentro da pasta vigiada.
 */
class FakeFileWatcher implements FileWatcher {
  private readonly _watched: Array<{ baseDir: string; created: Array<(p: string) => void> }> = [];
  watch(baseDir: string): FileWatch {
    const entry = { baseDir, created: [] as Array<(p: string) => void> };
    this._watched.push(entry);
    return {
      onDidCreate: (listener) => void entry.created.push(listener),
      onDidChange: () => undefined,
      dispose: () => void (entry.created.length = 0),
    };
  }
  write(root: string, rel: string, content: string): void {
    const file = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf-8");
    for (const w of this._watched) if (file.startsWith(w.baseDir + path.sep)) for (const l of w.created) l(file);
  }
}

/** Um agente do Copilot gravando com o observador ligado (debounce de verdade, relógio falso). */
function copilotWorkspace(): { root: string; fake: FakeFileWatcher; watcher: ArtifactWatcher } {
  const root = workspace();
  const fake = new FakeFileWatcher();
  const watcher = new ArtifactWatcher({ root, files: fake });
  watcher.start();
  return { root, fake, watcher };
}

const REPORT = ".github/artifacts/execution/relatorio.md";
let cli: string;
let mcpServerBundle: string;

beforeAll(() => {
  const repoRoot = path.resolve(__dirname, "../..");
  const bundle = (entry: string, outfile: string): void => {
    execFileSync("npx", ["esbuild", entry, "--bundle", `--outfile=${outfile}`, "--format=cjs", "--platform=node", "--target=node18"], { cwd: repoRoot, stdio: "pipe" });
  };
  producerBundle = path.join(os.tmpdir(), `jatai-bdd-produtor-${process.pid}.cjs`);
  cli = path.join(os.tmpdir(), `jatai-state-bdd-eventos-${process.pid}.cjs`);
  mcpServerBundle = path.join(os.tmpdir(), `jatai-mcp-bdd-eventos-${process.pid}.cjs`);
  bundle("tests/features/helpers/append-run-events.ts", producerBundle);
  bundle("src/cli/helyx-state.ts", cli);
  bundle("src/mcp/server.ts", mcpServerBundle);
}, 60_000);

interface CliResult {
  exit: number;
  out: Record<string, unknown> & { ok: boolean; error?: Record<string, unknown> & { code: string } };
}

/**
 * O CLI de estado como o hook do kit o chama: subprocesso, sem State Service no ar. `env` é só o que o
 * Claude Code acrescenta (o resto do ambiente do teste não passa): `CLAUDE_PROJECT_DIR`, por exemplo.
 */
function runCliIn(where: { cwd: string; env?: Record<string, string> }, ...args: string[]): CliResult {
  try {
    const stdout = execFileSync("node", [cli, ...args], { cwd: where.cwd, encoding: "utf-8", env: { PATH: process.env.PATH ?? "", ...where.env } });
    return { exit: 0, out: JSON.parse(stdout) as CliResult["out"] };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { exit: e.status ?? 1, out: JSON.parse(e.stdout ?? "{}") as CliResult["out"] };
  }
}

const runCli = (root: string, ...args: string[]): CliResult => runCliIn({ cwd: root }, ...args);

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  // realpath: no macOS o tmpdir é um link (/var → /private/var) e o process.cwd() do CLI já vem resolvido.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-eventos-")));
  tmpDirs.push(root);
  return root;
}

/** Todos os eventos gravados no workspace, em qualquer arquivo de `runs/`. */
function recorded(root: string): RunEvent[] {
  const dir = path.join(root, ...RUNS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => parseRunEvents(fs.readFileSync(path.join(dir, f), "utf-8")));
}

type Recorded = { ok: true; event: RunEvent } | { ok: false; error: FieldError };

/** Grava um evento como todo produtor do contrato: validação, arquivo da iniciativa e lock. */
async function record(root: string, input: Record<string, unknown>): Promise<Recorded> {
  const result = await appendRunEvent(root, input);
  return result.ok ? { ok: true, event: result.value.event } : { ok: false, error: result.error };
}

/** Roda o produtor em processo separado (`helpers/append-run-events.ts`). */
function producer(root: string, name: string, count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("node", [producerBundle, root, name, String(count)], (err, _stdout, stderr) => (err ? reject(new Error(`${err.message}: ${stderr}`)) : resolve()));
  });
}

const BASE = { run_id: "r-bdd-1", timestamp: "2026-11-15T12:00:00Z", initiative_id: "mod-x" };

/** Workspace com a iniciativa "mod-x" e a tarefa "wave-1/item-1" concluída, e o StateCommands como o CLI monta (eventos com harness "cli"). */
function stateWorkspace(): { root: string; commands: StateCommands } {
  const root = workspace();
  const file = path.join(root, ".github/artifacts/initiatives.yaml");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "active: mod-x\ninitiatives:\n  - id: mod-x\n    name: mod-x\n    status: in-progress\n    wave_status:\n      wave-1:\n        item-1:\n          status: done\n", "utf-8");
  const commands = new StateCommands({ root, repository: new YamlStateRepository(), recordEvent: appendRunEvent, harness: "cli" });
  return { root, commands };
}

/** Os campos do contrato, todos preenchidos (o `by` só nos tipos de decisão humana). */
function fullEvent(type: string): Record<string, unknown> {
  const human = ["decision-made", "gate-approved", "item-approved"].includes(type);
  return {
    ...BASE,
    event_type: type,
    task_id: "wave-1/item-1",
    phase_id: "execution",
    agent_id: human ? undefined : "@migration-agent",
    repo_id: "jatai",
    artifact_path: ".github/artifacts/execution/relatorio.md",
    actor: human ? "human" : "agent",
    ...(human ? { by: "Pessoa Fictícia" } : {}),
    harness: "cli",
    message: `evento ${type}`,
    metadata: { reason: "motivo", task: "wave-1/item-1", path: "execution/relatorio.md", count: 1 },
  };
}

async function roundTrip(type: string): Promise<void> {
  const root = workspace();
  const input = fullEvent(type);
  const r = await record(root, input);
  expect(r.ok).toBe(true);
  const [read] = recorded(root);
  const expected = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  expect(read).toEqual(expected);
}

function expectRefusedAndNothingRecorded(root: string, r: Recorded, code: string): void {
  expect(r.ok).toBe(false);
  expect((r as { error: FieldError }).error.code).toBe(code);
  expect(recorded(root)).toEqual([]);
}

const TYPES = ["agent-started", "agent-progress", "agent-done", "artifact-written", "gate-approved", "item-approved", "blocked", "decision-requested", "decision-made"];

const SCENARIOS: Record<string, (() => void | Promise<void>) | "pendente"> = {
  ...Object.fromEntries(TYPES.map((t) => [`Cada tipo de evento do contrato volta igual depois de gravado e lido [${t}]`, () => roundTrip(t)])),

  "Campos fora do contrato são descartados antes de gravar": async () => {
    const root = workspace();
    const r = await record(root, { ...BASE, event_type: "artifact-written", content: "segredo", metadata: { reason: "r", task: "t", path: "p", count: 2, diff: "+x", prompt: "y" } });
    expect(r.ok).toBe(true);
    const [read] = recorded(root);
    expect((read as unknown as Record<string, unknown>).content).toBeUndefined();
    expect(Object.keys(read!.metadata ?? {}).sort()).toEqual(["count", "path", "reason", "task"]);
  },

  "A mensagem passa de 140 caracteres e é cortada na escrita": async () => {
    const root = workspace();
    expect((await record(root, { ...BASE, event_type: "agent-progress", message: "m".repeat(200) })).ok).toBe(true);
    expect(recorded(root)[0]!.message).toHaveLength(RUN_EVENT_MESSAGE_MAX);
  },

  "Um evento sem tipo conhecido é recusado na escrita": async () => {
    const root = workspace();
    expectRefusedAndNothingRecorded(root, await record(root, { ...BASE, event_type: "agent.exploded" }), "INVALID_ENUM");
  },

  "O caminho do artefato é relativo ao workspace e nunca sai dele": async () => {
    const root = workspace();
    expectRefusedAndNothingRecorded(root, await record(root, { ...BASE, event_type: "artifact-written", artifact_path: "../fora/segredo.txt" }), "USAGE");
  },

  "Mudar o status de uma tarefa grava um evento da tarefa": async () => {
    const { root, commands } = stateWorkspace();
    const before = Date.now();
    const r = await commands.upsertWaveItem({ id: "mod-x", wave: "wave-1", item: "item-1", status: "in-progress", group: "wave" });
    expect(r.ok).toBe(true);
    const [event] = recorded(root);
    expect(event).toMatchObject({
      event_type: "artifact-written",
      initiative_id: "mod-x",
      task_id: "wave-1/item-1",
      artifact_path: ".github/artifacts/initiatives.yaml",
      harness: "cli",
      metadata: { task: "wave-1/item-1" },
    });
    expect(Date.parse(event!.timestamp) - before).toBeLessThan(1_000);
    expect(JSON.stringify(event)).not.toContain("wave_status:");
  },

  "Aprovar um gate grava o evento de gate aprovado com quem aprovou": async () => {
    const { root, commands } = stateWorkspace();
    const r = await commands.approveGate({ gate: "d3", initiativeId: "mod-x", by: "Pessoa Fictícia" });
    expect(r.ok).toBe(true);
    expect(recorded(root)).toEqual([
      expect.objectContaining({ event_type: "gate-approved", initiative_id: "mod-x", phase_id: "gate-d3", actor: "human", by: "Pessoa Fictícia" }),
    ]);
  },

  "Uma escrita de estado recusada não grava evento": async () => {
    const { root, commands } = stateWorkspace();
    const r = await commands.upsertWaveItem({ id: "mod-x", wave: "wave-1", item: "item-1", status: "blocked", group: "wave" });
    expect(r).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "reason" } });
    expect(recorded(root)).toEqual([]);
  },
  "Uma decisão humana registrada pelo estado grava quem decidiu": async () => {
    const root = workspace();
    const commands = new StateCommands({ root, repository: new YamlStateRepository(), recordEvent: appendRunEvent, approverName: async () => "Pessoa Fictícia" });
    const r = await commands.recordDecision({ initiativeId: "mod-x", taskId: "epic-0/task-0.1", message: "titular definido" });
    expect(r.ok).toBe(true);
    expect(recorded(root)).toEqual([
      expect.objectContaining({ event_type: "decision-made", initiative_id: "mod-x", task_id: "epic-0/task-0.1", actor: "human", by: "Pessoa Fictícia", message: "titular definido" }),
    ]);
  },

  "Sem o nome de quem decide, a decisão não é registrada": async () => {
    const root = workspace();
    const commands = new StateCommands({ root, repository: new YamlStateRepository(), recordEvent: appendRunEvent, approverName: async () => null });
    const r = await commands.recordDecision({ initiativeId: "mod-x", taskId: "epic-0/task-0.1", message: "titular definido" });
    expect(r).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "by" } });
    expect(recorded(root)).toEqual([]);
  },

  "O hook do Claude Code registra o início de um subagente pelo CLI, no formato do kit": () => {
    const root = workspace();
    // exatamente as flags que o hook do kit passa (RUNS_APPEND_FLAGS, frente K): sem iniciativa nem fase
    const r = runCli(root, "runs", "append", "--event-type", "agent-started", "--agent-id", "migration-agent", "--harness", "claude-code");
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, event: { event_type: "agent-started", agent_id: "migration-agent", harness: "claude-code" } });
    expect(String(r.out.path)).toMatch(/runs[\\/]workspace\.jsonl$/);
    const [event] = recorded(root);
    expect(event).toMatchObject({ event_type: "agent-started", agent_id: "migration-agent", harness: "claude-code" });
    expect(event!.initiative_id).toBeUndefined();
    expect(event!.phase_id).toBeUndefined();
  },

  "O hook do Claude Code registra um artefato gravado pelo subagente": () => {
    const root = workspace();
    const rel = ".github/artifacts/execution/relatorio.md";
    // o PostToolUse do Claude Code entrega o caminho absoluto; o kit pode mandar o relativo. Os dois valem.
    for (const artifactPath of [rel, path.join(root, ...rel.split("/"))]) {
      const r = runCli(root, "runs", "append", "--event-type", "artifact-written", "--agent-id", "migration-agent", "--artifact-path", artifactPath, "--harness", "claude-code");
      expect(r.exit).toBe(0);
    }
    expect(recorded(root)).toEqual([
      expect.objectContaining({ event_type: "artifact-written", artifact_path: rel, harness: "claude-code" }),
      expect.objectContaining({ event_type: "artifact-written", artifact_path: rel, harness: "claude-code" }),
    ]);
  },

  "O CLI chamado pelo hook grava no projeto do Claude Code, mesmo rodando de uma subpasta": () => {
    const root = workspace();
    const sub = path.join(root, "repos", "app");
    fs.mkdirSync(sub, { recursive: true });
    const r = runCliIn({ cwd: sub, env: { CLAUDE_PROJECT_DIR: root } }, "runs", "append", "--event-type", "agent-started", "--agent-id", "migration-agent", "--harness", "claude-code");
    expect(r.exit).toBe(0);
    expect(recorded(root)).toEqual([expect.objectContaining({ event_type: "agent-started", agent_id: "migration-agent" })]);
    expect(fs.existsSync(path.join(sub, ".github"))).toBe(false);
  },
  "O CLI não registra um evento que só um humano pode registrar": () => {
    const root = workspace();
    const r = runCli(root, "runs", "append", "--event_type", "gate-approved", "--initiative_id", "mod-x");
    expect(r.exit).toBe(1);
    expect(r.out.error).toMatchObject({ code: "INVALID_ENUM", field: "event_type" });
    expect(recorded(root)).toEqual([]);
  },
  "A ferramenta MCP acha o State Service do projeto do Claude Code": async () => {
    const root = workspace();
    const elsewhere = workspace();
    const server = new StateServiceServer({ root, repository: new YamlStateRepository(), eventBus: new EventBus(), token: "bdd-eventos-claude" });
    await server.start();
    // O servidor MCP de verdade, como o Claude Code o sobe: outro processo, outra pasta, só o CLAUDE_PROJECT_DIR aponta o projeto.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpServerBundle],
      cwd: elsewhere,
      env: { ...getDefaultEnvironment(), CLAUDE_PROJECT_DIR: root },
      stderr: "pipe",
    });
    const client = new Client({ name: "agente-bdd", version: "0.0.0" });
    try {
      await client.connect(transport);
      const res = await client.callTool({ name: "append_run_event", arguments: { event_type: "agent-started", agent_id: "migration-agent", harness: "claude-code" } });
      expect(res.isError).toBe(false);
    } finally {
      await client.close();
      await server.stop();
    }
    expect(recorded(root)).toEqual([expect.objectContaining({ event_type: "agent-started", agent_id: "migration-agent", harness: "claude-code" })]);
    expect(fs.existsSync(path.join(elsewhere, ".github"))).toBe(false);
  },

  "Um agente registra atividade pela ferramenta MCP": async () => {
    const root = workspace();
    const server = new StateServiceServer({ root, repository: new YamlStateRepository(), eventBus: new EventBus(), token: "bdd-eventos" });
    await server.start();
    const mcp = new McpServer({ name: "bdd-eventos", version: "0.0.0" });
    registerStateServiceTools(mcp, { root });
    const client = new Client({ name: "agente-bdd", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const res = await client.callTool({ name: "append_run_event", arguments: { event_type: "artifact-written", artifact_path: "execution/relatorio.md", initiative_id: "mod-x", agent_id: "@migration-agent" } });
      expect(res.isError).toBe(false);
    } finally {
      await client.close();
      await mcp.close();
      await server.stop();
    }
    expect(recorded(root)).toEqual([
      expect.objectContaining({ event_type: "artifact-written", harness: "mcp", artifact_path: "execution/relatorio.md", initiative_id: "mod-x" }),
    ]);
  },
  "Gravar um artefato gera o evento de artefato gravado": async () => {
    vi.useFakeTimers();
    const { root, fake, watcher } = copilotWorkspace();
    fake.write(root, REPORT, "# relatório com dado sensível: senha=123\n");
    await vi.advanceTimersByTimeAsync(499);
    expect(recorded(root)).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await watcher.settled();
    const events = recorded(root);
    expect(events).toEqual([expect.objectContaining({ event_type: "artifact-written", harness: "watcher", artifact_path: REPORT })]);
    expect(JSON.stringify(events)).not.toContain("senha");
    watcher.dispose();
  },

  "Gravações seguidas do mesmo artefato viram um evento só": async () => {
    vi.useFakeTimers();
    const { root, fake, watcher } = copilotWorkspace();
    for (let i = 0; i < 3; i++) {
      fake.write(root, REPORT, `versão ${i}\n`);
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(500);
    await watcher.settled();
    expect(recorded(root).filter((e) => e.artifact_path === REPORT)).toHaveLength(1);
    watcher.dispose();
  },

  "O observador ignora os eventos, o State Service e os arquivos temporários": async () => {
    vi.useFakeTimers();
    const { root, fake, watcher } = copilotWorkspace();
    fake.write(root, ".github/artifacts/runs/outro.jsonl", "");
    fake.write(root, ".github/artifacts/.state-service/server.json", "{}");
    fake.write(root, ".github/artifacts/.initiatives.yaml.tmp-42-0a1b2c3d", "x");
    fake.write(root, ".github/artifacts/initiatives.yaml.lock", "42");
    await vi.advanceTimersByTimeAsync(1_000);
    await watcher.settled();
    expect(recorded(root).filter((e) => e.harness === "watcher")).toEqual([]);
    watcher.dispose();
  },
  "Produtores gravando ao mesmo tempo não perdem eventos": async () => {
    const root = workspace();
    await Promise.all([producer(root, "a", 50), producer(root, "b", 50)]);
    const raw = fs.readFileSync(runEventFilePath(root, "mod-x"), "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    expect(lines).toHaveLength(100);
    const events = parseRunEvents(raw);
    expect(events).toHaveLength(100);
    for (const name of ["a", "b"]) {
      const mine = events.filter((e) => e.agent_id === `@produtor-${name}`).map((e) => Number(e.message!.split(":")[1]));
      expect(mine).toEqual(Array.from({ length: 50 }, (_, i) => i));
    }
  },

  "O arquivo de eventos da iniciativa roda ao chegar a 5.000 eventos": async () => {
    const root = workspace();
    const active = runEventFilePath(root, "mod-x");
    fs.mkdirSync(path.dirname(active), { recursive: true });
    const full = Array.from({ length: 5_000 }, (_, i) => JSON.stringify({ ...BASE, run_id: `r-${i}`, event_type: "agent-progress" })).join("\n");
    fs.writeFileSync(active, `${full}\n`, "utf-8");
    expect((await record(root, { ...BASE, event_type: "agent-done", agent_id: "@migration-agent" })).ok).toBe(true);
    const previous = previousRunEventFilePath(root, "mod-x");
    expect(parseRunEvents(fs.readFileSync(previous, "utf-8"))).toHaveLength(5_000);
    expect(parseRunEvents(fs.readFileSync(active, "utf-8")).map((e) => e.event_type)).toEqual(["agent-done"]);
  },
  "A leitura só lê o que foi acrescentado desde a última vez": async () => {
    const root = workspace();
    for (let i = 0; i < 300; i++) expect((await record(root, { ...BASE, run_id: `r-${i}`, event_type: "agent-progress", message: `passo ${i}` })).ok).toBe(true);
    let bytesRead = 0;
    const files: RunFiles = { ...nodeRunFiles, read: (file, start, end) => { const b = nodeRunFiles.read(file, start, end); bytesRead += b.length; return b; } };
    const cockpit = new RunEventReader(files);
    cockpit.read(root);
    const fileSize = fs.statSync(runEventFilePath(root, "mod-x")).size;
    expect(bytesRead).toBe(fileSize);

    const appended = await record(root, { ...BASE, event_type: "agent-done", agent_id: "@migration-agent", timestamp: "2026-11-15T13:00:00Z" });
    expect(appended.ok).toBe(true);
    const newBytes = fs.statSync(runEventFilePath(root, "mod-x")).size - fileSize;
    bytesRead = 0;
    const window = cockpit.read(root);
    // os bytes novos, mais a âncora de 64 bytes que prova que o começo do arquivo não mudou
    expect(bytesRead).toBe(newBytes + 64);
    const everything = parseRunEvents(fs.readFileSync(runEventFilePath(root, "mod-x"), "utf-8")).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-200);
    expect(window).toEqual(everything);
  },
};

describe("Funcionalidade: Registrar a atividade dos agentes como eventos, nos dois harnesses", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) {
    if (steps === "pendente") it.todo(`Cenário: ${title}`);
    else it(`Cenário: ${title}`, steps, 30_000);
  }
});
