import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { parseInitiativesYaml } from "../../src/core/contracts/initiatives-contract.pure";
import { parseFoundationState } from "../../src/core/contracts/foundation-state-contract.pure";

/**
 * Step definitions de `cli-leitura-e-gates.feature` (G2). O CLI de estado
 * roda como subprocesso, num workspace temporário, sem State Service no ar
 * (sem server.json): cobre o caminho local e o fallback em YAML.
 */
const FEATURE = path.join(__dirname, "cli-leitura-e-gates.feature");
const INIT = ".github/artifacts/initiatives.yaml";
const FOUNDATION = ".github/artifacts/assessment/foundation-state.yaml";
const DS_MOD_X = ".github/artifacts/initiatives/mod-x/delivery-state.yaml";

let cli: string;

beforeAll(() => {
  const root = path.resolve(__dirname, "../..");
  cli = path.join(os.tmpdir(), `jatai-state-bdd-g2-${process.pid}.cjs`);
  execFileSync("npx", ["esbuild", "src/cli/helyx-state.ts", "--bundle", `--outfile=${cli}`, "--format=cjs", "--platform=node", "--target=node18"], {
    cwd: root,
    stdio: "pipe",
  });
}, 30_000);

interface CliResult {
  exit: number;
  out: Record<string, unknown> & { ok: boolean; error?: { code: string } };
}

function run(cwd: string, ...args: string[]): CliResult {
  try {
    const stdout = execFileSync("node", [cli, ...args], { cwd, encoding: "utf-8", env: { PATH: process.env.PATH ?? "" } });
    return { exit: 0, out: JSON.parse(stdout) as CliResult["out"] };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { exit: e.status ?? 1, out: JSON.parse(e.stdout ?? "{}") as CliResult["out"] };
  }
}

/** Fases do Foundation de escopo `repo` que o D1 exige concluídas (ADR-0024, decisão 3). */
const REPO_PHASES = ["tech-stack", "arch", "coding-archaeology", "design", "quality", "debt"];

/** Contexto: iniciativa "mod-x" ativa, com roadmap e matriz de risco aprovados e wave-1/item-1 done; repo "api" com as fases concluídas e D1 pendente. */
function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-g2-"));
  const write = (rel: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content, "utf-8");
  };
  write(INIT, ["active: mod-x", "initiatives:", "  - id: mod-x", "    name: Modernização X", "    status: in-progress",
    "    roadmap_gate:", "      status: approved", "    risk_matrix_gate:", "      status: approved",
    "    wave_status:", "      wave-1:", "        item-1:", "          status: done", ""].join("\n"));
  const phases = REPO_PHASES.flatMap((p) => [`      ${p}:`, "        status: done"]);
  write(FOUNDATION, ["version: 2", "phases: {}", "repos:", "  api:", "    phases:", ...phases, "    gate_d1:", "      status: pending", ""].join("\n"));
  return root;
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");

function expectUsageError(r: CliResult, code: string): void {
  expect(r.exit).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.error?.code).toBe(code);
}

function approvedGateRecord(root: string, gate: "d2" | "d3"): Record<string, unknown> | undefined {
  const init = parseInitiativesYaml(read(root, INIT)).state!.initiatives.find((i) => i.id === "mod-x")!;
  return (gate === "d2" ? init.gate_d2 : init.gate_d3) as Record<string, unknown> | undefined;
}

function approveD2D3(gate: "d2" | "d3", note: string): void {
  const root = workspace();
  const r = run(root, "gates", "approve", "--gate", gate, "--initiative", "mod-x", "--note", note, "--approved-at", "2026-11-15T12:00:00.000Z", "--by", "Pessoa Fictícia");
  expect(r.exit).toBe(0);
  // F6.5 (ADR-0022 §3): a aprovação do D3 também lista os itens cancelados (aqui, nenhum).
  // ADR-0024 (decisão 2 do titular): o envelope traz quem aprovou.
  const keys = ["ok", "path", "changed", "gate", "initiative", "human_approved_at", "by", ...(gate === "d3" ? ["cancelled"] : [])];
  expect(Object.keys(r.out)).toEqual(keys);
  expect(r.out).toMatchObject({ ok: true, changed: true, gate, initiative: "mod-x", human_approved_at: "2026-11-15T12:00:00.000Z" });
  expect(String(r.out.path)).toMatch(/initiatives\.yaml$/);
  const record = approvedGateRecord(root, gate);
  expect(record).toEqual({ status: "approved", approved_at: "2026-11-15T12:00:00.000Z", human_approved_at: "2026-11-15T12:00:00.000Z", by: "Pessoa Fictícia", note });
  const again = run(root, "gates", "get", "--gate", gate, "--initiative", "mod-x");
  expect(again.out).toMatchObject({ ok: true, gate, initiative: "mod-x", record });
}

