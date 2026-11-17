import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { WorkspaceStateReader } from "../src/chat/WorkspaceStateReader";
import { FOUNDATION_CONTRACTS } from "../src/data/foundation-contracts";

/**
 * O guia do chat diz se o Foundation está pronto lendo o relatório técnico e o contexto de negócio.
 * O contrato do Foundation e o kit gravam o contexto de negócio em `assessment/business/`, mas o leitor
 * só olhava `assessment/business-context.md`: num workspace com a Descoberta concluída, o guia afirmava
 * "Foundation não iniciado". Achado pelo workspace demo (frente D, onda 5b).
 */

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function workspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "state-reader-"));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}

const ARTIFACTS = ".github/artifacts";
const businessContext = FOUNDATION_CONTRACTS.find((c) => c.phaseId === "business-context")!.out;

describe("WorkspaceStateReader: o Foundation está pronto quando o relatório e o contexto de negócio existem", () => {
  it("reconhece o contexto de negócio no caminho que o contrato do Foundation grava", () => {
    const root = workspace({
      [`${ARTIFACTS}/assessment/report.md`]: "# relatório\n",
      [`${ARTIFACTS}/${businessContext}`]: "# contexto\n",
    });

    expect(businessContext).toBe("assessment/business/business-context.md");
    expect(new WorkspaceStateReader(root).read().brownfieldAssessmentReady).toBe(true);
  });

  it("continua reconhecendo o caminho antigo, na raiz de assessment/ (workspaces de antes)", () => {
    const root = workspace({
      [`${ARTIFACTS}/assessment/report.md`]: "# relatório\n",
      [`${ARTIFACTS}/assessment/business-context.md`]: "# contexto\n",
    });

    expect(new WorkspaceStateReader(root).read().brownfieldAssessmentReady).toBe(true);
  });

  it("não está pronto sem o contexto de negócio, nem sem o relatório", () => {
    expect(new WorkspaceStateReader(workspace({ [`${ARTIFACTS}/assessment/report.md`]: "# r\n" })).read().brownfieldAssessmentReady).toBe(false);
    expect(new WorkspaceStateReader(workspace({ [`${ARTIFACTS}/${businessContext}`]: "# c\n" })).read().brownfieldAssessmentReady).toBe(false);
  });
});
