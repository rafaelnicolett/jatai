import { describe, it, expect } from "vitest";
import { callerFromStack } from "../../src/core/extension-api/api-contract.pure";

/**
 * Contrato da identidade de quem chama a API (F2.5, ADR-0023 §2): a pilha do
 * Extension Host é a evidência, porque o VS Code não expõe "quem chamou".
 * Sem quadro de uma extensão (ou só com a própria Jataí), a resposta é `null`
 * e o registro é recusado — nunca se aceita o id declarado.
 */
const SELF = "/home/ana/.vscode/extensions/jatai.jatai-1.0.0";
const ACME = "/home/ana/.vscode/extensions/acme.companion-1.0.0";
const EXTENSIONS = [
  { id: "jatai.jatai", path: SELF },
  { id: "acme.companion", path: ACME },
];

const stack = (...frames: string[]): string => ["Error", ...frames.map((frame) => `    at ${frame}`)].join("\n");

describe("quem chamou a API da extensão", () => {
  it("acha a extensão companheira pela pasta no quadro da pilha, mesmo com file:// e URL codificada", () => {
    const raw = stack(
      "register (file:///home/ana/.vscode/extensions/acme.companion-1.0.0/out/extension.js:10:5)",
      "activate (file:///home/ana/.vscode/extensions/jatai.jatai-1.0.0/out/extension.js:1:1)"
    );
    expect(callerFromStack(raw, EXTENSIONS, SELF)).toBe("acme.companion");
  });

  it("ignora os quadros da própria Jataí e devolve null quando só ela aparece", () => {
    const raw = stack(
      "register (file:///home/ana/.vscode/extensions/jatai.jatai-1.0.0/out/extension.js:10:5)",
      "activate (file:///home/ana/.vscode/extensions/jatai.jatai-1.0.0/out/main.js:3:1)"
    );
    expect(callerFromStack(raw, EXTENSIONS, SELF)).toBeNull();
  });

  it("devolve null quando nenhuma pasta conhecida aparece (o editor não sabe quem chamou)", () => {
    expect(callerFromStack(stack("Object.<anonymous> (/tmp/script.js:1:2)"), EXTENSIONS, SELF)).toBeNull();
    expect(callerFromStack(undefined, EXTENSIONS, SELF)).toBeNull();
  });

  it("funciona com separador do Windows e escolhe a pasta mais específica", () => {
    const raw = stack("register (C:\\Users\\ana\\.vscode\\extensions\\acme.companion-1.0.0\\out\\extension.js:10:5)");
    expect(
      callerFromStack(raw, [{ id: "acme.companion", path: "C:\\Users\\ana\\.vscode\\extensions\\acme.companion-1.0.0" }], "C:\\jatai")
    ).toBe("acme.companion");
  });
});
