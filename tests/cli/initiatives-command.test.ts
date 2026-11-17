import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runInitiativesCommand } from "../../src/cli/commands/initiatives";
import { parseInitiativesYaml } from "../../src/data/initiatives-contract.pure";
import { captureCliAsync, parseJsonLine } from "./process-capture";

/**
 * Characterization tests de `runInitiativesCommand` — comportamento ATUAL
 * (verbos create/switch-active/bump-phase/upsert-wave-item), chamando a
 * função TS diretamente (não via subprocess) para que o v8 coverage do
 * Vitest atribua as linhas certas — `tests/cli/helyx-state-subprocess.test.ts`
 * já cobre o mesmo fluxo via binário bundlado, mas isso roda num processo
 * `node` separado e não conta para a cobertura de `src/cli/**`.
 *
 * Behavior pinned on 2026-08-26. Modificar este teste requer revisar se a
 * mudança é intencional.
 */

let tmp: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

// `runInitiativesCommand` lê `process.cwd()` diretamente — o pool padrão do
// Vitest roda em worker threads, onde `process.chdir()` não é suportado
// (`ERR_WORKER_UNSUPPORTED_OPERATION`), então isolamos via mock de `cwd()`
// em vez de mudar o diretório de verdade.
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-initiatives-cmd-"));
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmp);
});

afterEach(() => {
  cwdSpy.mockRestore();
});

function initiativesYamlPath(): string {
  return path.join(tmp, ".github", "artifacts", "initiatives.yaml");
}

function readInitiativesYaml(): string {
  return fs.readFileSync(initiativesYamlPath(), "utf-8");
}

describe("runInitiativesCommand — create", () => {
  it("cria a iniciativa só com --id: exit 0, changed:true, arquivo gravado no path canônico", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-x"]));
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "feat-x", path: initiativesYamlPath() });
    expect(fs.existsSync(initiativesYamlPath())).toBe(true);
  });

  it("--id ausente: MISSING_FLAG, nada é gravado em disco", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--name", "Feature X"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "id" } });
    expect(fs.existsSync(initiativesYamlPath())).toBe(false);
  });

  it("--status fora do enum: INVALID_ENUM listando INITIATIVE_STATUSES", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-x", "--status", "bogus"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ENUM", field: "status", value: "bogus", allowed: ["planned", "in-progress", "done", "paused", "cancelled"] },
    });
  });

  it("--mode fora do enum: INVALID_ENUM listando INITIATIVE_MODES (checado só depois do --status passar)", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-x", "--mode", "bogus"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ENUM", field: "mode", value: "bogus", allowed: ["greenfield", "brownfield"] },
    });
  });

  it("--type fora do enum: INVALID_ENUM listando INITIATIVE_KINDS", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-x", "--type", "bogus"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ENUM", field: "type", value: "bogus", allowed: ["feature", "modernization", "hotfix", "foundation"] },
    });
  });

  it("--active seta active: no YAML pro id criado", async () => {
    const { exitCode } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-y", "--name", "Feature Y", "--active"]));
    expect(exitCode).toBe(0);
    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.active).toBe("feat-y");
  });

  it("rodar create duas vezes com os mesmos campos: changed:true na 1a, changed:false na 2a (idempotência)", async () => {
    const args = ["--id", "feat-x", "--name", "Feature X", "--status", "planned"];
    const first = await captureCliAsync(() => runInitiativesCommand("create", args));
    const second = await captureCliAsync(() => runInitiativesCommand("create", args));
    expect(parseJsonLine(first.stdout)).toMatchObject({ changed: true });
    expect(parseJsonLine(second.stdout)).toMatchObject({ changed: false });
  });
});

describe("runInitiativesCommand — switch-active", () => {
  it("--id ausente: MISSING_FLAG", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("switch-active", []));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "id" } });
  });

  // @known-bug: `switch-active` nunca valida se o `id` existe em
  // `initiatives:` — e, rodado num arquivo que ainda não tem NENHUMA
  // iniciativa criada, grava só `active: "..."` sem a chave `initiatives:`.
  // `parseInitiativesYaml` (o mesmo parser que o Cockpit usa) exige
  // `initiatives` como array pra devolver um `state` não-nulo — então esse
  // YAML "válido" na visão do writer é lido como `state: null` pela UI.
  // Pinado como está; não corrigido aqui (fora do escopo deste backfill).
  it("troca active: mesmo se a iniciativa não existir ainda — sem validar, e sem criar initiatives: (arquivo fica ilegível pro parser da UI)", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("switch-active", ["--id", "nao-existe"]));
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "nao-existe" });

    const raw = readInitiativesYaml();
    expect(raw).toContain('active: "nao-existe"');
    expect(raw).not.toContain("initiatives:");

    const { state } = parseInitiativesYaml(raw);
    expect(state).toBeNull(); // known-bug: UI não conseguiria ler este arquivo
  });
});

describe("runInitiativesCommand — bump-phase", () => {
  it("--id ausente: MISSING_FLAG 'id' (checado antes de --phase)", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("bump-phase", ["--phase", "product"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "id" } });
  });

  it("--phase ausente: MISSING_FLAG 'phase'", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("bump-phase", ["--id", "feat-x"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "phase" } });
  });

  it("iniciativa inexistente: INITIATIVE_NOT_FOUND, exit 1", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("bump-phase", ["--id", "nao-existe", "--phase", "product"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "INITIATIVE_NOT_FOUND", id: "nao-existe" } });
  });

  it("iniciativa existente: current_phase atualizado, exit 0", async () => {
    await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-x", "--current-phase", "business"]));
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("bump-phase", ["--id", "feat-x", "--phase", "product"]));
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "feat-x", phase: "product" });
    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.initiatives[0]).toMatchObject({ current_phase: "product" });
  });
});

