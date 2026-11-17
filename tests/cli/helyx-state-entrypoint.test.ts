import { describe, it, expect, afterEach, vi } from "vitest";
import { captureCliAsync, captureEntrypointRun, parseJsonLine } from "./process-capture";
import { BRAND } from "../../src/data/brand.pure";

/**
 * Characterization tests do dispatch de `helyx-state.ts` (entrypoint) — em
 * processo, para contar na cobertura de `src/cli/helyx-state.ts` (o teste
 * via subprocess em `helyx-state-subprocess.test.ts` já cobre o mesmo
 * comportamento observável rodando o `.cjs` bundlado de verdade, mas isso
 * roda fora do processo do Vitest e não é instrumentado).
 *
 * `main()` roda como efeito colateral do import (não é exportado) — cada
 * cenário precisa de `vi.resetModules()` + `import()` dinâmico com
 * `process.argv` já setado ANTES do import.
 *
 * Os dois comandos (`runInitiativesCommand`/`runDeliveryStateCommand`) são
 * mockados nos testes de DISPATCH (não nos de USAGE/UNKNOWN_ARTIFACT, que
 * não chegam a despachar) — ver `process-capture.ts` para o motivo: sem
 * isso, o mock de `process.exit` (que precisa LANÇAR pra não matar o worker
 * do Vitest) sobe pelo `try { main(); } catch { printInternalError(err) }`
 * do próprio módulo e vira um segundo exit (INTERNAL), mascarando o exit
 * real do comando aninhado. Mockar os comandos evita qualquer `process.exit`
 * aninhado nesses testes — a lógica INTERNA de cada comando já é
 * caracterizada à parte em `initiatives-command.test.ts` e
 * `delivery-state-command.test.ts`.
 *
 * Behavior pinned on 2026-08-26.
 */

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.doUnmock("../../src/cli/commands/initiatives");
  vi.doUnmock("../../src/cli/commands/delivery-state");
  vi.resetModules();
});

async function runEntrypoint(args: string[]): ReturnType<typeof captureCliAsync> {
  process.argv = ["node", "helyx-state.ts", ...args];
  vi.resetModules();
  return captureCliAsync(() => import("../../src/cli/helyx-state"));
}

async function runEntrypointPassive(args: string[]): ReturnType<typeof captureEntrypointRun> {
  process.argv = ["node", "helyx-state.ts", ...args];
  vi.resetModules();
  return captureEntrypointRun(() => import("../../src/cli/helyx-state"));
}

describe("helyx-state.ts — USAGE / UNKNOWN_ARTIFACT (não chegam a despachar, sem mock)", () => {
  it("sem artefato nem verbo: USAGE, exit 1, lista os artefatos conhecidos, exatamente UM exit", async () => {
    const { exitCodes, stdout } = await runEntrypointPassive([]);
    expect(exitCodes).toEqual([1]);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "USAGE", artifacts: ["delivery-state", "initiatives", "gates", "runs"] },
    });
  });

  it("só o artefato, sem verbo: também USAGE (mesma checagem `!artifact || !verb`)", async () => {
    const { exitCodes, stdout } = await runEntrypointPassive(["initiatives"]);
    expect(exitCodes).toEqual([1]);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "USAGE" } });
  });

  it("artefato desconhecido: UNKNOWN_ARTIFACT, exit 1, ecoa o artefato recebido", async () => {
    const { exitCodes, stdout } = await runEntrypointPassive(["sprint-backlog", "create"]);
    expect(exitCodes).toEqual([1]);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_ARTIFACT", artifact: "sprint-backlog", artifacts: ["delivery-state", "initiatives", "gates", "runs"] },
    });
  });
});

describe("helyx-state.ts — dispatch (comandos mockados, sem process.exit aninhado)", () => {
  it("artefato 'initiatives': repassa (verbo, resto-do-argv) pra runInitiativesCommand, sem tocar em delivery-state", async () => {
    const initiativesMock = vi.fn();
    const deliveryMock = vi.fn();
    vi.doMock("../../src/cli/commands/initiatives", () => ({ runInitiativesCommand: initiativesMock }));
    vi.doMock("../../src/cli/commands/delivery-state", () => ({ runDeliveryStateCommand: deliveryMock }));

    await runEntrypoint(["initiatives", "switch-active", "--id", "feat-x"]);

    expect(initiativesMock).toHaveBeenCalledWith("switch-active", ["--id", "feat-x"]);
    expect(deliveryMock).not.toHaveBeenCalled();
  });

  it("artefato 'delivery-state': repassa pra runDeliveryStateCommand, sem tocar em initiatives", async () => {
    const initiativesMock = vi.fn();
    const deliveryMock = vi.fn();
    vi.doMock("../../src/cli/commands/initiatives", () => ({ runInitiativesCommand: initiativesMock }));
    vi.doMock("../../src/cli/commands/delivery-state", () => ({ runDeliveryStateCommand: deliveryMock }));

    await runEntrypoint(["delivery-state", "upsert-phase", "--global", "--phase", "business", "--status", "done"]);

    expect(deliveryMock).toHaveBeenCalledWith("upsert-phase", ["--global", "--phase", "business", "--status", "done"]);
    expect(initiativesMock).not.toHaveBeenCalled();
  });
});

