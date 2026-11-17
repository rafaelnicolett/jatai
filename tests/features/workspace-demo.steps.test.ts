import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { scenarioTitles } from "./gherkin";
import { DEMO_DIR, DEMO_PROJECT_NAME, FIXTURES_DIR, RENAMES, buildDemo, listFiles } from "../../scripts/demo-build.mjs";
import { loadRoteiro, planScenes, playDemo } from "../../scripts/demo-play.mjs";
import { isWorkspaceRelativePath, validateRunsFile } from "../../scripts/lib/agent-activity.mjs";
import { brandPattern, loadBrand } from "../../scripts/brand-lint.mjs";
import { FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT } from "../../src/core/methodology/foundation-contracts";
import { parseInitiativesYaml, type Initiative } from "../../src/core/contracts/initiatives-contract.pure";
import { parseFoundationState } from "../../src/core/contracts/foundation-state-contract.pure";
import { parseReposYaml } from "../../src/core/contracts/repos-contract.pure";
import { parseDeliveryState } from "../../src/core/contracts/delivery-state-contract.pure";
import { parseRepoGraph } from "../../src/core/contracts/repo-graph-contract.pure";
import { parseContextReposYaml } from "../../src/core/contracts/context-repos-contract.pure";
import { parseDevopsStatus, parseObservabilityStatus } from "../../src/core/contracts/operations-contract.pure";
import { parseRunEvents } from "../../src/core/contracts/run-events-contract.pure";

/**
 * Step definitions de `workspace-demo.feature` (F7.4). O demo é gerado pelo
 * `scripts/demo-build.mjs` (instalador real do kit mais as fixtures de `demo/`)
 * num diretório temporário, e o CLI de estado que o instalador põe no próprio
 * demo roda como subprocesso, sem State Service no ar. Tudo é inventado.
 */
const FEATURE = path.join(__dirname, "workspace-demo.feature");
const PKG_ROOT = path.resolve(__dirname, "../..");
const POR = "Pessoa Exemplo";
const FEAT = "feat-reserva-com-fila";
const HOT = "hotfix-prazo-de-devolucao";
const MOD = "mod-emprestimos-hexagonal";
const ARTIFACTS = ".github/artifacts";
const RUNS = `${ARTIFACTS}/runs`;
const DIA_FIXO = "2026-10-05";

const temps: string[] = [];
let shared: string;

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

beforeAll(async () => {
  shared = tmp("jatai-demo-shared-");
  await buildDemo({ out: shared });
}, 60_000);

afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, ...rel.split("/")), "utf-8");
const exists = (root: string, rel: string): boolean => fs.existsSync(path.join(root, ...rel.split("/")));

interface CliResult {
  exit: number;
  out: Record<string, unknown> & { ok: boolean; error?: { code: string } };
}

/** O CLI de estado que o instalador pôs no demo (`.github/scripts/<cli>`), como um agente o chamaria. */
function cli(root: string, ...args: string[]): CliResult {
  const brand = loadBrand(PKG_ROOT) as { files: { cli: string } };
  const bin = path.join(root, ".github", "scripts", brand.files.cli);
  try {
    const stdout = execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf-8", env: { PATH: process.env.PATH ?? "" } });
    return { exit: 0, out: JSON.parse(stdout) as CliResult["out"] };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { exit: e.status ?? 1, out: JSON.parse(e.stdout ?? "{}") as CliResult["out"] };
  }
}

/** Resumo de todos os arquivos de um diretório: caminho e conteúdo. */
function treeHash(root: string): string {
  const hash = crypto.createHash("sha256");
  for (const rel of listFiles(root)) hash.update(`${rel}\0`).update(fs.readFileSync(path.join(root, ...rel.split("/")))).update("\0");
  return hash.digest("hex");
}

function runFiles(root: string): string[] {
  return fs.readdirSync(path.join(root, ...RUNS.split("/"))).filter((f) => f.endsWith(".jsonl")).sort();
}

function runsHash(root: string): string {
  const hash = crypto.createHash("sha256");
  for (const f of runFiles(root)) hash.update(`${f}\0`).update(read(root, `${RUNS}/${f}`));
  return hash.digest("hex");
}

