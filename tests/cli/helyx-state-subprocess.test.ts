import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseInitiativesYaml } from "../../src/data/initiatives-contract.pure";

/**
 * Testa o `.cjs` BUNDLADO de verdade, via subprocess — não as funções TS
 * diretamente. É o único nível que pega o gotcha real de bundling: se
 * `commands/*.ts` importar (mesmo que transitivamente) algo de
 * `greenfieldPhaseActions.ts` sem passar pela extração pura em
 * `deliveryStatePaths.pure.ts`, o esbuild tenta resolver `"vscode"` — e ou
 * quebra aqui no build, ou o `require("vscode")` explode só quando um
 * agente de verdade rodar o binário no terminal. Testar as funções TS
 * in-process nunca pegaria isso.
 */

let cliPath: string;

beforeAll(() => {
  const root = path.resolve(__dirname, "../..");
  cliPath = path.join(os.tmpdir(), `helyx-state-test-${process.pid}.cjs`);
  execFileSync(
    "npx",
    ["esbuild", "src/cli/helyx-state.ts", "--bundle", `--outfile=${cliPath}`, "--format=cjs", "--platform=node", "--target=node18"],
    { cwd: root, stdio: "pipe" }
  );
}, 30_000);

function run(cwd: string, args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [cliPath, ...args], { cwd, encoding: "utf-8" });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

const tmpWorkspace = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-cli-subprocess-"));

describe("helyx-state.cjs — bundle roda standalone (sem vscode)", () => {
  it("não lança 'Cannot find module vscode' — o bundle é 100% autocontido", () => {
    const cwd = tmpWorkspace();
    const { status } = run(cwd, ["delivery-state", "upsert-phase", "--global", "--phase", "business", "--status", "done"]);
    expect(status).toBe(0);
  });
});

describe("helyx-state.cjs — contrato de saída", () => {
  it("sem artefato/verbo: exit 1 e JSON de erro de uso", () => {
    const { stdout, status } = run(tmpWorkspace(), []);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({ ok: false, error: { code: "USAGE" } });
  });

  it("artefato desconhecido: exit 1, código UNKNOWN_ARTIFACT", () => {
    const { stdout, status } = run(tmpWorkspace(), ["sprint-backlog", "create"]);
    expect(status).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { code: "UNKNOWN_ARTIFACT" } });
  });

  it("delivery-state upsert-phase com --status inválido: exit 1, INVALID_ENUM com a lista de valores aceitos", () => {
    const { stdout, status } = run(tmpWorkspace(), [
      "delivery-state", "upsert-phase", "--global", "--phase", "business", "--status", "bogus",
    ]);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("INVALID_ENUM");
    expect(parsed.error.allowed).toEqual(["pending", "in-progress", "blocked", "failed", "done", "skipped", "cancelled"]);
  });

  it("delivery-state upsert-phase válido: exit 0, changed: true, e o arquivo existe de verdade no disco", () => {
    const cwd = tmpWorkspace();
    const { stdout, status } = run(cwd, [
      "delivery-state", "upsert-phase", "--global", "--phase", "business", "--status", "done", "--agent", "@business",
    ]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({ ok: true, changed: true, phase: "business", status: "done" });
    expect(fs.existsSync(path.join(cwd, ".github/artifacts/delivery-state.yaml"))).toBe(true);
  });

  it("initiatives create seguido de upsert-wave-item — fluxo completo via CLI de verdade", () => {
    const cwd = tmpWorkspace();
    const created = run(cwd, ["initiatives", "create", "--id", "mod-x", "--name", "Modernização X", "--active"]);
    expect(created.status).toBe(0);

    const waveItem = run(cwd, [
      "initiatives", "upsert-wave-item",
      "--id", "mod-x", "--wave", "wave-1", "--item", "item-1.1",
      "--status", "done", "--repo", "billing-api", "--commit", "4a2cf26",
    ]);
    expect(waveItem.status).toBe(0);
    expect(JSON.parse(waveItem.stdout)).toMatchObject({ ok: true, changed: true });

    const yamlContent = fs.readFileSync(path.join(cwd, ".github/artifacts/initiatives.yaml"), "utf-8");
    const { state, errors } = parseInitiativesYaml(yamlContent);
    expect(errors).toEqual([]);
    expect(state!.initiatives[0]).toMatchObject({ id: "mod-x" });
    expect(state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"]).toMatchObject({
      status: "done",
      repo: "billing-api",
      commit: "4a2cf26",
    });
  });

  it("initiatives bump-phase pra id inexistente: exit 1, INITIATIVE_NOT_FOUND", () => {
    const { stdout, status } = run(tmpWorkspace(), ["initiatives", "bump-phase", "--id", "nao-existe", "--phase", "product"]);
    expect(status).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { code: "INITIATIVE_NOT_FOUND" } });
  });
});

describe("helyx-state.cjs — idempotência", () => {
  it("rodar o mesmo upsert-phase duas vezes: changed:true na primeira, changed:false na segunda", () => {
    const cwd = tmpWorkspace();
    const args = ["delivery-state", "upsert-phase", "--global", "--phase", "business", "--status", "done", "--agent", "@business"];

    const first = JSON.parse(run(cwd, args).stdout);
    const second = JSON.parse(run(cwd, args).stdout);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
  });
});