describe("helyx-state.ts — rejeição assíncrona de um comando vira envelope (A15 / H-BUG-04)", () => {
  function parseArgsError(code: string, message: string): Error {
    return Object.assign(new TypeError(message), { code });
  }

  /** Como `runEntrypointPassive`, mas espera um macrotask: o `.catch` do comando roda depois do `import()`. */
  async function runEntrypointSettled(args: string[]): ReturnType<typeof captureEntrypointRun> {
    process.argv = ["node", "helyx-state.ts", ...args];
    vi.resetModules();
    return captureEntrypointRun(async () => {
      await import("../../src/cli/helyx-state");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("REGRESSÃO: erro ERR_PARSE_ARGS_* do parseArgs vira USAGE, exit 1, com artefato, verbo e motivo", async () => {
    vi.doMock("../../src/cli/commands/initiatives", () => ({
      runInitiativesCommand: vi.fn(async () => {
        throw parseArgsError("ERR_PARSE_ARGS_UNKNOWN_OPTION", "Unknown option '--bogus'");
      }),
    }));

    const { exitCodes, stdout } = await runEntrypointSettled(["initiatives", "bump-phase", "--bogus"]);

    expect(exitCodes).toEqual([1]);
    expect(parseJsonLine(stdout)).toEqual({
      ok: false,
      error: {
        code: "USAGE",
        message: "flag desconhecida para 'initiatives bump-phase'",
        artifact: "initiatives",
        verb: "bump-phase",
        reason: "ERR_PARSE_ARGS_UNKNOWN_OPTION",
        detail: "Unknown option '--bogus'",
      },
    });
  });

  it("REGRESSÃO: --help vira USAGE explicando que o CLI não tem ajuda (a saída é sempre JSON)", async () => {
    vi.doMock("../../src/cli/commands/delivery-state", () => ({
      runDeliveryStateCommand: vi.fn(async () => {
        throw parseArgsError("ERR_PARSE_ARGS_UNKNOWN_OPTION", "Unknown option '--help'");
      }),
    }));

    const { exitCodes, stdout } = await runEntrypointSettled(["delivery-state", "upsert-phase", "--help"]);

    expect(exitCodes).toEqual([1]);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "USAGE", message: expect.stringMatching(new RegExp(`^o ${BRAND.cliName} não tem --help`)), verb: "upsert-phase" },
    });
  });

  it("REGRESSÃO: qualquer outra rejeição assíncrona vira INTERNAL, exit 2 (não stack trace)", async () => {
    vi.doMock("../../src/cli/commands/initiatives", () => ({
      runInitiativesCommand: vi.fn(async () => {
        throw new Error("EACCES: permissão negada (sintético)");
      }),
    }));

    const { exitCodes, stdout } = await runEntrypointSettled(["initiatives", "create", "--id", "x"]);

    expect(exitCodes).toEqual([2]);
    expect(parseJsonLine(stdout)).toEqual({ ok: false, error: { code: "INTERNAL", message: "EACCES: permissão negada (sintético)" } });
  });
});

describe("helyx-state.ts — try/catch externo (printInternalError)", () => {
  it("exceção não tratada dentro de um comando (não via process.exit): vira INTERNAL, exit 2", async () => {
    vi.doMock("../../src/cli/commands/initiatives", () => ({
      runInitiativesCommand: vi.fn(() => {
        throw new Error("LOCK_TIMEOUT: não foi possível adquirir lock");
      }),
    }));

    const { exitCode, stdout } = await runEntrypoint(["initiatives", "bump-phase", "--id", "x", "--phase", "y"]);

    expect(exitCode).toBe(2);
    expect(parseJsonLine(stdout)).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "LOCK_TIMEOUT: não foi possível adquirir lock" },
    });
  });
});
