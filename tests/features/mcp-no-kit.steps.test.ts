import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { MCP_BUNDLE, mcpBundlePath } from "../../src/generator/install/kit-root";
import { StructureGenerator } from "../../src/generator/StructureGenerator";
import { WizardStateSchema } from "../../src/types";
import { BRAND } from "../../src/data/brand.pure";
import { BUNDLE_HOST_ALLOWLIST, FORBIDDEN_HOSTS, hostsIn } from "../contract/helpers/egress-hosts";

/**
 * Step definitions de `mcp-no-kit.feature` (F3.5, G7, ADR-0025). O gerador
 * roda pelos pontos de entrada que a extensão chama (`installAgentStructure`,
 * `generate`, `migrateKit`), em pastas temporárias.
 */
const FEATURE = path.join(__dirname, "mcp-no-kit.feature");
const REPO_ROOT = path.resolve(__dirname, "../..");
const CLAUDE_CODE = ".mcp.json";
const COPILOT = ".vscode/mcp.json";
const INSTALLED_BUNDLE = `.github/scripts/${MCP_BUNDLE}`;

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-mcp-"));
  tmpDirs.push(d);
  return d;
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");
const write = (root: string, rel: string, body: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, "utf-8");
};
const servers = (root: string, rel: string): Record<string, { command?: string; args?: string[] }> => {
  const doc = JSON.parse(read(root, rel)) as Record<string, Record<string, { command?: string; args?: string[] }>>;
  return doc[rel === CLAUDE_CODE ? "mcpServers" : "servers"]!;
};

/** Quando o kit é instalado num projeto "<modo>" para o harness "<harness>": devolve a raiz do workspace. */
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

/** Então o servidor MCP do kit fica na pasta de scripts do workspace. */
function bundleInstalled(root: string): void {
  expect(fs.readFileSync(path.join(root, INSTALLED_BUNDLE)).equals(fs.readFileSync(mcpBundlePath()))).toBe(true);
  if (process.platform !== "win32") expect(fs.statSync(path.join(root, INSTALLED_BUNDLE)).mode & 0o100).not.toBe(0);
}

/** E a configuração MCP do <harness> declara o servidor da marca pelo caminho relativo ao workspace. */
function declaresBrandServer(root: string, rel: string): void {
  const server = servers(root, rel)[BRAND.name]!;
  expect(server, `${rel}: servidor "${BRAND.name}"`).toBeDefined();
  expect(server.command).toBe("node");
  const workspaceVar = rel === CLAUDE_CODE ? "${CLAUDE_PROJECT_DIR:-.}" : "${workspaceFolder}";
  expect(server.args).toEqual([`${workspaceVar}/${INSTALLED_BUNDLE}`]);
  expect(JSON.stringify(server), "nenhum caminho absoluto da máquina").not.toContain(root);
}

/** Dado um workspace instalado por uma versão do kit sem servidor MCP. */
async function workspaceWithoutMcp(): Promise<string> {
  const root = await install("brownfield", "claude");
  for (const rel of [CLAUDE_CODE, COPILOT, INSTALLED_BUNDLE]) fs.rmSync(path.join(root, rel), { force: true });
  return root;
}

const migrate = (root: string): Promise<void> => new StructureGenerator().migrateKit(root, "ws", "claude");

const TEAM_SERVER = { command: "npx", args: ["-y", "servidor-do-time@1.2.3"], env: { NIVEL: "debug" } };

type Steps = (() => void | Promise<void>) | "pendente";

/** `npm run build:mcp`, em memória: o mesmo entry point e as mesmas opções do package.json. */
async function buildMcpFromSource(): Promise<string> {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as { scripts: Record<string, string> };
  const script = pkg.scripts["build:mcp"]!;
  expect(script, "build:mcp grava no bundle do kit").toContain(`--outfile=kit/scripts/${MCP_BUNDLE} `);
  const esbuild = await import("esbuild");
  const result = await esbuild.build({
    entryPoints: ["src/mcp/server.ts"],
    absWorkingDir: REPO_ROOT,
    bundle: true,
    write: false,
    outfile: path.join(REPO_ROOT, "kit", "scripts", MCP_BUNDLE),
    format: "cjs",
    platform: "node",
    target: "node18",
    logLevel: "silent",
  });
  return result.outputFiles[0]!.text;
}

