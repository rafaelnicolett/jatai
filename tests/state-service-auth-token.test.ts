import { describe, it, expect } from "vitest";
import { generateStateServiceToken } from "../src/server/state-service-auth";

/**
 * `generateStateServiceToken` (item 2.5, roadmap `mod-state-service`) — gera
 * o token Bearer usado pelo State Service HTTP local. Cobre só a forma do
 * valor (entropia suficiente, hex válido) e que duas chamadas nunca colidem
 * — não há mais comportamento a caracterizar aqui (sem persistência, sem
 * expiração: ver comentário do módulo).
 */
describe("generateStateServiceToken", () => {
  it("gera uma string hexadecimal de 64 caracteres (256 bits de entropia)", () => {
    const token = generateStateServiceToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("duas chamadas sucessivas geram valores diferentes", () => {
    const a = generateStateServiceToken();
    const b = generateStateServiceToken();
    expect(a).not.toBe(b);
  });
});
