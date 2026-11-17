import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, callsEndingWith, listSourceFiles, stringLiterals } from "./helpers/source-scan";
import { BRAND } from "../../src/data/brand.pure";

/**
 * Contrato das settings (`package.json › contributes.configuration`) — F2.1,
 * `mod-missao-open-source`.
 *
 * Uma setting declarada aparece na UI de Settings e o usuário confia que ela
 * faz alguma coisa. Se nada em `src/` a lê, mudar o valor não tem efeito
 * nenhum: foi o caso de `helyx.telemetryEnabled` (default `true`), enquanto o
 * `TelemetryBuffer` lia outra chave, `helyx.telemetry.enabled`, nunca
 * declarada (prontidao-open-source.md §2.3).
 *
 * "Lida" = um `.get("<sub-chave>")` em `src/` (AST, comentário não conta) ou
 * o id completo `helyx.<sub-chave>` como literal (ex.:
 * `affectsConfiguration("helyx.onlineMode")`).
 */

interface PackageJson {
  contributes: { configuration?: { properties: Record<string, unknown> } };
}

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as PackageJson;
const declared = Object.keys(pkg.contributes.configuration?.properties ?? {}).sort();
const hostFiles = listSourceFiles("src");

const getArgs = new Set(
  hostFiles.flatMap((f) => callsEndingWith(f, ".get").map((c) => c.value.args[0])).filter((a): a is string => typeof a === "string")
);
const literals = new Set(hostFiles.flatMap((f) => stringLiterals(f).map((l) => l.value)));

const SECTION = `${BRAND.configSection}.`;

function isRead(key: string): boolean {
  return getArgs.has(key.startsWith(SECTION) ? key.slice(SECTION.length) : key) || literals.has(key);
}

describe("contrato — settings declaradas × settings lidas", () => {
  it("toda setting declarada em contributes.configuration é lida por src/", () => {
    expect(declared.filter((k) => !isRead(k))).toEqual([]);
  });
});
