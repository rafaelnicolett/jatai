import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { scenarioTitles } from "./gherkin";
import { parseInitiativesYaml } from "../../src/core/contracts/initiatives-contract.pure";
import { parseFoundationState } from "../../src/core/contracts/foundation-state-contract.pure";
import { StateServiceServer } from "../../src/server/StateServiceServer";
import { EventBus } from "../../src/server/EventBus";
import { YamlStateRepository } from "../../src/state/repository/StateRepository";
import { registerStateServiceTools } from "../../src/mcp/tools";
import { BRAND } from "../../src/data/brand.pure";

/**
 * Step definitions de `gates-aprovador-e-fechamento.feature` (ADR-0024,
 * decisões do titular). O CLI de estado roda como subprocesso, num workspace
 * temporário e sem State Service no ar (caminho de fallback em YAML). O git do
 * subprocesso só enxerga o HOME do cenário (`GIT_CONFIG_NOSYSTEM=1`): com um
 * `.gitconfig` que tem `user.name` e `user.email`, ou com um HOME vazio.
 */
const FEATURE = path.join(__dirname, "gates-aprovador-e-fechamento.feature");
const INIT = ".github/artifacts/initiatives.yaml";
const FOUNDATION = ".github/artifacts/assessment/foundation-state.yaml";
const REPOS = ".github/artifacts/repos.yaml";
const APPROVER = "Pessoa Fictícia";
const APPROVER_EMAIL = "pessoa.ficticia@example.invalid";
const AT = "2026-11-15T12:00:00.000Z";
/** Fases do Foundation de escopo `repo`, na ordem do plano. */
const REPO_PHASES = ["tech-stack", "arch", "coding-archaeology", "design", "quality", "debt"];

let cli: string;
const tmpDirs: string[] = [];

beforeAll(() => {
  const root = path.resolve(__dirname, "../..");
  cli = path.join(os.tmpdir(), `jatai-state-bdd-adr24-${process.pid}.cjs`);
  execFileSync("npx", ["esbuild", "src/cli/helyx-state.ts", "--bundle", `--outfile=${cli}`, "--format=cjs", "--platform=node", "--target=node18"], {
    cwd: root,
    stdio: "pipe",
  });
}, 30_000);

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

interface Workspace {
  root: string;
  home: string;
}

interface WorkspaceOptions {
  /** `user.name` do git do workspace; `null` = sem usuário. */
  gitUser: string | null;
  roadmap?: "pending" | "approved" | null;
  riskMatrix?: "pending" | "approved" | null;
  /** Status de cada fase do Foundation do repo `api`; ausente = a fase não foi registrada. */
  apiPhases?: Record<string, string>;
  apiHasFrontend?: boolean;
}

function write(root: string, rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content, "utf-8");
}

const gateLines = (name: string, status: "pending" | "approved" | null | undefined): string[] =>
  status ? [`    ${name}:`, `      status: ${status}`] : [];

/** Contexto: a iniciativa "mod-x" e o repositório "api" no Foundation. */
function workspace(opts: WorkspaceOptions): Workspace {
  const root = tmp("jatai-bdd-adr24-ws-");
  const home = tmp("jatai-bdd-adr24-home-");
  write(root, INIT, ["active: mod-x", "initiatives:", "  - id: mod-x", "    name: Modernização X", "    status: in-progress", "    type: modernization",
    ...gateLines("roadmap_gate", opts.roadmap), ...gateLines("risk_matrix_gate", opts.riskMatrix), ""].join("\n"));
  const phases = Object.entries(opts.apiPhases ?? {}).flatMap(([id, status]) => [`      ${id}:`, `        status: ${status}`]);
  write(root, FOUNDATION, ["version: 2", "phases: {}", "repos:", "  api:", ...(phases.length > 0 ? ["    phases:", ...phases] : []), "    gate_d1:", "      status: pending", ""].join("\n"));
  write(root, REPOS, ["version: 1", "repos:", "  - id: api", "    source: local-path", "    path: repos/api", ...(opts.apiHasFrontend === false ? ["    has_frontend: false"] : []), ""].join("\n"));
  if (opts.gitUser !== null) write(home, ".gitconfig", `[user]\n\tname = ${opts.gitUser}\n\temail = ${APPROVER_EMAIL}\n`);
  return { root, home };
}