describe("runInitiativesCommand — upsert-wave-item", () => {
  it("iniciativa inexistente: INITIATIVE_NOT_FOUND", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", ["--id", "nao-existe", "--wave", "wave-1", "--item", "item-1.1", "--status", "done"])
    );
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "INITIATIVE_NOT_FOUND", id: "nao-existe" } });
  });

  it("--id/--wave/--item/--status ausentes: MISSING_FLAG na primeira que faltar", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("upsert-wave-item", ["--id", "mod-x"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "wave" } });
  });

  it("caminho feliz com --artifact e --known-bug repetidos (multiple): grava tudo, exit 0", async () => {
    await captureCliAsync(() => runInitiativesCommand("create", ["--id", "mod-x", "--name", "Modernização X"]));
    const { exitCode, stdout } = await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", [
        "--id", "mod-x", "--wave", "wave-1", "--item", "item-1.1",
        "--status", "done", "--repo", "billing-api", "--commit", "4a2cf26",
        "--artifact", "docs/adr/0003.md", "--artifact", "code/README.md",
        "--known-bug", "BUG-001",
      ])
    );
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "mod-x", wave: "wave-1", item: "item-1.1", status: "done" });

    const { state } = parseInitiativesYaml(readInitiativesYaml());
    const item = state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"];
    expect(item).toMatchObject({ status: "done", repo: "billing-api", commit: "4a2cf26", artifacts: ["docs/adr/0003.md", "code/README.md"] });
  });

  it("--merge-block é preservado no upsert seguinte que só manda status", async () => {
    await captureCliAsync(() => runInitiativesCommand("create", ["--id", "mod-x", "--name", "Modernização X"]));
    await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", [
        "--id", "mod-x", "--wave", "wave-1", "--item", "item-1.1", "--status", "done", "--merge-block", "aguarda rollback",
      ])
    );
    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"]).toMatchObject({
      status: "done",
      merge_block: "aguarda rollback",
    });
  });

  it("--requires-approval marca o item como gate (raro); sem a flag, o campo nunca é escrito", async () => {
    await captureCliAsync(() => runInitiativesCommand("create", ["--id", "mod-x", "--name", "Modernização X"]));
    await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", ["--id", "mod-x", "--wave", "wave-1", "--item", "item-1.1", "--status", "in-progress"])
    );
    const withoutFlag = parseInitiativesYaml(readInitiativesYaml()).state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"];
    expect(withoutFlag).not.toHaveProperty("requires_approval");

    await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", [
        "--id", "mod-x", "--wave", "wave-1", "--item", "item-1.2", "--status", "done", "--requires-approval",
      ])
    );
    const withFlag = parseInitiativesYaml(readInitiativesYaml()).state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.2"];
    expect(withFlag).toMatchObject({ status: "done", requires_approval: true });
  });

  it("ADR-0006: --hierarchy epic-feature-backlog-task escreve em epic_status, não wave_status", async () => {
    await captureCliAsync(() => runInitiativesCommand("create", ["--id", "mod-x", "--name", "Modernização X"]));
    const { exitCode, stdout } = await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", [
        "--id", "mod-x", "--wave", "epic-1", "--item", "task-1.1", "--status", "done", "--hierarchy", "epic-feature-backlog-task",
      ])
    );
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "mod-x", wave: "epic-1", item: "task-1.1", status: "done" });

    const { state } = parseInitiativesYaml(readInitiativesYaml());
    const initiative = state!.initiatives[0]!;
    expect(initiative.epic_status?.["epic-1"]?.items?.["task-1.1"]).toMatchObject({ status: "done" });
    expect(initiative.wave_status).toBeUndefined();
  });

  it("ADR-0006: sem --hierarchy continua escrevendo em wave_status (default retrocompatível)", async () => {
    await captureCliAsync(() => runInitiativesCommand("create", ["--id", "mod-x", "--name", "Modernização X"]));
    await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", ["--id", "mod-x", "--wave", "wave-1", "--item", "item-1.1", "--status", "done"])
    );
    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"]).toMatchObject({ status: "done" });
    expect(state!.initiatives[0]!.epic_status).toBeUndefined();
  });

  it("--hierarchy com valor fora do enum: INVALID_ENUM (mesma validação de --status/--type)", async () => {
    await captureCliAsync(() => runInitiativesCommand("create", ["--id", "mod-x", "--name", "Modernização X"]));
    const { exitCode, stdout } = await captureCliAsync(() =>
      runInitiativesCommand("upsert-wave-item", [
        "--id", "mod-x", "--wave", "wave-1", "--item", "item-1.1", "--status", "done", "--hierarchy", "nonsense",
      ])
    );
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "INVALID_ENUM" } });
  });
});

describe("runInitiativesCommand — verbo desconhecido", () => {
  it("UNKNOWN_VERB, exit 1, mensagem lista os 4 verbos esperados", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("delete", []));
    expect(exitCode).toBe(1);
    const parsed = parseJsonLine(stdout) as { error: { message: string } };
    expect(parsed).toMatchObject({ ok: false, error: { code: "UNKNOWN_VERB", verb: "delete" } });
    expect(parsed.error.message).toContain("create, switch-active, bump-phase, upsert-wave-item");
  });
});
