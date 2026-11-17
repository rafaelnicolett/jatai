import { describe, it, expect } from "vitest";
import { PROJECT_NAME_MAX, slugifyProjectName, validateProjectName } from "../src/core/validation/project-name";
import { WizardStateSchema } from "../src/types";

/**
 * A regra do nome do projeto (H-BUG-20, F4.3) é a do `WizardStateSchema`: o
 * Wizard valida em linha com a mesma regra que o host aplica no envio.
 */

const BASE = { hostAdapter: "copilot", backendStack: "python-api" } as const;

describe("validateProjectName", () => {
  it.each(["loja-demo", "a", "loja2", "-borda-", "x".repeat(PROJECT_NAME_MAX)])("aceita %s", (name) => {
    expect(validateProjectName(name)).toEqual({ ok: true, value: name });
  });

  it("vazio pede o nome, sem sugestão", () => {
    expect(validateProjectName("")).toEqual({ ok: false, reason: "Informe o nome do projeto.", suggestion: null });
  });

  it.each([
    ["Loja Demo", "loja-demo"],
    ["Meu App!", "meu-app"],
    ["ação", "acao"],
    ["  espaços  ", "espacos"],
    ["a__b", "a-b"],
  ])("recusa %j e sugere %j", (raw, suggestion) => {
    expect(validateProjectName(raw)).toEqual({ ok: false, reason: "O nome só aceita letras minúsculas, números e hífen.", suggestion });
  });

  it("sem nenhum caractere aproveitável, recusa e não sugere", () => {
    expect(validateProjectName("!!!")).toEqual({ ok: false, reason: "O nome só aceita letras minúsculas, números e hífen.", suggestion: null });
  });

  it("acima de 63 caracteres, recusa e sugere o nome cortado em 63, sem hífen na ponta", () => {
    const long = `${"a".repeat(62)}-bbb`;
    const check = validateProjectName(long);
    expect(check).toMatchObject({ ok: false, reason: `O nome tem no máximo ${PROJECT_NAME_MAX} caracteres.` });
    expect(check.ok ? "" : check.suggestion).toBe("a".repeat(62));
  });

  it("aceita exatamente o que o zod do host aceita (mesma regra nos dois lados)", () => {
    const samples = ["loja-demo", "Loja", "loja demo", "", "a", "x".repeat(63), "x".repeat(64), "ação", "a_b", "-x-", "123", "a.b", "A"];
    for (const name of samples) {
      const host = WizardStateSchema.safeParse({ ...BASE, projectName: name }).success;
      expect(validateProjectName(name).ok, JSON.stringify(name)).toBe(host);
    }
  });

  it("a sugestão sempre é um nome que o host aceita", () => {
    for (const raw of ["Loja Demo", "Meu App!", "ação", "Olá, Mundo", "A  B   C"]) {
      const check = validateProjectName(raw);
      if (check.ok || check.suggestion === null) continue;
      expect(WizardStateSchema.safeParse({ ...BASE, projectName: check.suggestion }).success, check.suggestion).toBe(true);
    }
  });
});

describe("slugifyProjectName", () => {
  it("tira acento, põe em minúsculas e troca sequências de símbolos por um hífen", () => {
    expect(slugifyProjectName("Ação & Reação 2")).toBe("acao-reacao-2");
  });
});
