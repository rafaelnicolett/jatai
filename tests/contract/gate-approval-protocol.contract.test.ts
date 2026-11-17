import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { StateCommands } from "../../src/state/application/StateCommands";
import { YamlStateRepository } from "../../src/state/repository/StateRepository";
import type { GateApprovalResult } from "../../src/shared/cockpit-protocol";
import { REPO_ROOT, unionTypeDiscriminants } from "./helpers/source-scan";
import { cleanupWorkspaces, makeTempDir } from "../characterization/helpers/workspace-fixture";

/**
 * Contrato da aprovação de gate pelo Cockpit (ADR-0024, decisões do titular).
 * O protocolo descreve o pedido e a resposta; o host roda o mesmo
 * `StateCommands.approveGate` do CLI e do State Service. Aqui se prova que o
 * envelope do caso de uso cabe em `GateApprovalResult`, nos três desfechos que
 * a UI da F4.2 precisa tratar: aprovado, pedido do nome e o que falta.
 */
const PROTOCOL = path.join(REPO_ROOT, "src/shared/cockpit-protocol.ts");
const INIT = ".github/artifacts/initiatives.yaml";

afterAll(() => cleanupWorkspaces());

function workspace(planningApproved: boolean): string {
  const root = makeTempDir("gate-approval-protocol");
  const gates = planningApproved ? "    roadmap_gate:\n      status: approved\n    risk_matrix_gate:\n      status: approved\n" : "";
  fs.mkdirSync(path.join(root, ".github/artifacts"), { recursive: true });
  fs.writeFileSync(path.join(root, INIT), `active: mod-x\ninitiatives:\n  - id: mod-x\n    name: mod-x\n    status: in-progress\n${gates}`, "utf-8");
  return root;
}

async function approve(root: string, approver: string | null): Promise<GateApprovalResult> {
  const commands = new StateCommands({ root, repository: new YamlStateRepository(), approverName: async () => approver });
  const result = await commands.approveGate({ gate: "d2", initiativeId: "mod-x", at: "2026-11-15T12:00:00.000Z" });
  if (result.ok) {
    const { gate, human_approved_at, by } = result.body as { gate: "d2"; human_approved_at: string; by: string };
    return { type: "gates/approve-result", ok: true, gate, human_approved_at, by };
  }
  const { code, message, field, open } = result.error as { code: string; message: string; field?: string; open?: Array<{ gate: string; status: string }> };
  return { type: "gates/approve-result", ok: false, error: { code, message, ...(field ? { field } : {}), ...(open ? { open } : {}) } };
}

describe("contrato — aprovação de gate pelo Cockpit (ADR-0024)", () => {
  // F4.2 (parte 2): o handler do host (`gates/approve`, tests/features/cockpit-aprovacao-no-host) e o `case`
  // do CockpitStore entraram, então o pedido e a resposta passam a fazer parte das uniões, como previsto aqui.
  it("o pedido e a resposta fazem parte das uniões do protocolo, com handler no host e case no store", () => {
    expect(unionTypeDiscriminants(PROTOCOL, "WebviewToHostMessage")).toContain("gates/approve");
    expect(unionTypeDiscriminants(PROTOCOL, "HostToWebviewMessage")).toContain("gates/approve-result");
  });

  it("aprovado: o envelope do StateCommands traz gate, human_approved_at e by", async () => {
    expect(await approve(workspace(true), "Pessoa Fictícia")).toEqual({
      type: "gates/approve-result",
      ok: true,
      gate: "d2",
      human_approved_at: "2026-11-15T12:00:00.000Z",
      by: "Pessoa Fictícia",
    });
  });

  it("sem quem aprova: MISSING_FLAG com field by, para o Cockpit perguntar o nome", async () => {
    const result = await approve(workspace(true), null);
    expect(result).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "by" } });
  });

  it("gate aberto: GATE_NOT_CLOSED com o que falta em open", async () => {
    const result = await approve(workspace(false), "Pessoa Fictícia");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "GATE_NOT_CLOSED", open: [{ gate: "roadmap_gate", status: "missing" }, { gate: "risk_matrix_gate", status: "missing" }] },
    });
  });
});