const allPhasesDone = (except: string[] = []): Record<string, string> =>
  Object.fromEntries(REPO_PHASES.filter((p) => !except.includes(p)).map((p) => [p, "done"]));

interface CliResult {
  exit: number;
  out: Record<string, unknown> & { ok: boolean; error?: Record<string, unknown> & { code: string } };
}

function run(ws: Workspace, ...args: string[]): CliResult {
  const env = { PATH: process.env.PATH ?? "", HOME: ws.home, USERPROFILE: ws.home, GIT_CONFIG_NOSYSTEM: "1" };
  try {
    const stdout = execFileSync("node", [cli, ...args], { cwd: ws.root, encoding: "utf-8", env });
    return { exit: 0, out: JSON.parse(stdout) as CliResult["out"] };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { exit: e.status ?? 1, out: JSON.parse(e.stdout ?? "{}") as CliResult["out"] };
  }
}

const read = (ws: Workspace, rel: string): string => fs.readFileSync(path.join(ws.root, rel), "utf-8");
const modX = (ws: Workspace) => parseInitiativesYaml(read(ws, INIT)).state!.initiatives.find((i) => i.id === "mod-x")!;
const gateD1 = (ws: Workspace) => parseFoundationState(read(ws, FOUNDATION))!.repos.api!.gate_d1;

const approveD2 = (ws: Workspace, ...extra: string[]): CliResult => run(ws, "gates", "approve", "--gate", "d2", "--initiative", "mod-x", "--approved-at", AT, ...extra);
const approveD1 = (ws: Workspace): CliResult => run(ws, "gates", "approve", "--gate", "d1", "--repo", "api", "--approved-at", AT);

function expectUsageError(r: CliResult, code: string): Record<string, unknown> {
  expect(r.exit).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.error?.code).toBe(code);
  return r.out.error!;
}

function expectAskedForApprover(error: Record<string, unknown>): void {
  expect(error).toMatchObject({ code: "MISSING_FLAG", field: "by" });
  expect(String(error.message)).toContain("--by");
}

/** O gate D2 de "mod-x" nunca foi gravado, e o arquivo não mudou. */
function expectD2Unrecorded(ws: Workspace, before: string): void {
  expect(read(ws, INIT)).toBe(before);
  expect(modX(ws).gate_d2).toBeUndefined();
}

const MAP_STATUS: Record<string, "pending" | "approved" | null> = { pendente: "pending", aprovado: "approved", aprovada: "approved", ausente: null };

function d2NotClosed(roadmap: string, riskMatrix: string, missing: string[]): void {
  const ws = workspace({ gitUser: APPROVER, roadmap: MAP_STATUS[roadmap], riskMatrix: MAP_STATUS[riskMatrix] });
  const before = read(ws, INIT);
  const error = expectUsageError(approveD2(ws), "GATE_NOT_CLOSED");
  expect(error).toMatchObject({ gate: "d2", initiative: "mod-x" });
  expect((error.open as Array<{ gate: string }>).map((g) => g.gate)).toEqual(missing);
  for (const gate of missing) expect(String(error.message)).toContain(gate);
  expectD2Unrecorded(ws, before);
}

