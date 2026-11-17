import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { parseInitiativesYaml, type Initiative } from "../../src/core/contracts/initiatives-contract.pure";
import { parseDeliveryState } from "../../src/core/contracts/delivery-state-contract.pure";
import { deriveWorkStatus } from "../../src/core/plans/work-status-view";

/**
 * Step definitions de `status-de-trabalho.feature` (F6.5, ADR-0022). O CLI de
 * estado roda como subprocesso num workspace temporário, sem State Service
 * (fallback em YAML, o mesmo StateCommands do HTTP e do MCP).
 */
const FEATURE = path.join(__dirname, "status-de-trabalho.feature");
const INIT = ".github/artifacts/initiatives.yaml";
const DS_MOD_X = ".github/artifacts/initiatives/mod-x/delivery-state.yaml";

let cli: string;

beforeAll(() => {
  const root = path.resolve(__dirname, "../..");
  cli = path.join(os.tmpdir(), `jatai-state-bdd-f65-${process.pid}.cjs`);
  execFileSync("npx", ["esbuild", "src/cli/helyx-state.ts", "--bundle", `--outfile=${cli}`, "--format=cjs", "--platform=node", "--target=node18"], {
    cwd: root,
    stdio: "pipe",
  });
}, 30_000);

interface CliResult {
  exit: number;
  out: Record<string, unknown> & { ok: boolean; error?: { code: string; field?: string } };
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

/** Contexto: "mod-x" ativa, onda "wave-1" com "item-1" e "item-2" pendentes. */
function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-f65-"));
  fs.mkdirSync(path.dirname(path.join(root, INIT)), { recursive: true });
  fs.writeFileSync(
    path.join(root, INIT),
    ["active: mod-x", "initiatives:", "  - id: mod-x", "    name: Modernização X", "    status: in-progress", "    wave_status:", "      wave-1:", "        item-1:", "          status: pending", "        item-2:", "          status: pending", ""].join("\n"),
    "utf-8"
  );
  return root;
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf-8");
const initiative = (root: string): Initiative => parseInitiativesYaml(read(root, INIT)).state!.initiatives.find((i) => i.id === "mod-x")!;
const waveItem = (root: string, item: string): Record<string, unknown> => initiative(root).wave_status!["wave-1"]!.items![item] as unknown as Record<string, unknown>;

function markItem(root: string, item: string, status: string, reason?: string): CliResult {
  const args = ["initiatives", "upsert-wave-item", "--id", "mod-x", "--wave", "wave-1", "--item", item, "--status", status];
  return run(root, ...(reason ? [...args, "--reason", reason] : args));
}

function markPhase(root: string, phase: string, status: string, reason?: string): CliResult {
  const args = ["delivery-state", "upsert-phase", "--initiative", "mod-x", "--phase", phase, "--status", status];
  return run(root, ...(reason ? [...args, "--reason", reason] : args));
}

function withReason(status: string, reason: string): void {
  const root = workspace();
  const r = markItem(root, "item-1", status, reason);
  expect(r.exit).toBe(0);
  expect(r.out).toMatchObject({ ok: true, status, item: "item-1" });
  expect(waveItem(root, "item-1")).toMatchObject({ status, reason });
}

function withoutReason(status: string): void {
  const root = workspace();
  const r = markPhase(root, "business", status);
  expect(r.exit).toBe(1);
  expect(r.out).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "reason" } });
  expect(fs.existsSync(path.join(root, DS_MOD_X))).toBe(false);
}

/** Quem aprova o D3: o subprocesso não tem git configurado, então vai sempre o --by (ADR-0024, decisão 2). */
const APPROVER = "Pessoa Fictícia";

function d3Open(status: string): void {
  const root = workspace();
  expect(markItem(root, "item-1", "done").exit).toBe(0);
  expect(markItem(root, "item-2", status, status === "blocked" || status === "failed" ? "motivo de teste" : undefined).exit).toBe(0);
  const r = run(root, "gates", "approve", "--gate", "d3", "--initiative", "mod-x", "--by", APPROVER);
  expect(r.exit).toBe(1);
  expect(r.out).toMatchObject({ ok: false, error: { code: "GATE_NOT_CLOSED", open: [{ item: "wave-1/item-2", status }] } });
  expect(initiative(root).gate_d3).toBeUndefined();
}

