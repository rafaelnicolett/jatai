import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Golden do CLI de estado — F0.4 lane A (contrato §7.1: "CLI `helyx-state
 * <artefato> <verbo> --flags`, JSON numa linha, exit 0/1/2").
 *
 * Roda o CLI como o agente roda: subprocesso `node <bundle> ...` com cwd na
 * raiz de um workspace sintético. Dois binários, com o MESMO golden:
 *
 * - `kit`: `kit/scripts/helyx-state.cjs`, o bundle que o gerador
 *   instala em `.github/scripts/` de todo workspace;
 * - `src`: build novo de `src/cli/helyx-state.ts` com as opções de
 *   `npm run build:cli`. Prova que o código-fonte atual se comporta igual ao
 *   bundle versionado (refactor do Epic 3 sem rebuild não passa despercebido).
 *
 * Sem rede: ambiente por allowlist (sem `HELYX_*`), HOME no sandbox e nenhum
 * `server.json`, então o cliente do State Service nem tenta conectar. O
 * `kb push` (Modo Online) saiu na F2.1. Ver `lib/cli-runner.ts`.
 *
 * Behavior pinned on 2026-11-14. Ver `tests/golden/README.md`.
 */

import { currentBrandNormalization } from "./lib/brand";
import { normalize, normalizeStderr, type NormalizeOptions } from "./lib/normalize";
import { GOLDEN_ROOT, kitCliBundlePath, packageVersion } from "./lib/paths";
import { cleanupSandboxes, makeSandbox, writeFixture } from "./lib/sandbox";
import { snapshotTree } from "./lib/tree";
import { buildCliFromSource, mapWithConcurrency, runCli } from "./lib/cli-runner";
import { CliGoldenGroup, UPDATE_GOLDEN, assertUpdateAllowed, encodeStdout, type CliScenarioRecord, type CliStepRecord } from "./lib/golden-store";
import { CLI_SCENARIOS, type CliScenario } from "./lib/cli-scenarios";

const group = new CliGoldenGroup(
  path.join(GOLDEN_ROOT, "cli"),
  CLI_SCENARIOS.map((s) => s.id)
);
const results: Record<"kit" | "src", Map<string, CliScenarioRecord>> = { kit: new Map(), src: new Map() };
let srcBundle = "";

function options(sandbox: string, cliPath: string): NormalizeOptions {
  return {
    eol: false, // o CLI tem que ser pinado byte a byte, inclusive \r
    roots: [
      { path: cliPath, placeholder: "<CLI>" },
      { path: sandbox, placeholder: "<SANDBOX>" },
    ],
    kitVersion: packageVersion(),
    brand: currentBrandNormalization(),
  };
}

async function runScenario(s: CliScenario, cliPath: string): Promise<CliScenarioRecord> {
  const sandbox = makeSandbox("cli");
  const home = path.join(sandbox, "home");
  fs.mkdirSync(path.join(sandbox, "ws"), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  if (s.fixture) writeFixture(sandbox, s.fixture);
  if (s.staleLock) {
    const lock = path.join(sandbox, ...s.staleLock.split("/"));
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, "99999");
    const old = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(lock, old, old);
  }
  const opts = options(sandbox, cliPath);
  const steps: CliStepRecord[] = [];
  for (const step of s.steps) {
    const cwd = step.cwd ?? "ws";
    const run = await runCli(cliPath, step.argv, path.join(sandbox, ...cwd.split("/")), home);
    steps.push({
      cwd,
      argv: step.argv,
      exit: run.exit,
      stdout: encodeStdout(normalize(run.stdout, opts)),
      stderr: normalizeStderr(run.stderr, opts),
    });
  }
  return { id: s.id, steps, snapshot: await snapshotTree(sandbox, { normalize: opts }) };
}

function rec(id: string): CliScenarioRecord {
  const r = results.kit.get(id);
  if (!r) throw new Error(`cenário não executado: ${id}`);
  return r;
}

function fileText(id: string, rel: string): string {
  const bytes = rec(id).snapshot.contents.get(rel);
  if (!bytes) throw new Error(`${id}: arquivo ausente: ${rel}`);
  return bytes.toString("utf-8");
}

function stdoutOf(id: string, step: number): Record<string, unknown> {
  return rec(id).steps[step]!.stdout as Record<string, unknown>;
}

beforeAll(async () => {
  assertUpdateAllowed();
  const binDir = makeSandbox("cli-bin");
  srcBundle = await buildCliFromSource(binDir);
  const kitBundle = kitCliBundlePath();
  if (!fs.existsSync(kitBundle)) throw new Error(`bundle do kit ausente: ${kitBundle} (rode npm run build:cli)`);
  const concurrency = Math.max(2, Math.min(8, os.cpus().length));
  for (const [variant, cli] of [["kit", kitBundle], ["src", srcBundle]] as const) {
    const recs = await mapWithConcurrency(CLI_SCENARIOS, concurrency, (s) => runScenario(s, cli));
    for (const r of recs) results[variant].set(r.id, r);
  }
}, 180_000);

afterAll(() => {
  if (UPDATE_GOLDEN) {
    for (const s of CLI_SCENARIOS) {
      const r = results.kit.get(s.id);
      if (r) group.record(r);
    }
    group.writeAll();
  }
  cleanupSandboxes();
});

describe("golden do CLI — bundle do kit (kit/scripts)", () => {
  for (const s of CLI_SCENARIOS) {
    const name = `${s.id} — ${s.title}`;
    it(s.knownBug ? `@known-bug: ${s.knownBug} — ${name}` : name, () => {
      if (UPDATE_GOLDEN) return;
      const differences = group.compare(rec(s.id));
      expect(differences, `\n${differences.length} diferença(s) em '${s.id}':\n${differences.slice(0, 30).join("\n")}`).toEqual([]);
    });
  }

  it.skipIf(UPDATE_GOLDEN)("cada cenário tem golden, não há cenário órfão e as cópias batem com os sha256", () => {
    expect(group.integrityProblems()).toEqual([]);
  });
});

describe("golden do CLI — build atual de src/cli", () => {
  it("o build de src/cli produz exatamente as mesmas saídas e árvores que o bundle do kit, em todos os cenários", () => {
    const diverging: string[] = [];
    for (const s of CLI_SCENARIOS) {
      const a = results.kit.get(s.id)!;
      const b = results.src.get(s.id)!;
      const ea = JSON.stringify({ steps: a.steps, tree: [...a.snapshot.entries.entries()] });
      const eb = JSON.stringify({ steps: b.steps, tree: [...b.snapshot.entries.entries()] });
      if (ea !== eb) diverging.push(s.id);
    }
    expect(diverging).toEqual([]);
  });

  it("o bundle versionado em kit/scripts é byte a byte o build atual (sem drift entre fonte e kit)", () => {
    const lf = (p: string): string => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
    expect(lf(srcBundle) === lf(kitCliBundlePath()), "rode `npm run build:cli` e versione o bundle junto da mudança em src/cli").toBe(true);
  });
});

describe("golden do CLI — defeitos conhecidos, um por um", () => {
  it("A15 / BUG-04 — erro do parseArgs vira USAGE no envelope JSON, exit 1, sem nada no stderr, nos 6 verbos (o kb push saiu na F2.1)", () => {
    const steps = rec("bug04-parseargs-sem-envelope").steps;
    expect(new Set(steps.map((s) => `${s.argv[0]} ${s.argv[1]}`)).size).toBe(6);
    for (const step of steps) {
      expect(step.exit, step.argv.join(" ")).toBe(1);
      expect(step.stdout, step.argv.join(" ")).toMatchObject({
        ok: false,
        error: { code: "USAGE", artifact: step.argv[0], verb: step.argv[1], reason: expect.stringMatching(/^ERR_PARSE_ARGS_[A-Z_]+$/) },
      });
      expect(step.stderr, step.argv.join(" ")).toBe("");
    }
    const help = steps.find((s) => s.argv.includes("--help"))!.stdout as { error: { message: string } };
    expect(help.error.message).toMatch(/não tem --help/);
  });

  // Corrigido na F3.1 (A2 / BUG-06): antes nascia um bloco-sombra 'sprint-planner' ao lado do canônico.
  it("BUG-06 — --phase sprint-planner (alias) atualiza o bloco canônico 'sprint-plan', sem bloco-sombra", () => {
    const content = fileText("ds-bug06-bloco-sombra-alias", "ws/.github/artifacts/delivery-state.yaml");
    expect(content).toMatch(/^ {2}sprint-plan:\n {4}status: done$/m);
    expect(content).not.toMatch(/^ {2}sprint-planner:/m);
    expect(stdoutOf("ds-bug06-bloco-sombra-alias", 0)).toMatchObject({ ok: true, changed: true });
  });

  // Corrigido na F3.1 (A9 / BUG-15): antes o valor era interpolado sem escape e o arquivo ficava inválido com ok:true.
  it("BUG-15 — --agent com aspas é escapado: ok:true e o delivery-state.yaml é YAML válido, com o agente intacto", () => {
    expect(stdoutOf("ds-bug15-agent-com-aspas", 0)).toMatchObject({ ok: true });
    const doc = yaml.load(fileText("ds-bug15-agent-com-aspas", "ws/.github/artifacts/delivery-state.yaml")) as { phases: Record<string, { agent: string }> };
    expect(doc.phases.qa!.agent).toBe('qa "lead"');
  });

  it("BUG-15 — --item com ': ' é escapado; --section status (chave duplicada) é recusado com erro, sem gravar", () => {
    expect(stdoutOf("ds-bug15-checklist-item-e-secao", 0)).toMatchObject({ ok: true });
    const doc = yaml.load(fileText("ds-bug15-checklist-item-e-secao", "ws/.github/artifacts/delivery-state.yaml")) as { phases: Record<string, { human_checklist: Record<string, boolean> }> };
    expect(doc.phases.qa!.human_checklist).toEqual({ "testes: ok": true });
    const step = rec("ds-bug15-checklist-item-e-secao").steps[1]!;
    expect(step.exit).toBe(2);
    expect(step.stdout).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(fileText("ds-bug15-checklist-item-e-secao", "ws/.github/artifacts/initiatives/gf-alfa/delivery-state.yaml")).toBe("phases:\n  qa:\n    status: in-progress\n");
  });

  // BUG-27, corrigido na F6.3: a fase indentada com 4 espaços não era achada, e
  // o bloco novo com 2 quebraria o arquivo (desde a guarda do A9, INTERNAL com
  // o arquivo intacto). Agora o writer edita na indentação do próprio arquivo.
  it("REGRESSÃO: BUG-27 — arquivo indentado com 4 espaços: a fase é achada e gravada na indentação do arquivo (ok:true)", () => {
    const step = rec("ds-bug27-indentacao-4-espacos").steps[0]!;
    expect(step.exit).toBe(0);
    expect(step.stdout).toMatchObject({ ok: true, changed: true, phase: "business", status: "done" });
    expect(fileText("ds-bug27-indentacao-4-espacos", "ws/.github/artifacts/delivery-state.yaml")).toBe("phases:\n    business:\n        status: done\n");
  });

  it("path traversal (A20) — id que vira caminho com '..', '/' ou '\\' é recusado com USAGE (exit 1) e nada é gravado", () => {
    const r = rec("ds-path-traversal-initiative");
    const fields = ["initiative", "initiative", "initiative", "id", "id"];
    expect(r.steps).toHaveLength(fields.length);
    r.steps.forEach((step, i) => {
      expect(step.exit, step.argv.join(" ")).toBe(1);
      expect(step.stdout, step.argv.join(" ")).toMatchObject({ ok: false, error: { code: "USAGE", field: fields[i] } });
      expect(step.stderr, step.argv.join(" ")).toBe("");
    });
    expect([...r.snapshot.entries.keys()]).toEqual(["home/", "ws/"]);
  });

  it("M2 — --phase com '(', '|', '[' ou ': ' dá USAGE (exit 1), não INTERNAL, e não regrava fase nenhuma", () => {
    const steps = rec("ds-regex-injecao-phase").steps;
    expect(steps).toHaveLength(4);
    for (const step of steps) {
      expect(step.exit, step.argv.join(" ")).toBe(1);
      expect(step.stdout, step.argv.join(" ")).toMatchObject({ ok: false, error: { code: "USAGE", field: "phase" } });
    }
    expect(fileText("ds-regex-injecao-phase", "ws/.github/artifacts/delivery-state.yaml")).toBe(
      "initiative_id: default\nphases:\n  business:\n    status: done\n  product:\n    status: in-progress\n"
    );
  });

  it("@known-bug: BUG-32 — rodando de repos/app-ficticio o CLI cria .github/artifacts ali, não na raiz do workspace", () => {
    const tree = rec("bug32-cwd-subdiretorio").snapshot.entries;
    expect(tree.has("ws/repos/app-ficticio/.github/artifacts/initiatives.yaml")).toBe(true);
    expect(tree.has("ws/.github/")).toBe(false);
  });

  it("@known-bug: switch-active grava active para id que não existe, com ok:true", () => {
    expect(stdoutOf("initiatives-switch-active-id-inexistente", 0)).toMatchObject({ ok: true, changed: true });
    expect(fileText("initiatives-switch-active-id-inexistente", "ws/.github/artifacts/initiatives.yaml")).toMatch(/^active: "?nao-existe"?/m);
  });

  // F2.1 (ADR-0015): o Modo Online e o `kb push` saíram da v1, e com eles o
  // path traversal de leitura do `--path ../` (A20, metade `kb push`).
  it("kb não é mais artefato: `kb push` responde UNKNOWN_ARTIFACT (exit 1) e não lê nada, nem com --path ../", () => {
    for (const i of [0, 1]) {
      expect(rec("kb-removido").steps[i]!.exit).toBe(1);
      expect(stdoutOf("kb-removido", i)).toMatchObject({ ok: false, error: { code: "UNKNOWN_ARTIFACT" } });
    }
  });

  it("lock órfão velho é removido e não sobra .lock nem arquivo temporário", () => {
    const paths = [...rec("ds-lock-orfao-velho").snapshot.entries.keys()];
    expect(rec("ds-lock-orfao-velho").steps[0]!.exit).toBe(0);
    expect(paths.filter((p) => p.endsWith(".lock") || p.includes(".tmp-"))).toEqual([]);
  });

  it("bump-phase sem initiatives.yaml devolve NOT_FOUND mas deixa a pasta .github/artifacts/ criada", () => {
    const r = rec("initiatives-bump-phase-sem-arquivo");
    expect(r.steps[0]!.stdout).toMatchObject({ ok: false, error: { code: "INITIATIVE_NOT_FOUND" } });
    expect(r.snapshot.entries.get("ws/.github/artifacts/")).toEqual({ type: "dir" });
    expect(r.snapshot.entries.has("ws/.github/artifacts/initiatives.yaml")).toBe(false);
  });
});
