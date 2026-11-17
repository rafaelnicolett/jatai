import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getActiveSyncContext } from "../src/views/actions/hostChat";

/**
 * `getActiveSyncContext` (hostChat.ts): id e nome da iniciativa ativa para os
 * eventos de telemetria das ações do Cockpit e do chat.
 */

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function workspace(initiatives: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-hostchat-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".github/artifacts"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), initiatives, "utf-8");
  return root;
}

describe("getActiveSyncContext", () => {
  it("lê o id e o nome da iniciativa ativa", () => {
    const root = workspace('active: loja\ninitiatives:\n  - id: loja\n    name: "Loja"\n');
    expect(getActiveSyncContext(root)).toEqual({ initiativeId: "loja", initiativeName: "Loja", projectSlug: "" });
  });

  // A busca do nome era uma regex `-\s*id:\s*["']?<id>["']?…name:` sem fim de
  // palavra no id: com `active: loja`, casava a entrada `loja-2` listada antes.
  it("REGRESSÃO: o nome vem da iniciativa com o id exato, não de outra cujo id começa igual (loja / loja-2)", () => {
    const root = workspace('active: loja\ninitiatives:\n  - id: loja-2\n    name: "Loja 2"\n  - id: loja\n    name: "Loja"\n');
    expect(getActiveSyncContext(root).initiativeName).toBe("Loja");
  });

  it("REGRESSÃO: id com aspas e entrada sem nome não herda o nome da vizinha", () => {
    const root = workspace('active: "loja"\ninitiatives:\n  - id: "loja"\n    status: planned\n  - id: loja-2\n    name: "Loja 2"\n');
    expect(getActiveSyncContext(root)).toMatchObject({ initiativeId: "loja", initiativeName: "" });
  });

  it("sem pasta: defaults seguros", () => {
    expect(getActiveSyncContext(undefined)).toEqual({ initiativeId: "default", initiativeName: "", projectSlug: "" });
  });
});
