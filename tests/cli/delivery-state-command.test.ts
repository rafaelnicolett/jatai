import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runDeliveryStateCommand } from "../../src/cli/commands/delivery-state";
import { parseDeliveryState } from "../../src/data/delivery-state-contract.pure";
import { captureCliAsync, parseJsonLine } from "./process-capture";

/**
 * Characterization tests de `runDeliveryStateCommand` — comportamento ATUAL
 * (verbos upsert-phase/upsert-checklist), chamando a função TS diretamente
 * (mesma razão de `initiatives-command.test.ts`: cobertura real de
 * `src/cli/**`, que o teste de subprocesso não atribui).
 *
 * Behavior pinned on 2026-08-26.
 */

let tmp: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-delivery-state-cmd-"));
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmp);
});

afterEach(() => {
  cwdSpy.mockRestore();
});

function globalYamlPath(): string {
  return path.join(tmp, ".github", "artifacts", "delivery-state.yaml");
}

function initiativeYamlPath(id: string): string {
  return path.join(tmp, ".github", "artifacts", "initiatives", id, "delivery-state.yaml");
}

describe("runDeliveryStateCommand — upsert-phase", () => {
  it("--global válido: exit 0, changed:true, arquivo gravado no path global", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-phase", ["--global", "--phase", "business", "--status", "done", "--agent", "@business"])
    );
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, phase: "business", status: "done", path: globalYamlPath() });
    const parsed = parseDeliveryState(fs.readFileSync(globalYamlPath(), "utf-8"));
    expect(parsed!.phases.business).toMatchObject({ status: "done", agent: "@business" });
  });

  it("sem --global e sem --initiative: MISSING_SCOPE (checado antes de --phase/--status)", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", ["--status", "done"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_SCOPE" } });
  });

  it("--initiative <id> (sem --global): grava no path da iniciativa, não no global", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-phase", ["--initiative", "mod-x", "--phase", "business", "--status", "in-progress"])
    );
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, path: initiativeYamlPath("mod-x") });
    expect(fs.existsSync(globalYamlPath())).toBe(false);
    expect(fs.existsSync(initiativeYamlPath("mod-x"))).toBe(true);
  });

  it("--phase ausente: MISSING_FLAG 'phase' (checado depois do scope resolver, antes do --status)", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", ["--global", "--status", "done"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "phase" } });
  });

  it("--status ausente: MISSING_FLAG 'status'", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", ["--global", "--phase", "business"]));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "status" } });
  });

  it("--status fora do enum: INVALID_ENUM com DELIVERY_PHASE_STATUSES", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-phase", ["--global", "--phase", "business", "--status", "bogus"])
    );
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ENUM", field: "status", value: "bogus", allowed: ["pending", "in-progress", "blocked", "failed", "done", "skipped", "cancelled"] },
    });
  });

  it("--completed-at e --artifact (multiple): os três upserts se aplicam em sequência sobre o mesmo conteúdo", async () => {
    await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-phase", [
        "--global", "--phase", "business", "--status", "done",
        "--completed-at", "2026-08-05T10:00:00Z",
        "--artifact", "docs/business-brief.md", "--artifact", "docs/kpis.md",
      ])
    );
    const parsed = parseDeliveryState(fs.readFileSync(globalYamlPath(), "utf-8"));
    expect(parsed!.phases.business).toMatchObject({ status: "done", completed_at: "2026-08-05T10:00:00Z" });
    expect(parsed!.phases.business!.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "docs/business-brief.md" }), expect.objectContaining({ path: "docs/kpis.md" })])
    );
  });

  // H-BUG-62: o --agent era ignorado quando a fase já existia (changed:false).
  it("REGRESSÃO: --agent numa fase que já existe troca o agent (changed:true), e repetir é idempotente (H-BUG-62)", async () => {
    await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", ["--global", "--phase", "business", "--status", "in-progress", "--agent", "@business"]));
    const args = ["--global", "--phase", "business", "--status", "in-progress", "--agent", "@analista"];
    const first = await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", args));
    expect(parseJsonLine(first.stdout)).toMatchObject({ ok: true, changed: true });
    expect(parseDeliveryState(fs.readFileSync(globalYamlPath(), "utf-8"))!.phases.business).toMatchObject({ status: "in-progress", agent: "@analista" });
    const second = await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", args));
    expect(parseJsonLine(second.stdout)).toMatchObject({ ok: true, changed: false });
  });

  it("rodar o mesmo upsert-phase duas vezes: changed:true na 1a, changed:false na 2a (idempotência)", async () => {
    const args = ["--global", "--phase", "business", "--status", "done", "--agent", "@business"];
    const first = await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", args));
    const second = await captureCliAsync(() => runDeliveryStateCommand("upsert-phase", args));
    expect(parseJsonLine(first.stdout)).toMatchObject({ changed: true });
    expect(parseJsonLine(second.stdout)).toMatchObject({ changed: false });
  });
});

describe("runDeliveryStateCommand — upsert-checklist", () => {
  it("caminho feliz com --section explícito: exit 0, item marcado", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-checklist", [
        "--global", "--phase", "business", "--item", "problem-section", "--checked", "true", "--section", "human_checklist",
      ])
    );
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, phase: "business", item: "problem-section", checked: true });
    const parsed = parseDeliveryState(fs.readFileSync(globalYamlPath(), "utf-8"));
    expect(parsed!.phases.business!.human_checklist).toMatchObject({ "problem-section": true });
  });

  it("--section omitido: usa 'human_checklist' como default", async () => {
    await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-checklist", ["--global", "--phase", "business", "--item", "kpi-defined", "--checked", "false"])
    );
    const parsed = parseDeliveryState(fs.readFileSync(globalYamlPath(), "utf-8"));
    expect(parsed!.phases.business!.human_checklist).toMatchObject({ "kpi-defined": false });
  });

  it("--checked com valor que não é 'true'/'false' (ex.: '1'): INVALID_BOOLEAN, exit 1", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-checklist", ["--global", "--phase", "business", "--item", "x", "--checked", "1"])
    );
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "INVALID_BOOLEAN", field: "checked", value: "1" } });
  });

  it("--checked ausente: MISSING_FLAG, não INVALID_BOOLEAN", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-checklist", ["--global", "--phase", "business", "--item", "x"])
    );
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "checked" } });
  });

  it("--item ausente: MISSING_FLAG 'item' (checado antes de --checked)", async () => {
    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-checklist", ["--global", "--phase", "business"])
    );
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "item" } });
  });
});

describe("runDeliveryStateCommand — verbo desconhecido", () => {
  it("UNKNOWN_VERB, exit 1, mensagem lista os 2 verbos esperados", async () => {
    const { exitCode, stdout } = await captureCliAsync(() => runDeliveryStateCommand("delete-phase", ["--global"]));
    expect(exitCode).toBe(1);
    const parsed = parseJsonLine(stdout) as { error: { message: string } };
    expect(parsed).toMatchObject({ ok: false, error: { code: "UNKNOWN_VERB", verb: "delete-phase" } });
    expect(parsed.error.message).toContain("upsert-phase, upsert-checklist");
  });
});
