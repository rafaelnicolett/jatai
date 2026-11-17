import { describe, it, expect, afterAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { StructureGenerator } from "../../src/generator/StructureGenerator";
import { WizardStateSchema } from "../../src/types";
import { BRAND } from "../../src/data/brand.pure";
import { hookRelayFile } from "../../src/generator/content/claude-hooks";

/**
 * Step definitions de `hooks-claude-code.feature` (contrato agent-activity
 * §4, hooks do kit). O gerador roda pelos pontos de entrada que a extensão
 * chama; os hooks rodam como o Claude Code os roda: o comando do
 * `.claude/settings.json`, com o aviso em JSON no stdin e
 * `CLAUDE_PROJECT_DIR` no ambiente.
 *
 * O registro de atividade (`runs append`) é da frente G: aqui o CLI do
 * workspace é trocado por um falso que só anota os argumentos que recebeu.
 */
const FEATURE = path.join(__dirname, "hooks-claude-code.feature");
const SETTINGS = ".claude/settings.json";
const RELAY = `.github/scripts/${hookRelayFile()}`;
const CALLS = "chamadas-do-cli.jsonl";

type Steps = (() => void | Promise<void>) | "pendente";
interface HookHandler { type: string; command: string; async?: boolean }
interface HookGroup { matcher?: string; hooks: HookHandler[] }
type Settings = { hooks: Record<string, HookGroup[]> } & Record<string, unknown>;

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-hooks-"));
  tmpDirs.push(d);
  return d;
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");
const write = (root: string, rel: string, body: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, "utf-8");
};
const settings = (root: string): Settings => JSON.parse(read(root, SETTINGS)) as Settings;

async function install(mode: "brownfield" | "greenfield", harness: "claude" | "copilot"): Promise<string> {
  const root = tmp();
  if (mode === "brownfield") {
    await new StructureGenerator().installAgentStructure(root, "ws", harness);
    return root;
  }
  const target = path.join(root, "projeto");
  const state = WizardStateSchema.parse({ projectName: "projeto", hostAdapter: harness, backendStack: "python-api" });
  await new StructureGenerator().generate({ ...state, targetDirectory: target });
  return target;
}

/** Os comandos do kit registrados para um evento de hook (reconhecidos pelo relé). */
function kitCommands(s: Settings, hook: string): Array<{ matcher?: string; command: string; async?: boolean }> {
  return (s.hooks[hook] ?? []).flatMap((g) => g.hooks.filter((h) => h.command.includes(RELAY)).map((h) => ({ matcher: g.matcher, command: h.command, async: h.async })));
}

/** Dado um workspace com os hooks do kit (e o CLI trocado por um que anota os argumentos). */
async function workspaceWithHooks(cliBody = `require("fs").appendFileSync(require("path").join(process.cwd(), ${JSON.stringify(CALLS)}), JSON.stringify(process.argv.slice(2)) + "\\n");`): Promise<string> {
  const root = await install("brownfield", "claude");
  write(root, `.github/scripts/${BRAND.files.cli}`, cliBody);
  return root;
}

/** O Claude Code dispara o hook: o comando registrado no settings.json, com o aviso no stdin. */
function fireHook(root: string, hook: string, payload: Record<string, unknown>): { status: number | null } {
  const [cmd] = kitCommands(settings(root), hook);
  const m = /^node "\$\{CLAUDE_PROJECT_DIR\}\/(.+)" (\S+)$/.exec(cmd!.command);
  expect(m, `comando do hook ${hook}: ${cmd!.command}`).not.toBeNull();
  const res = spawnSync(process.execPath, [path.join(root, m![1]!), m![2]!], {
    input: JSON.stringify({ session_id: "s-1", transcript_path: "/tmp/t.jsonl", cwd: root, hook_event_name: hook, ...payload }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf-8",
  });
  return { status: res.status };
}

const calls = (root: string): string[][] =>
  fs.existsSync(path.join(root, CALLS)) ? read(root, CALLS).trim().split("\n").map((l) => JSON.parse(l) as string[]) : [];

function subagent(root: string, hook: "SubagentStart" | "SubagentStop", agent: string): void {
  expect(fireHook(root, hook, { agent_id: "agent-abc123", agent_type: agent }).status).toBe(0);
}

function writes(root: string, agent: string, rel: string): void {
  const payload = { tool_name: "Write", tool_input: { file_path: path.join(root, ...rel.split("/")), content: "conteúdo do artefato que nunca vai para o evento" }, tool_response: { success: true }, agent_id: "agent-abc123", agent_type: agent };
  expect(fireHook(root, "PostToolUse", payload).status).toBe(0);
}

function installsHooks(root: string): void {
  const s = settings(root);
  expect(kitCommands(s, "SubagentStart")).toEqual([{ matcher: undefined, command: `node "\${CLAUDE_PROJECT_DIR}/${RELAY}" agent-started`, async: true }]);
  expect(kitCommands(s, "SubagentStop")).toEqual([{ matcher: undefined, command: `node "\${CLAUDE_PROJECT_DIR}/${RELAY}" agent-done`, async: true }]);
  const post = kitCommands(s, "PostToolUse");
  expect(post.map((p) => p.command)).toEqual([`node "\${CLAUDE_PROJECT_DIR}/${RELAY}" artifact-written`]);
  for (const tool of ["Write", "Edit"]) expect(new RegExp(`^(${post[0]!.matcher!})$`).test(tool), tool).toBe(true);
  expect(fs.existsSync(path.join(root, RELAY))).toBe(true);
}

const TEAM_SETTINGS = {
  permissions: { allow: ["Bash(npm test)"], deny: ["Read(./.env)"] },
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./scripts/checa-comando.sh" }] }],
    SubagentStart: [{ matcher: "Explore", hooks: [{ type: "command", command: "echo explorando" }] }],
  },
};

