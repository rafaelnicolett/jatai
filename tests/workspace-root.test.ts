import { describe, it, expect } from "vitest";
import { BRAND } from "../src/core/brand/brand.pure";
import { CLAUDE_PROJECT_DIR_ENV, claudeProjectDir, cliWorkspaceRoot } from "../src/state/workspace-root";
import { resolveStateServiceRoot } from "../src/server/state-service-discovery";

/**
 * Onde fica o workspace do CLI de estado e do servidor MCP fora do VS Code
 * (F5.2, alinhamento com os hooks do kit): o Claude Code informa a pasta do
 * projeto em `CLAUDE_PROJECT_DIR`, e os hooks chamam o CLI de qualquer
 * subpasta. O ambiente entra por parâmetro: nada aqui depende de quem roda a
 * suíte já ter (ou não) a variável definida.
 */
const BRAND_ROOT = `${BRAND.envPrefix}WORKSPACE_ROOT`;

describe("claudeProjectDir", () => {
  it("devolve a pasta do projeto quando a variável existe", () => {
    expect(CLAUDE_PROJECT_DIR_ENV).toBe("CLAUDE_PROJECT_DIR");
    expect(claudeProjectDir({ CLAUDE_PROJECT_DIR: "/projetos/loja" })).toBe("/projetos/loja");
  });

  it.each([[undefined], [""], ["   "]])("variável ausente, vazia ou só de espaços (%j) não conta", (value) => {
    expect(claudeProjectDir({ CLAUDE_PROJECT_DIR: value })).toBeUndefined();
    expect(claudeProjectDir({})).toBeUndefined();
  });
});

describe("cliWorkspaceRoot", () => {
  it("dentro do Claude Code, a pasta do projeto, mesmo chamado de uma subpasta", () => {
    expect(cliWorkspaceRoot({ CLAUDE_PROJECT_DIR: "/projetos/loja" }, "/projetos/loja/repos/app")).toBe("/projetos/loja");
  });

  it("fora do Claude Code, a pasta de onde o CLI foi chamado (o comportamento de sempre, pinado como BUG-32 no golden)", () => {
    expect(cliWorkspaceRoot({}, "/projetos/loja/repos/app")).toBe("/projetos/loja/repos/app");
  });
});

describe("resolveStateServiceRoot — a ordem completa", () => {
  const env = { [BRAND_ROOT]: "/da/marca", CLAUDE_PROJECT_DIR: "/do/claude" };

  it("root explícito > variável da marca > CLAUDE_PROJECT_DIR > process.cwd()", () => {
    expect(resolveStateServiceRoot({ root: "/explicito", env })).toBe("/explicito");
    expect(resolveStateServiceRoot({ env })).toBe("/da/marca");
    expect(resolveStateServiceRoot({ env: { CLAUDE_PROJECT_DIR: "/do/claude" } })).toBe("/do/claude");
    expect(resolveStateServiceRoot({ env: {} })).toBe(process.cwd());
  });

  it("CLAUDE_PROJECT_DIR vazia cai no process.cwd()", () => {
    expect(resolveStateServiceRoot({ env: { CLAUDE_PROJECT_DIR: "" } })).toBe(process.cwd());
  });
});
