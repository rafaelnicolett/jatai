import { describe, it, expect } from "vitest";
import {
  printSuccess,
  printUsageError,
  printInternalError,
  requireEnum,
  requireFlag,
  requireBooleanFlag,
} from "../../src/cli/lib/cli-io";
import { captureCli, parseJsonLine } from "./process-capture";

// Behavior pinned on 2026-08-26. Modifying this test requires reviewing if
// change is intentional (Contrato do CLI: sempre 1 linha JSON no stdout +
// exit code; ver docblock de src/cli/lib/cli-io.ts).

describe("printSuccess", () => {
  it("escreve {ok:true, ...payload} e sai com código 0", () => {
    const { exitCode, stdout } = captureCli(() => printSuccess({ path: "/tmp/x.yaml", changed: true, id: "feat-x" }));
    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toEqual({ ok: true, path: "/tmp/x.yaml", changed: true, id: "feat-x" });
  });

  it("escreve exatamente uma linha terminada em \\n (sem prosa antes/depois)", () => {
    const { stdout } = captureCli(() => printSuccess({ path: "/tmp/x.yaml", changed: false }));
    expect(stdout.match(/\n/g)).toHaveLength(1);
    expect(stdout.endsWith("\n")).toBe(true);
  });
});

describe("printUsageError", () => {
  it("escreve {ok:false, error:{code, message}} e sai com código 1", () => {
    const { exitCode, stdout } = captureCli(() => printUsageError("MISSING_FLAG", "flag obrigatória ausente: --id"));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toEqual({ ok: false, error: { code: "MISSING_FLAG", message: "flag obrigatória ausente: --id" } });
  });

  it("mescla o `extra` fornecido dentro de error, no mesmo nível de code/message", () => {
    const { stdout } = captureCli(() =>
      printUsageError("INVALID_ENUM", "valor inválido para --status: 'bogus'", {
        field: "status",
        value: "bogus",
        allowed: ["done", "pending"],
      })
    );
    expect(parseJsonLine(stdout)).toEqual({
      ok: false,
      error: { code: "INVALID_ENUM", message: "valor inválido para --status: 'bogus'", field: "status", value: "bogus", allowed: ["done", "pending"] },
    });
  });

  it("sem `extra`: error só tem code e message, sem chave a mais", () => {
    const { stdout } = captureCli(() => printUsageError("UNKNOWN_VERB", "verbo desconhecido"));
    const parsed = parseJsonLine(stdout) as { error: Record<string, unknown> };
    expect(Object.keys(parsed.error).sort()).toEqual(["code", "message"]);
  });
});

describe("printInternalError", () => {
  it("erro real (instance of Error): usa err.message, code INTERNAL, exit 2", () => {
    const { exitCode, stdout } = captureCli(() => printInternalError(new Error("ENOENT: falha ao ler arquivo")));
    expect(exitCode).toBe(2);
    expect(parseJsonLine(stdout)).toEqual({ ok: false, error: { code: "INTERNAL", message: "ENOENT: falha ao ler arquivo" } });
  });

  it("valor lançado que NÃO é Error (ex.: string): mensagem vira String(err) — não quebra", () => {
    const { exitCode, stdout } = captureCli(() => printInternalError("boom, não é um Error de verdade"));
    expect(exitCode).toBe(2);
    expect(parseJsonLine(stdout)).toEqual({ ok: false, error: { code: "INTERNAL", message: "boom, não é um Error de verdade" } });
  });
});

describe("requireEnum", () => {
  const ALLOWED = ["done", "in-progress", "pending", "skipped"] as const;

  it("valor undefined: MISSING_FLAG (nem chega a checar o enum)", () => {
    const { exitCode, stdout } = captureCli(() => requireEnum("status", undefined, ALLOWED));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "status" } });
  });

  it("valor fora do enum: INVALID_ENUM com a lista `allowed` completa", () => {
    const { exitCode, stdout } = captureCli(() => requireEnum("status", "bogus", ALLOWED));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ENUM", field: "status", value: "bogus", allowed: ["done", "in-progress", "pending", "skipped"] },
    });
  });

  it("valor válido: devolve o valor, sem chamar process.exit", () => {
    const { result, exitCode } = captureCli(() => requireEnum("status", "done", ALLOWED));
    expect(result).toBe("done");
    expect(exitCode).toBeUndefined();
  });
});

describe("requireFlag", () => {
  it("valor undefined: MISSING_FLAG", () => {
    const { exitCode, stdout } = captureCli(() => requireFlag("id", undefined));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "id" } });
  });

  // @known-bug: string vazia ("") é tratada como flag AUSENTE, não como valor
  // vazio válido — `--id ""` produz o mesmo MISSING_FLAG que omitir a flag
  // por completo. Pinado como está; não corrigido aqui.
  it("valor '' (string vazia): também MISSING_FLAG, igual a undefined", () => {
    const { exitCode, stdout } = captureCli(() => requireFlag("id", ""));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "id" } });
  });

  it("valor não vazio: devolve o próprio valor, sem exit", () => {
    const { result, exitCode } = captureCli(() => requireFlag("id", "feat-x"));
    expect(result).toBe("feat-x");
    expect(exitCode).toBeUndefined();
  });
});

describe("requireBooleanFlag", () => {
  it("'true' -> true, 'false' -> false, sem exit", () => {
    expect(captureCli(() => requireBooleanFlag("checked", "true")).result).toBe(true);
    expect(captureCli(() => requireBooleanFlag("checked", "false")).result).toBe(false);
  });

  it("valor ausente: MISSING_FLAG (via requireFlag) antes mesmo de checar 'true'/'false'", () => {
    const { exitCode, stdout } = captureCli(() => requireBooleanFlag("checked", undefined));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "checked" } });
  });

  // @known-bug: comparação é case-sensitive e não faz coerção — 'True'/'1'/
  // 'yes' etc. são todos rejeitados como INVALID_BOOLEAN, nunca aceitos como
  // truthy. Comportamento pinado, é intencional (docblock do arquivo diz
  // "nunca Boolean('false') === true"), mas 'True' com maiúscula cai no
  // mesmo balde de rejeição — vale checar se é essa a intenção.
  it("valor 'True' (maiúscula) ou qualquer coisa fora de 'true'/'false': INVALID_BOOLEAN", () => {
    const { exitCode, stdout } = captureCli(() => requireBooleanFlag("checked", "True"));
    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({
      ok: false,
      error: { code: "INVALID_BOOLEAN", field: "checked", value: "True" },
    });
  });
});