const SCENARIOS: Record<string, () => void> = {
  "Ler todas as iniciativas": () => {
    const root = workspace();
    const before = read(root, INIT);
    const r = run(root, "initiatives", "get");
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, state: { active: "mod-x", initiatives: [{ id: "mod-x" }] } });
    expect(String(r.out.path)).toMatch(/initiatives\.yaml$/);
    expect(read(root, INIT)).toBe(before);
  },

  "Ler uma iniciativa pelo id": () => {
    const r = run(workspace(), "initiatives", "get", "--id", "mod-x");
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, initiative: { id: "mod-x", wave_status: { "wave-1": { status: "done" } } } });
  },

  "Ler uma iniciativa que não existe": () => {
    expectUsageError(run(workspace(), "initiatives", "get", "--id", "nao-existe"), "INITIATIVE_NOT_FOUND");
  },

  "Ler uma fase do delivery-state da iniciativa": () => {
    const root = workspace();
    expect(run(root, "delivery-state", "upsert-phase", "--initiative", "mod-x", "--phase", "business", "--status", "done").exit).toBe(0);
    const r = run(root, "delivery-state", "get", "--initiative", "mod-x", "--phase", "business");
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, phase: "business", state: { status: "done" } });
    expect(String(r.out.path)).toMatch(new RegExp(`${DS_MOD_X.replace(/[.]/g, "\\.")}$`));
  },

  "Ler o delivery-state sem dizer o escopo": () => {
    expectUsageError(run(workspace(), "delivery-state", "get"), "MISSING_SCOPE");
  },

  "Ler o Gate D2 de uma iniciativa que ainda não foi aprovada": () => {
    const r = run(workspace(), "gates", "get", "--gate", "d2", "--initiative", "mod-x");
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, gate: "d2", initiative: "mod-x", record: null });
  },

  "Registrar a aprovação humana de D2 e D3 [d2 · roadmap e ADRs revisados]": () => approveD2D3("d2", "roadmap e ADRs revisados"),
  "Registrar a aprovação humana de D2 e D3 [d3 · PRs mergeados, testes ok]": () => approveD2D3("d3", "PRs mergeados, testes ok"),

  "Registrar a aprovação humana do Gate D1 de um repositório": () => {
    const root = workspace();
    const r = run(root, "gates", "approve", "--gate", "d1", "--repo", "api", "--approved-at", "2026-11-15T12:00:00.000Z", "--by", "Pessoa Fictícia");
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, changed: true, gate: "d1", repo: "api", human_approved_at: "2026-11-15T12:00:00.000Z", by: "Pessoa Fictícia" });
    expect(parseFoundationState(read(root, FOUNDATION))!.repos.api!.gate_d1).toEqual({
      status: "approved",
      approved_at: "2026-11-15T12:00:00.000Z",
      human_approved_at: "2026-11-15T12:00:00.000Z",
      by: "Pessoa Fictícia",
    });
    expect(run(root, "gates", "get", "--gate", "d1", "--repo", "api").out).toMatchObject({ ok: true, record: { status: "approved" } });
  },

  "Aprovar um gate desconhecido": () => {
    expectUsageError(run(workspace(), "gates", "approve", "--gate", "d4", "--initiative", "mod-x", "--note", "x"), "INVALID_ENUM");
  },

  "Aprovar o D1 sem dizer o repositório": () => {
    const root = workspace();
    const before = read(root, FOUNDATION);
    expectUsageError(run(root, "gates", "approve", "--gate", "d1"), "MISSING_FLAG");
    expect(read(root, FOUNDATION)).toBe(before);
  },

  "Aprovar o D3 de uma iniciativa que não existe": () => {
    const root = workspace();
    const before = read(root, INIT);
    expectUsageError(run(root, "gates", "approve", "--gate", "d3", "--initiative", "nao-existe", "--note", "x"), "INITIATIVE_NOT_FOUND");
    expect(read(root, INIT)).toBe(before);
  },
};

describe("Funcionalidade: Ler o estado e registrar os gates pelo CLI de estado", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
