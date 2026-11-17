import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { brandReadValue, literalText } from "./helpers/source-scan";
import { BRAND } from "../../src/data/brand.pure";

/**
 * A varredura dos contratos lê uma leitura da marca (`BRAND.<caminho>`) como
 * o literal que ela produz (ADR-0013, F1.2). Sem isso, trocar
 * `"helyx.syncRepos"` por `` `${BRAND.commandPrefix}.syncRepos` `` sumiria
 * com o id dos contratos de comando, e o refactor pareceria uma mudança.
 */

function firstInitializer(code: string): ts.Expression {
  const sf = ts.createSourceFile("x.ts", code, ts.ScriptTarget.ES2022, true);
  const stmt = sf.statements[0];
  if (!stmt || !ts.isVariableStatement(stmt)) throw new Error("esperava `const x = …`");
  const init = stmt.declarationList.declarations[0]?.initializer;
  if (!init) throw new Error("sem inicializador");
  return init;
}

describe("source-scan — leitura da marca vale como literal", () => {
  it("BRAND.<caminho> sozinho", () => {
    expect(literalText(firstInitializer("const x = BRAND.files.config;"))).toBe(BRAND.files.config);
  });

  it("dentro de template, junto de texto", () => {
    expect(literalText(firstInitializer("const x = `${BRAND.commandPrefix}.syncRepos`;"))).toBe(`${BRAND.commandPrefix}.syncRepos`);
  });

  it("com .toUpperCase()", () => {
    expect(brandReadValue(firstInitializer("const x = BRAND.displayName.toUpperCase();"))).toBe(BRAND.displayName.toUpperCase());
  });

  it("expressão que não é leitura da marca continua <expr>", () => {
    expect(literalText(firstInitializer("const x = `${BRAND.commandPrefix}.${id}`;"))).toBe(`${BRAND.commandPrefix}.<expr>`);
    expect(literalText(firstInitializer("const x = `${OUTRO.nome}.a`;"))).toBe("<expr>.a");
  });

  it("caminho inexistente da marca não vira texto", () => {
    expect(literalText(firstInitializer("const x = BRAND.nada;"))).toBeNull();
    expect(literalText(firstInitializer("const x = BRAND;"))).toBeNull();
  });
});