const SCENARIOS: Record<string, Steps> = {
  ...Object.fromEntries(
    (["brownfield", "greenfield"] as const).flatMap((mode) =>
      (["claude", "copilot"] as const).map((harness) => [
        `A instalação configura o servidor MCP nos dois harnesses [${mode} · ${harness}]`,
        async () => {
          const root = await install(mode, harness);
          bundleInstalled(root);
          declaresBrandServer(root, CLAUDE_CODE);
          declaresBrandServer(root, COPILOT);
        },
      ])
    )
  ),

  "A migração leva o servidor MCP a um workspace instalado antes dele": async () => {
    const root = await workspaceWithoutMcp();
    await migrate(root);
    bundleInstalled(root);
    declaresBrandServer(root, CLAUDE_CODE);
    declaresBrandServer(root, COPILOT);
  },

  "A migração preserva os servidores MCP que o time já declarou": async () => {
    const root = await workspaceWithoutMcp();
    write(root, CLAUDE_CODE, `${JSON.stringify({ mcpServers: { "banco-do-time": TEAM_SERVER } }, null, 2)}\n`);
    write(root, COPILOT, `${JSON.stringify({ inputs: [{ id: "token", type: "promptString" }], servers: { "banco-do-time": { type: "stdio", ...TEAM_SERVER } } }, null, 4)}\n`);
    await migrate(root);
    expect(servers(root, CLAUDE_CODE)["banco-do-time"]).toEqual(TEAM_SERVER);
    expect(servers(root, COPILOT)["banco-do-time"]).toEqual({ type: "stdio", ...TEAM_SERVER });
    expect((JSON.parse(read(root, COPILOT)) as { inputs: unknown }).inputs).toEqual([{ id: "token", type: "promptString" }]);
    expect(read(root, COPILOT), "a indentação do time (4 espaços) fica").toMatch(/^ {4}"servers"/m);
    declaresBrandServer(root, CLAUDE_CODE);
    declaresBrandServer(root, COPILOT);
  },

  "A migração atualiza a entrada da marca sem duplicá-la": async () => {
    const root = await workspaceWithoutMcp();
    write(root, CLAUDE_CODE, `${JSON.stringify({ mcpServers: { [BRAND.name]: { command: "node", args: ["/caminho/antigo/da/extensao/dist/mcp/server.js"] } } }, null, 2)}\n`);
    await migrate(root);
    const first = read(root, CLAUDE_CODE);
    await migrate(root);
    expect(read(root, CLAUDE_CODE), "a 2ª migração não muda nada").toBe(first);
    expect(Object.keys(servers(root, CLAUDE_CODE))).toEqual([BRAND.name]);
    expect(first.split(`"${BRAND.name}"`).length - 1).toBe(1);
    declaresBrandServer(root, CLAUDE_CODE);
  },

  "Uma configuração MCP que não é JSON puro não é sobrescrita": async () => {
    const root = await workspaceWithoutMcp();
    const jsonc = '{\n  // servidores do time\n  "servers": {\n    "banco-do-time": { "type": "stdio", "command": "npx", "args": ["servidor-do-time"] },\n  },\n}\n';
    write(root, COPILOT, jsonc);
    await migrate(root);
    expect(read(root, COPILOT)).toBe(jsonc);
    declaresBrandServer(root, CLAUDE_CODE);
  },

  "O servidor MCP do kit é o build da fonte atual": async () => {
    const fresh = await buildMcpFromSource();
    const kit = fs.readFileSync(path.join(REPO_ROOT, "kit", "scripts", MCP_BUNDLE), "utf-8").replace(/\r\n/g, "\n");
    expect(fresh === kit, "rode `npm run build:mcp` e versione o bundle junto da mudança em src/mcp").toBe(true);
  },

  "O servidor MCP do kit não fala com a rede externa": () => {
    const hosts = [...hostsIn(fs.readFileSync(mcpBundlePath(), "utf-8"))];
    expect(hosts.filter((h) => BUNDLE_HOST_ALLOWLIST[h] === undefined)).toEqual([]);
    expect(hosts.filter((h) => FORBIDDEN_HOSTS.test(h))).toEqual([]);
  },
};

describe("Funcionalidade: Servidor MCP do estado instalado pelo kit nos dois harnesses", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) {
    if (steps === "pendente") it.todo(`Cenário: ${title}`);
    else it(`Cenário: ${title}`, steps, 30_000);
  }
});