const SCENARIOS: Record<string, Steps> = {
  "A instalação no Claude Code registra os hooks de atividade de agente [brownfield]": async () => installsHooks(await install("brownfield", "claude")),
  "A instalação no Claude Code registra os hooks de atividade de agente [greenfield]": async () => installsHooks(await install("greenfield", "claude")),

  "A instalação no Copilot não cria configuração do Claude Code": async () => {
    const root = await install("brownfield", "copilot");
    expect(fs.existsSync(path.join(root, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(root, RELAY))).toBe(false);
  },

  ...Object.fromEntries(
    ([["SubagentStart", "agent-started"], ["SubagentStop", "agent-done"]] as const).map(([hook, event]) => [
      `Início e fim de subagente viram eventos com o nome do agente [${hook} · ${event}]`,
      async () => {
        const root = await workspaceWithHooks();
        subagent(root, hook, "feature-adder");
        expect(calls(root)).toEqual([["runs", "append", "--event-type", event, "--harness", "claude-code", "--agent-id", "feature-adder"]]);
      },
    ])
  ),

  "A gravação de um artefato vira evento com o caminho relativo ao workspace": async () => {
    const root = await workspaceWithHooks();
    writes(root, "feature-adder", ".github/artifacts/execution/feature-report-app.md");
    expect(calls(root)).toEqual([
      ["runs", "append", "--event-type", "artifact-written", "--harness", "claude-code", "--artifact-path", ".github/artifacts/execution/feature-report-app.md", "--agent-id", "feature-adder"],
    ]);
    expect(read(root, CALLS)).not.toContain("conteúdo do artefato");
  },

  ...Object.fromEntries(
    ["repos/app/src/Main.java", ".github/artifacts/runs/mod-x/events.jsonl", ".github/artifacts/.state-service/server.json"].map((rel) => [
      `Gravações fora dos artefatos do delivery não viram evento [${rel}]`,
      async () => {
        const root = await workspaceWithHooks();
        writes(root, "feature-adder", rel);
        expect(calls(root)).toEqual([]);
      },
    ])
  ),

  "A migração preserva o que o time configurou no Claude Code": async () => {
    const root = await install("brownfield", "claude");
    write(root, SETTINGS, `${JSON.stringify(TEAM_SETTINGS, null, 2)}\n`);
    const gen = new StructureGenerator();
    await gen.migrateKit(root, "ws", "claude");
    const first = read(root, SETTINGS);
    await gen.migrateKit(root, "ws", "claude");
    expect(read(root, SETTINGS), "a 2ª migração não muda nada").toBe(first);
    const s = settings(root);
    expect(s.permissions).toEqual(TEAM_SETTINGS.permissions);
    expect(s.hooks.PreToolUse).toEqual(TEAM_SETTINGS.hooks.PreToolUse);
    expect(s.hooks.SubagentStart![0]).toEqual(TEAM_SETTINGS.hooks.SubagentStart[0]);
    for (const hook of ["SubagentStart", "SubagentStop", "PostToolUse"]) expect(kitCommands(s, hook), hook).toHaveLength(1);
  },

  "Uma configuração do Claude Code que não é JSON puro não é sobrescrita": async () => {
    const root = await install("brownfield", "claude");
    const jsonc = '{\n  // permissões do time\n  "permissions": { "allow": ["Bash(npm test)"] },\n}\n';
    write(root, SETTINGS, jsonc);
    await new StructureGenerator().migrateKit(root, "ws", "claude");
    expect(read(root, SETTINGS)).toBe(jsonc);
  },

  "O hook nunca atrapalha o agente": async () => {
    const root = await workspaceWithHooks('throw new Error("registro de atividade fora do ar");');
    subagent(root, "SubagentStart", "feature-adder");
    fs.rmSync(path.join(root, `.github/scripts/${BRAND.files.cli}`));
    subagent(root, "SubagentStart", "feature-adder");
    const garbage = execFileSync(process.execPath, [path.join(root, RELAY), "agent-started"], { input: "isto não é JSON", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    expect(garbage.toString()).toBe("");
  },
};

describe("Funcionalidade: Hooks do Claude Code que registram a atividade dos agentes", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) {
    if (steps === "pendente") it.todo(`Cenário: ${title}`);
    else it(`Cenário: ${title}`, steps, 30_000);
  }
});
