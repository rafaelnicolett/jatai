import { describe, it, expect, afterEach, vi } from "vitest";
import { BRAND, readBrandEnv, type Brand } from "../src/data/brand.pure";
import { resolveStateServiceRoot } from "../src/server/state-service-discovery";

/**
 * Expand da F1.3 (ADR-0013), superfície "variáveis de ambiente": o
 * `<PREFIXO>_WORKSPACE_ROOT` que o `.mcp.json` do usuário passa ao servidor
 * MCP é lido com o prefixo da marca e, na falta dele, com o de uma marca
 * anterior (`brand.json › legacy.envPrefixes`).
 */

/** Marca sintética com um legado, para provar a ordem sem depender da marca em uso. */
const NOVA: Brand = { ...BRAND, envPrefix: "NOVA_", legacy: { ...BRAND.legacy, envPrefixes: ["VELHA_", "ANTIGA_"] } };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readBrandEnv — prefixo da marca, depois os legados", () => {
  it("o prefixo da marca vence o legado", () => {
    expect(readBrandEnv({ NOVA_X: "nova", VELHA_X: "velha" }, "X", NOVA)).toBe("nova");
  });

  it("sem o da marca, vale o primeiro legado definido, na ordem da lista", () => {
    expect(readBrandEnv({ ANTIGA_X: "antiga", VELHA_X: "velha" }, "X", NOVA)).toBe("velha");
    expect(readBrandEnv({ ANTIGA_X: "antiga" }, "X", NOVA)).toBe("antiga");
  });

  it("nenhum definido: undefined", () => {
    expect(readBrandEnv({ OUTRA_X: "x" }, "X", NOVA)).toBeUndefined();
  });

  it("valor vazio conta como definido (o mesmo que `process.env.X ?? …` fazia)", () => {
    expect(readBrandEnv({ NOVA_X: "", VELHA_X: "velha" }, "X", NOVA)).toBe("");
  });
});

describe("resolveStateServiceRoot — raiz do workspace do MCP e do CLI", () => {
  it("lê <envPrefix>WORKSPACE_ROOT da marca em uso", () => {
    vi.stubEnv(`${BRAND.envPrefix}WORKSPACE_ROOT`, "/ws/marca");
    expect(resolveStateServiceRoot()).toBe("/ws/marca");
  });

  it.each(BRAND.legacy.envPrefixes.map((p) => [p]))("aceita o prefixo legado %s", (prefix) => {
    const current = `${BRAND.envPrefix}WORKSPACE_ROOT`;
    const saved = process.env[current];
    delete process.env[current];
    try {
      vi.stubEnv(`${prefix}WORKSPACE_ROOT`, "/ws/legado");
      expect(resolveStateServiceRoot()).toBe("/ws/legado");
    } finally {
      if (saved !== undefined) process.env[current] = saved;
    }
  });

  it("`root` explícito vence o ambiente", () => {
    vi.stubEnv(`${BRAND.envPrefix}WORKSPACE_ROOT`, "/ws/marca");
    expect(resolveStateServiceRoot({ root: "/explicito" })).toBe("/explicito");
  });
});