/** Uma tool aprova gate se o nome ou a descrição falam em aprovar/gate (e não só em ler o estado). */
function approvesGate(tool: { name: string; description?: string }): boolean {
  return /gate|approv|aprov/i.test(tool.name) || /aprova(r|ção)?\s+(de\s+|o\s+|um\s+)?gate|approve\s+gate|gates\/approve/i.test(tool.description ?? "");
}

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "Quem aprova é o usuário do git do workspace": () => {
    const ws = workspace({ gitUser: APPROVER, roadmap: "approved", riskMatrix: "approved" });
    const r = approveD2(ws);
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, gate: "d2", initiative: "mod-x", human_approved_at: AT, by: APPROVER });
    expect(modX(ws).gate_d2).toEqual({ status: "approved", approved_at: AT, human_approved_at: AT, by: APPROVER });
    for (const rel of [INIT, FOUNDATION]) expect(read(ws, rel)).not.toContain(APPROVER_EMAIL);
    expect(JSON.stringify(r.out)).not.toContain(APPROVER_EMAIL);
  },

  "Quem aprova pode ser informado explicitamente": () => {
    const ws = workspace({ gitUser: APPROVER, roadmap: "approved", riskMatrix: "approved" });
    const r = approveD2(ws, "--by", "Outra Pessoa");
    expect(r.exit).toBe(0);
    expect(modX(ws).gate_d2).toMatchObject({ status: "approved", by: "Outra Pessoa" });
  },

  "Sem usuário no git, a aprovação pede o nome de quem aprova": () => {
    const ws = workspace({ gitUser: null, roadmap: "approved", riskMatrix: "approved" });
    const before = read(ws, INIT);
    expectAskedForApprover(expectUsageError(approveD2(ws), "MISSING_FLAG"));
    expectD2Unrecorded(ws, before);
  },

  "Pelo State Service, sem nome conhecido, o Cockpit recebe o pedido do nome": async () => {
    const ws = workspace({ gitUser: null, roadmap: "approved", riskMatrix: "approved" });
    const before = read(ws, INIT);
    const server = new StateServiceServer({ root: ws.root, repository: new YamlStateRepository(), eventBus: new EventBus(), token: "bdd-adr24", approverName: async () => null });
    const port = await server.start();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/gates/approve`, {
        method: "POST",
        headers: { Authorization: "Bearer bdd-adr24", "Content-Type": "application/json" },
        body: JSON.stringify({ gate: "d2", initiativeId: "mod-x", at: AT }),
      });
      const body = (await res.json()) as { ok: boolean; error: Record<string, unknown> };
      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expectAskedForApprover(body.error);
    } finally {
      await server.stop();
    }
    expectD2Unrecorded(ws, before);
  },

  "O D1 de um repositório aprova com as fases do Foundation dele concluídas": () => {
    const ws = workspace({ gitUser: APPROVER, apiPhases: allPhasesDone() });
    const r = approveD1(ws);
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, gate: "d1", repo: "api", human_approved_at: AT, by: APPROVER });
    expect(gateD1(ws)).toEqual({ status: "approved", approved_at: AT, human_approved_at: AT, by: APPROVER });
    expect(read(ws, FOUNDATION)).not.toContain(APPROVER_EMAIL);
  },

  "O D1 com fase do Foundation aberta é recusado com a lista do que falta": () => {
    const ws = workspace({ gitUser: APPROVER, apiPhases: { ...allPhasesDone(["quality", "debt"]), quality: "agent-done" } });
    const before = read(ws, FOUNDATION);
    const error = expectUsageError(approveD1(ws), "GATE_NOT_CLOSED");
    expect(error).toMatchObject({ gate: "d1", repo: "api", open: [{ phase: "quality", status: "agent-done" }, { phase: "debt", status: "missing" }] });
    expect(String(error.message)).toContain("quality");
    expect(String(error.message)).toContain("debt");
    expect(read(ws, FOUNDATION)).toBe(before);
    expect(gateD1(ws).status).toBe("pending");
  },

  "A fase de design não segura o D1 de um repositório sem frontend": () => {
    const ws = workspace({ gitUser: APPROVER, apiPhases: allPhasesDone(["design"]), apiHasFrontend: false });
    const r = approveD1(ws);
    expect(r.exit).toBe(0);
    expect(gateD1(ws)).toMatchObject({ status: "approved", by: APPROVER });
  },

  "O D2 só aprova com o roadmap e a matriz de risco aprovados [pendente · aprovada · roadmap_gate]": () => d2NotClosed("pendente", "aprovada", ["roadmap_gate"]),
  "O D2 só aprova com o roadmap e a matriz de risco aprovados [aprovado · ausente · risk_matrix_gate]": () => d2NotClosed("aprovado", "ausente", ["risk_matrix_gate"]),
  "O D2 só aprova com o roadmap e a matriz de risco aprovados [ausente · ausente · roadmap_gate, risk_matrix_gate]": () =>
    d2NotClosed("ausente", "ausente", ["roadmap_gate", "risk_matrix_gate"]),

  "Nenhuma ferramenta de agente aprova gate": async () => {
    const server = new McpServer({ name: BRAND.mcpServerName, version: "0.1.0" });
    registerStateServiceTools(server, { root: tmp("jatai-bdd-adr24-mcp-") });
    const client = new Client({ name: "bdd-adr24", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.filter(approvesGate).map((t) => t.name)).toEqual([]);
    } finally {
      await client.close();
      await server.close();
    }
  },
};

describe("Funcionalidade: Aprovar gates em nome de quem decide e só com o trabalho anterior fechado", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