type RunEventLike = {
  run_id: string;
  event_type: string;
  timestamp: string;
  initiative_id?: string;
  task_id?: string;
  phase_id?: string;
  agent_id?: string;
  repo_id?: string;
  artifact_path?: string;
  by?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

function allRunEvents(root: string): RunEventLike[] {
  return runFiles(root).flatMap((f) => validateRunsFile(read(root, `${RUNS}/${f}`)).events as RunEventLike[]);
}

function initiativesOf(root: string): Initiative[] {
  return parseInitiativesYaml(read(root, `${ARTIFACTS}/initiatives.yaml`)).state!.initiatives;
}

function initiative(root: string, id: string): Initiative {
  return initiativesOf(root).find((i) => i.id === id)!;
}

/** Os textos de todos os arquivos de texto das fixtures, com o caminho de cada um. */
function fixtureTexts(): Array<{ rel: string; text: string }> {
  return listFiles(FIXTURES_DIR).map((rel) => ({ rel, text: fs.readFileSync(path.join(FIXTURES_DIR, ...rel.split("/")), "utf-8") }));
}

// Em qual stream um evento cai (as regras do mapa da colmeia, F5.2: fase, depois caminho do artefato).
const PLANNING = new Set(["planning", "modernization-planner", "risk-prioritizer", "adr-recorder", "roadmap", "risk-matrix"]);
const EXECUTION = new Set(["execution", "test-backfill", "refactor", "migration", "feature", "feature-add", "review", "reviewer"]);
const OPERATION = new Set(["operation", "devops", "observability", "incident", "sustain", "release"]);
const DISCOVERY = new Set(["discovery", "foundation", "assessor", ...FOUNDATION_CONTRACTS.map((c) => c.phaseId), SKILL_LINKING_CONTRACT.phaseId]);

function streamOf(e: RunEventLike): string | undefined {
  const gate = e.phase_id?.match(/^gate-d([123])$/i);
  if (gate) return ["discovery", "planning", "execution"][Number(gate[1]) - 1];
  if (e.phase_id) {
    if (DISCOVERY.has(e.phase_id)) return "discovery";
    if (PLANNING.has(e.phase_id)) return "planning";
    if (EXECUTION.has(e.phase_id)) return "execution";
    if (OPERATION.has(e.phase_id)) return "operation";
  }
  return undefined;
}

const ESTADOS: Array<[estado: string, exigeMotivo: boolean]> = [
  ["done", false],
  ["in-progress", false],
  ["pending", false],
  ["blocked", true],
  ["failed", true],
  ["cancelled", true],
  ["skipped", false],
];

/** Todos os itens de `epic_status` da feature ativa, com a chave `epic-N/task-N.M`. */
function featureTasks(root: string): Array<{ key: string; status: string; reason?: string }> {
  const epics = initiative(root, FEAT).epic_status ?? {};
  return Object.entries(epics).flatMap(([epic, entry]) => Object.entries(entry.items ?? {}).map(([task, item]) => ({ key: `${epic}/${task}`, status: item.status, reason: item.reason })));
}

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "O demo nasce do instalador real do kit, com as fixtures por cima": () => {
    // Kit do brownfield instalado para o Claude Code.
    const config = read(shared, "jatai.config.yaml");
    expect(config).toContain("mode: brownfield");
    expect(config).toContain('host_adapter: "claude"');
    expect(config).toContain(`name: "${DEMO_PROJECT_NAME}"`);
    for (const rel of [
      "CLAUDE.md",
      "AGENTS.md",
      ".mcp.json",
      ".claude/settings.json",
      ".claude/agents/jatai.agent.md",
      ".claude/agents/execution/feature-adder.agent.md",
      ".github/kit.lock.json",
      ".github/scripts/jatai-state.cjs",
      ".github/scripts/jatai-mcp.cjs",
    ]) {
      expect(exists(shared, rel), rel).toBe(true);
    }
    // As fixtures por cima: cada uma está no demo, igual, no caminho de destino.
    for (const rel of listFiles(FIXTURES_DIR)) {
      const target = (RENAMES as Record<string, string>)[rel] ?? rel;
      expect(exists(shared, target), target).toBe(true);
      expect(read(shared, target), target).toBe(fs.readFileSync(path.join(FIXTURES_DIR, ...rel.split("/")), "utf-8"));
    }
    // Os dois repositórios fictícios e o estado da metodologia.
    for (const rel of [
      "repos/biblioteca-api/app/main.py",
      "repos/biblioteca-web/src/App.tsx",
      `${ARTIFACTS}/repos.yaml`,
      `${ARTIFACTS}/initiatives.yaml`,
      `${ARTIFACTS}/assessment/foundation-state.yaml`,
      `${ARTIFACTS}/assessment/report.md`,
    ]) {
      expect(exists(shared, rel), rel).toBe(true);
    }
  },

  "Gerar o demo de novo na mesma pasta dá o mesmo histórico de atividade": async () => {
    const dir = tmp("jatai-demo-again-");
    await buildDemo({ out: dir });
    const first = { runs: runsHash(dir), files: listFiles(dir) };
    await buildDemo({ out: dir });
    expect(runsHash(dir)).toBe(first.runs);
    expect(listFiles(dir)).toEqual(first.files);
    expect(runsHash(dir)).toBe(runsHash(shared));
  },

  "O demo não apaga uma pasta que não é de um demo gerado": () => {
    const dir = tmp("jatai-demo-alheia-");
    fs.writeFileSync(path.join(dir, "anotacoes.txt"), "não é do demo", "utf-8");
    const r = spawnSync(process.execPath, [path.join(PKG_ROOT, "scripts", "demo-build.mjs"), "--out", dir], { encoding: "utf-8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("não é de um demo gerado");
    expect(r.stderr).toContain("--out");
    expect(fs.readFileSync(path.join(dir, "anotacoes.txt"), "utf-8")).toBe("não é do demo");
    expect(fs.readdirSync(dir)).toEqual(["anotacoes.txt"]);
  },

  "A Descoberta está concluída nos dois repositórios e o Gate D1 foi aprovado": () => {
    const repos = parseReposYaml(read(shared, `${ARTIFACTS}/repos.yaml`)).inventory.repos;
    expect(repos.map((r) => r.id)).toEqual(["biblioteca-api", "biblioteca-web"]);
    const state = parseFoundationState(read(shared, `${ARTIFACTS}/assessment/foundation-state.yaml`))!;
    for (const repo of repos) {
      const phases = state.repos[repo.id]!.phases;
      for (const contract of FOUNDATION_CONTRACTS.filter((c) => c.scope === "repo")) {
        if (contract.appliesWhen === "frontend" && !repo.has_frontend) continue;
        const phase = phases[contract.phaseId];
        expect(phase?.status, `${repo.id}/${contract.phaseId}`).toBe("done");
        for (const item of contract.checklist.filter((c) => c.mandatory)) expect(phase?.human_checklist[item.id], `${repo.id}/${contract.phaseId}/${item.id}`).toBe(true);
      }
      const gate = cli(shared, "gates", "get", "--gate", "d1", "--repo", repo.id);
      expect(gate.exit).toBe(0);
      expect(gate.out).toMatchObject({ ok: true, gate: "d1", repo: repo.id, record: { status: "approved", by: POR } });
      expect((gate.out.record as { human_approved_at?: string }).human_approved_at).toMatch(/^2026-10-05T/);
    }
    for (const contract of [...FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT].filter((c) => c.scope === "workspace" && c.mandatoryForF1)) {
      expect(state.phases[contract.phaseId]?.status, contract.phaseId).toBe("done");
    }
  },

  "O demo traz três iniciativas e a feature em Execução é a ativa": () => {
    const parsed = parseInitiativesYaml(read(shared, `${ARTIFACTS}/initiatives.yaml`));
    expect(parsed.errors).toEqual([]);
    const byId = Object.fromEntries(parsed.state!.initiatives.map((i) => [i.id, i]));
    expect(Object.keys(byId).sort()).toEqual([FEAT, HOT, MOD].sort());
    expect(byId[FEAT]).toMatchObject({ type: "feature", status: "in-progress", stream: "execution", mode: "brownfield" });
    expect(byId[HOT]).toMatchObject({ type: "hotfix", status: "done", stream: "execution" });
    expect(byId[MOD]).toMatchObject({ type: "modernization", status: "in-progress", stream: "planning", arch_target: "hexagonal" });
    expect(parsed.state!.active).toBe(FEAT);
    const active = cli(shared, "initiatives", "get");
    expect(active.out).toMatchObject({ ok: true, state: { active: FEAT } });
  },

  ...Object.fromEntries(
    ESTADOS.map(([estado, exigeMotivo]): [string, () => void] => [
      `A feature ativa tem uma tarefa em cada estado de trabalho [${estado} · ${exigeMotivo ? "sim" : "não"}]`,
      () => {
        const tasks = featureTasks(shared).filter((t) => t.status === estado);
        expect(tasks.length, `tarefa em ${estado}`).toBeGreaterThan(0);
        for (const task of tasks) {
          if (exigeMotivo) expect(task.reason?.trim().length ?? 0, `${task.key} precisa de motivo`).toBeGreaterThan(3);
        }
        // O CLI devolve o mesmo status, sem rebaixar nada para texto desconhecido.
        const got = cli(shared, "initiatives", "get", "--id", FEAT);
        expect(got.exit).toBe(0);
        const epics = (got.out.initiative as { epic_status: Record<string, { items: Record<string, { status: string }> }> }).epic_status;
        const statuses = Object.values(epics).flatMap((e) => Object.values(e.items).map((i) => i.status));
        expect(statuses).toContain(estado);
        expect(statuses).not.toContain("unknown");
      },
    ]),
  ),

  "Os gates D1 e D2 estão aprovados por Pessoa Exemplo e o D3 está pendente": () => {
    const d2 = cli(shared, "gates", "get", "--gate", "d2", "--initiative", FEAT);
    expect(d2.out).toMatchObject({ ok: true, gate: "d2", initiative: FEAT, record: { status: "approved", by: POR } });
    expect((d2.out.record as { human_approved_at?: string }).human_approved_at).toMatch(/^2026-10-05T/);
    const d3 = cli(shared, "gates", "get", "--gate", "d3", "--initiative", FEAT);
    expect(d3.out).toMatchObject({ ok: true, gate: "d3", initiative: FEAT, record: { status: "pending" } });
    const hotfixD3 = cli(shared, "gates", "get", "--gate", "d3", "--initiative", HOT);
    expect(hotfixD3.out).toMatchObject({ ok: true, record: { status: "approved", by: POR } });
    // A modernização ainda está em Planejamento: o D2 dela é pendente.
    expect(initiative(shared, MOD).gate_d2?.status).toBe("pending");
  },

  "Cada iniciativa tem o seu estado de entrega, e o CLI o lê": () => {
    for (const id of [FEAT, HOT, MOD]) {
      const r = cli(shared, "delivery-state", "get", "--initiative", id);
      expect(r.exit, id).toBe(0);
      expect(r.out.ok, id).toBe(true);
      expect(String(r.out.path)).toContain(`initiatives/${id}/delivery-state.yaml`);
      expect(Object.keys((r.out.state as { phases: object }).phases).length, id).toBeGreaterThan(1);
    }
    const frontend = cli(shared, "delivery-state", "get", "--initiative", FEAT, "--phase", "frontend");
    expect(frontend.out).toMatchObject({ ok: true, phase: "frontend", state: { status: "failed" } });
    expect((frontend.out.state as { reason?: string }).reason?.length).toBeGreaterThan(3);
    const reviewer = cli(shared, "delivery-state", "get", "--initiative", FEAT, "--phase", "reviewer");
    expect(reviewer.out).toMatchObject({ ok: true, phase: "reviewer", state: { status: "blocked" } });
    expect((reviewer.out.state as { reason?: string }).reason?.length).toBeGreaterThan(3);
  },

  "Ler o estado do demo pelo CLI não altera nenhum arquivo": () => {
    const dir = tmp("jatai-demo-leitura-");
    return buildDemo({ out: dir }).then(() => {
      const before = treeHash(dir);
      expect(cli(dir, "initiatives", "get").exit).toBe(0);
      expect(cli(dir, "initiatives", "get", "--id", HOT).exit).toBe(0);
      expect(cli(dir, "delivery-state", "get", "--initiative", FEAT).exit).toBe(0);
      expect(cli(dir, "gates", "get", "--gate", "d2", "--initiative", FEAT).exit).toBe(0);
      expect(cli(dir, "gates", "get", "--gate", "d1", "--repo", "biblioteca-web").exit).toBe(0);
      expect(treeHash(dir)).toBe(before);
    });
  },

  "Todo YAML de estado do demo é lido sem erro pelos leitores da Jataí": () => {
    const repos = parseReposYaml(read(shared, `${ARTIFACTS}/repos.yaml`));
    expect(repos.errors).toEqual([]);
    expect(repos.inventory.repos).toHaveLength(2);
    expect(parseFoundationState(read(shared, `${ARTIFACTS}/assessment/foundation-state.yaml`))).not.toBeNull();
    expect(parseInitiativesYaml(read(shared, `${ARTIFACTS}/initiatives.yaml`)).errors).toEqual([]);
    for (const id of [FEAT, HOT, MOD]) expect(parseDeliveryState(read(shared, `${ARTIFACTS}/initiatives/${id}/delivery-state.yaml`)), id).not.toBeNull();
    const graph = parseRepoGraph(read(shared, `${ARTIFACTS}/assessment/repo-graph.yaml`));
    expect(graph.errors).toEqual([]);
    expect(graph.graph.edges.length).toBeGreaterThan(0);
    const contexts = parseContextReposYaml(read(shared, `${ARTIFACTS}/context-repos.yaml`));
    expect(contexts.errors).toEqual([]);
    expect(contexts.map.contexts.every((c) => c.status === "accepted")).toBe(true);
    expect(parseDevopsStatus(read(shared, `${ARTIFACTS}/operations/devops-status.yaml`)).errors).toEqual([]);
    expect(parseObservabilityStatus(read(shared, `${ARTIFACTS}/operations/observability-status.yaml`)).errors).toEqual([]);
    // Todo YAML dos artefatos é YAML válido, até os que nenhum leitor pede.
    for (const rel of listFiles(shared).filter((f) => f.startsWith(`${ARTIFACTS}/`) && f.endsWith(".yaml"))) {
      expect(() => yaml.load(read(shared, rel)), rel).not.toThrow();
    }
  },

  "Cada linha do histórico de atividade segue o contrato agent-activity": () => {
    const files = runFiles(shared);
    expect(files).toEqual(["feat-reserva-com-fila.jsonl", "hotfix-prazo-de-devolucao.jsonl", "mod-emprestimos-hexagonal.jsonl", "workspace.jsonl"]);
    for (const f of files) {
      const text = read(shared, `${RUNS}/${f}`);
      const r = validateRunsFile(text);
      expect(r.problems, f).toEqual([]);
      // O leitor que o Cockpit usa entende todas as linhas.
      expect(parseRunEvents(text), f).toHaveLength(r.events.length);
    }
    for (const e of allRunEvents(shared)) {
      if (e.metadata) expect(Object.keys(e.metadata).every((k) => ["reason", "task", "path", "count"].includes(k)), JSON.stringify(e)).toBe(true);
      if (e.message) expect([...e.message].length).toBeLessThanOrEqual(140);
    }
    // O nome de cada arquivo é o da iniciativa dos eventos dele (o mesmo que o escritor do produto usa).
    for (const f of files) {
      const key = f.replace(/\.jsonl$/, "");
      for (const e of validateRunsFile(read(shared, `${RUNS}/${f}`)).events as RunEventLike[]) {
        expect(e.initiative_id ?? "workspace", `${f}`).toBe(key);
      }
    }
  },

  "O histórico conta uma história de algumas horas, a partir de uma data fixa": () => {
    for (const f of runFiles(shared)) {
      const events = validateRunsFile(read(shared, `${RUNS}/${f}`)).events as RunEventLike[];
      for (const e of events) expect(e.timestamp.slice(0, 10), `${f}`).toBe(DIA_FIXO);
      const times = events.map((e) => e.timestamp);
      expect([...times].sort(), `${f} em ordem crescente`).toEqual(times);
    }
    const all = allRunEvents(shared).map((e) => Date.parse(e.timestamp));
    const hours = (Math.max(...all) - Math.min(...all)) / 3_600_000;
    expect(hours).toBeGreaterThanOrEqual(2);
    expect(hours).toBeLessThanOrEqual(8);
    // Cabe na janela de 200 eventos que o Cockpit lê.
    expect(all.length).toBeLessThan(200);
  },

  "O histórico passa pelos quatro streams e pelos gates, com decisão, bloqueio e falha": () => {
    const events = allRunEvents(shared);
    const streams = new Set(events.map(streamOf));
    for (const stream of ["discovery", "planning", "execution", "operation"]) expect(streams.has(stream), stream).toBe(true);
    // Gates: D1 (um por repositório), D2 e D3, sempre decididos por uma pessoa.
    const gates = events.filter((e) => e.event_type === "gate-approved");
    expect(gates.map((e) => e.phase_id).sort()).toEqual(["gate-d1", "gate-d1", "gate-d2", "gate-d3"]);
    for (const g of gates) expect(g.by).toBe(POR);
    // Uma decisão pedida e tomada: a mesma chave (tarefa, ou metadata.task) abre e fecha.
    const keyOf = (e: RunEventLike): string | undefined => e.task_id ?? (e.metadata?.task as string | undefined);
    const requested = events.filter((e) => e.event_type === "decision-requested").map(keyOf);
    const made = events.filter((e) => e.event_type === "decision-made").map(keyOf);
    expect(requested.length).toBeGreaterThan(0);
    expect(made.sort()).toEqual([...requested].sort());
    for (const e of events.filter((x) => x.event_type === "decision-made")) expect(e.by).toBe(POR);
    // Um bloqueio e uma falha, e o estado gravado concorda com os dois.
    const blocked = events.filter((e) => e.event_type === "blocked");
    const failure = blocked.filter((e) => e.message?.startsWith("falhou:"));
    const block = blocked.filter((e) => !e.message?.startsWith("falhou:"));
    expect(block.length).toBeGreaterThan(0);
    expect(failure.length).toBeGreaterThan(0);
    const tasks = featureTasks(shared);
    for (const e of block) expect(tasks.find((t) => t.key === e.task_id)?.status, e.task_id).toBe("blocked");
    for (const e of failure) expect(tasks.find((t) => t.key === e.task_id)?.status, e.task_id).toBe("failed");
  },

  "O histórico cita só caminhos de artefatos que existem no demo, nunca conteúdo": () => {
    const events = allRunEvents(shared);
    const cited = events.flatMap((e) => [e.artifact_path, e.metadata?.path as string | undefined]).filter((p): p is string => typeof p === "string");
    expect(cited.length).toBeGreaterThan(20);
    for (const p of cited) {
      expect(isWorkspaceRelativePath(p), p).toBe(true);
      expect(exists(shared, p.replace(/\/$/, "")), p).toBe(true);
    }
    // Só metadados: nenhuma mensagem tem quebra de linha, trecho de código ou conteúdo de arquivo.
    for (const e of events) {
      if (e.message) expect(e.message, e.message).not.toMatch(/[\n\r`]|```|=>|\bdef \b|\bfunction\b/);
      expect(Object.keys(e).every((k) => k !== "content" && k !== "diff" && k !== "prompt" && k !== "output"), JSON.stringify(e)).toBe(true);
    }
  },

  "O demo só tem uma pessoa, a Pessoa Exemplo, e nenhum contato": () => {
    const initiatives = initiativesOf(shared);
    for (const i of initiatives) expect(i.owner, i.id).toBe(POR);
    const names = new Set<string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          if ((k === "by" || k === "owner" || k === "approver") && typeof v === "string") names.add(v);
          collect(v);
        }
      }
    };
    for (const rel of listFiles(FIXTURES_DIR).filter((f) => f.endsWith(".yaml"))) collect(yaml.load(fs.readFileSync(path.join(FIXTURES_DIR, ...rel.split("/")), "utf-8")));
    for (const e of allRunEvents(shared)) if (e.by) names.add(e.by);
    expect([...names]).toEqual([POR]);
    // Nenhum e-mail nem telefone brasileiro, em nenhuma fixture.
    const email = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    // Telefone do Brasil, com ou sem DDI e DDD. Fora de uma palavra ou de um id como `r-20261005-0001`.
    const telefone = /(?<![\w-])(\+\d{2}\s?)?\(?\d{2}\)?\s?9?\d{4}-\d{4}(?![\w-])/;
    for (const { rel, text } of fixtureTexts()) {
      expect(email.test(text), `${rel}: e-mail`).toBe(false);
      expect(telefone.test(text), `${rel}: telefone`).toBe(false);
    }
  },

  "As fixtures não fixam a marca e o workspace gerado não deixa marca sem resolver": () => {
    const pattern = brandPattern(loadBrand(PKG_ROOT));
    for (const { rel, text } of fixtureTexts()) {
      expect(pattern.test(rel), `${rel}: caminho`).toBe(false);
      expect(pattern.test(text), `${rel}: texto`).toBe(false);
    }
    for (const rel of listFiles(shared)) {
      const bytes = fs.readFileSync(path.join(shared, ...rel.split("/")));
      if (bytes.subarray(0, 8192).includes(0)) continue;
      expect(/\{\{brand\./.test(bytes.toString("utf-8")), `${rel}: {{brand.*}} sem resolver`).toBe(false);
    }
  },

  "O demo fica fora do git e fora do pacote da extensão": () => {
    const lines = (file: string): string[] => fs.readFileSync(path.join(PKG_ROOT, file), "utf-8").split("\n").map((l) => l.trim());
    expect(lines(".gitignore")).toContain(`/${DEMO_DIR}/`);
    expect(lines(".vscodeignore")).toContain("demo/");
    expect(lines(".vscodeignore")).toContain(`${DEMO_DIR}/`);
  },

  "A reprodução ao vivo acrescenta eventos válidos sem apagar o histórico": async () => {
    const dir = tmp("jatai-demo-play-");
    await buildDemo({ out: dir });
    const file = `${RUNS}/${FEAT}.jsonl`;
    const before = read(dir, file);
    const startedAt = Date.now();
    const roteiro = loadRoteiro();
    const { lines } = await playDemo({ out: dir, roteiro, speed: 0, log: () => undefined });
    const finishedAt = Date.now();

    const after = read(dir, file);
    expect(after.startsWith(before)).toBe(true);
    expect(validateRunsFile(after).problems).toEqual([]);
    const added = validateRunsFile(after.slice(before.length)).events as RunEventLike[];
    // Desde a F5.2 (frente G), toda mudança de estado pelo CLI grava, por conta própria, um artifact-written
    // (run_id state-commands). As cenas com estado passam pelo CLI, então somam esses eventos aos delas.
    const cenas = planScenes(roteiro);
    const mudancasDeEstado = cenas.filter((c: { estado?: unknown }) => c.estado).length;
    const doEstado = added.filter((e) => e.event_type === "artifact-written" && (e as { run_id?: string }).run_id === "state-commands");
    const daCena = added.filter((e) => !doEstado.includes(e));
    expect(doEstado).toHaveLength(mudancasDeEstado);
    expect(daCena).toHaveLength(cenas.length);
    expect(daCena).toHaveLength(lines.length);
    for (const e of added) {
      const t = Date.parse(e.timestamp);
      expect(t, e.timestamp).toBeGreaterThanOrEqual(startedAt - 1000);
      expect(t, e.timestamp).toBeLessThanOrEqual(finishedAt + 1000);
      expect(e.timestamp.slice(0, 10), "o horário é o de agora, não o da data fixa").not.toBe(DIA_FIXO);
      expect(e.initiative_id).toBe(FEAT);
    }
    // As cenas que mudam o estado passaram pelo CLI de estado do próprio demo.
    const epic2 = (cli(dir, "initiatives", "get", "--id", FEAT).out.initiative as { epic_status: Record<string, { items: Record<string, { status: string }> }> }).epic_status["epic-2"]!.items;
    expect(epic2["task-2.1"]!.status).toBe("done");
    expect(epic2["task-2.2"]!.status).toBe("in-progress");
    // Sem decisão simulada, a guarda continua acesa: a cena de decisão não roda.
    const second = tmp("jatai-demo-play-acesa-");
    await buildDemo({ out: second });
    const acesa = await playDemo({ out: second, roteiro, speed: 0, deixarGuardaAcesa: true, log: () => undefined });
    expect(acesa.lines.some((l: string) => l.includes('"decision-made"'))).toBe(false);
    expect(acesa.lines.some((l: string) => l.includes('"decision-requested"'))).toBe(true);
  },
};

describe("Funcionalidade: Workspace demo fictício, gerado a partir do kit", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps, 60_000);
});