const SCENARIOS: Record<string, (() => void) | "pendente"> = {
  "Registrar um status que exige motivo, com o motivo [blocked · bloqueada por item-2]": () => withReason("blocked", "bloqueada por item-2"),
  "Registrar um status que exige motivo, com o motivo [failed · testes de integração quebraram]": () => withReason("failed", "testes de integração quebraram"),
  "Registrar um status que exige motivo, com o motivo [cancelled · escopo cortado pelo titular]": () => withReason("cancelled", "escopo cortado pelo titular"),

  "Recusar um status que exige motivo sem o motivo [blocked]": () => withoutReason("blocked"),
  "Recusar um status que exige motivo sem o motivo [failed]": () => withoutReason("failed"),
  "Recusar um status que exige motivo sem o motivo [cancelled]": () => withoutReason("cancelled"),

  "Recusar um status fora do vocabulário num item de onda": () => {
    const root = workspace();
    const before = read(root, INIT);
    const r = markItem(root, "item-1", "finished");
    expect(r.exit).toBe(1);
    expect(r.out).toMatchObject({ ok: false, error: { code: "INVALID_ENUM", field: "status" } });
    expect(read(root, INIT)).toBe(before);
  },

  "O motivo antigo sai quando o trabalho volta a andar": () => {
    const root = workspace();
    expect(markPhase(root, "business", "blocked", "falta o brief").exit).toBe(0);
    expect(parseDeliveryState(read(root, DS_MOD_X))!.phases.business).toMatchObject({ status: "blocked", reason: "falta o brief" });
    expect(markPhase(root, "business", "in-progress").exit).toBe(0);
    const phase = parseDeliveryState(read(root, DS_MOD_X))!.phases.business!;
    expect(phase.status).toBe("in-progress");
    expect(phase.reason).toBeUndefined();
  },

  "Cancelar uma iniciativa com motivo": () => {
    const root = workspace();
    const r = run(root, "initiatives", "create", "--id", "mod-x", "--status", "cancelled", "--reason", "a prioridade mudou");
    expect(r.exit).toBe(0);
    expect(initiative(root)).toMatchObject({ status: "cancelled", reason: "a prioridade mudou" });
  },

  "Status desconhecido escrito à mão é preservado, não rebaixado": () => {
    const root = workspace();
    fs.mkdirSync(path.dirname(path.join(root, DS_MOD_X)), { recursive: true });
    fs.writeFileSync(path.join(root, DS_MOD_X), "phases:\n  domain:\n    status: planejada\n", "utf-8");
    const r = run(root, "delivery-state", "get", "--initiative", "mod-x", "--phase", "domain");
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, state: { status: "unknown", status_text: "planejada" } });
    expect(read(root, DS_MOD_X)).toContain("status: planejada");
  },

  "O Gate D3 fecha com itens cancelados e lista cada cancelamento com o motivo": () => {
    const root = workspace();
    expect(markItem(root, "item-1", "done").exit).toBe(0);
    expect(markItem(root, "item-2", "cancelled", "fora do escopo").exit).toBe(0);
    const r = run(root, "gates", "approve", "--gate", "d3", "--initiative", "mod-x", "--by", APPROVER);
    expect(r.exit).toBe(0);
    expect(r.out).toMatchObject({ ok: true, gate: "d3", cancelled: [{ item: "wave-1/item-2", reason: "fora do escopo" }] });
    expect(initiative(root).gate_d3).toMatchObject({ status: "approved" });
  },
  "O Gate D3 não fecha com item bloqueado, com falha ou aberto [blocked]": () => d3Open("blocked"),
  "O Gate D3 não fecha com item bloqueado, com falha ou aberto [failed]": () => d3Open("failed"),
  "O Gate D3 não fecha com item bloqueado, com falha ou aberto [in-progress]": () => d3Open("in-progress"),

  "O Cockpit recebe o status e o motivo de cada fase e item da iniciativa ativa": () => {
    const root = workspace();
    expect(markItem(root, "item-1", "blocked", "aguarda decisão do titular").exit).toBe(0);
    const view = deriveWorkStatus(parseInitiativesYaml(read(root, INIT)).state, null);
    expect(view.initiativeId).toBe("mod-x");
    expect(view.entries).toContainEqual({ scope: "wave-item", key: "wave-1/item-1", status: "blocked", reason: "aguarda decisão do titular" });
    expect(view.gates.find((g) => g.gate === "D3")).toMatchObject({ closed: false });
  },
};

describe("Funcionalidade: Status de trabalho com bloqueio, falha e cancelamento", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) {
    if (steps === "pendente") it.todo(`Cenário: ${title}`);
    else it(`Cenário: ${title}`, steps);
  }
});
