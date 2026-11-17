import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
vi.mock("vscode", () => import("./characterization/helpers/fake-vscode"));
import * as fs from "fs";
import * as path from "path";
import { fake } from "./characterization/helpers/fake-vscode";
import { ArtifactValidationProvider } from "../src/codelens/ArtifactValidationProvider";
import { registerConciergeParticipant } from "../src/chat/ConciergeParticipant";
import { VsCodeWorkspaceRoot } from "../src/adapters/workspace/VsCodeWorkspaceRoot";
import { VsCodeLanguageModel } from "../src/adapters/lm/VsCodeLanguageModel";
import { VsCodeChatHost } from "../src/adapters/chat/VsCodeChatHost";
import { VsCodeNotifier } from "../src/adapters/notifier/VsCodeNotifier";
import type { DeliveryStateAccess } from "../src/views/actions/deliveryStateAccess";
import { cleanupWorkspaces, makeWorkspace } from "./characterization/helpers/workspace-fixture";

/**
 * F3.1 — "aliases resolvidos em todo reader": os leitores por regex que não
 * passam pelo `parseDeliveryState` (CodeLens de validação e o card do chat)
 * precisam achar o bloco da fase também quando o agente o gravou com o
 * próprio id (`sprint-planner`) em vez do canônico (`sprint-plan`).
 */

afterAll(() => cleanupWorkspaces());
beforeEach(() => fake.reset());

const DELIVERY_REL = ".github/artifacts/initiatives/loja-demo/delivery-state.yaml";

function access(deliveryPath: string | null): DeliveryStateAccess {
  return {
    toggleChecklistFromChat: async () => undefined,
    markPhaseDoneFromChat: async () => undefined,
    getActiveDeliveryStatePath: () => deliveryPath,
    readActiveDeliveryState: () => null,
  };
}

describe("CodeLens de validação — bloco da fase sob alias", () => {
  it("REGRESSÃO: sprint-backlog.yaml mostra 'VALIDADO' quando o checklist humano está no bloco sprint-planner (alias de sprint-plan)", () => {
    const root = makeWorkspace("alias-codelens", {
      [DELIVERY_REL]: "phases:\n  sprint-planner:\n    status: done\n    human_checklist:\n      backlog-exists: true\n",
      ".github/artifacts/sprint-backlog.yaml": "sprint: s1\n",
    });
    const provider = new ArtifactValidationProvider(access(path.join(root, DELIVERY_REL))); // sem raiz: nenhum SSE
    fake.setWorkspaceRoot(root);
    const docPath = path.join(root, ".github/artifacts/sprint-backlog.yaml");
    const lenses = provider.provideCodeLenses({ uri: { fsPath: docPath }, getText: () => fs.readFileSync(docPath, "utf-8") } as never);
    const titles = lenses.map((l) => (l.command as { title: string }).title);
    expect(titles.some((t) => t.includes("VALIDADO") && t.includes("sprint-backlog.yaml criado"))).toBe(true);
    provider.dispose();
  });
});

describe("card do chat — bloco da fase sob alias", () => {
  async function card(currentPhase: string, block: string): Promise<{ card: string; checklistPhases: string[] }> {
    const root = makeWorkspace("alias-chat-card", {
      ".github/artifacts/initiatives.yaml": `active: loja-demo\ninitiatives:\n- id: loja-demo\n  name: "Loja Demo"\n  stream: upstream\n  current_phase: ${currentPhase}\n`,
      [DELIVERY_REL]: `phases:\n  ${block}:\n    status: in-progress\n    human_checklist:\n      backlog-exists: true\n`,
    });
    fake.setWorkspaceRoot(root);
    fake.responders["lm.selectChatModels"] = () => [];
    registerConciergeParticipant(fake.createExtensionContext() as never, access(null), { workspaceRoot: new VsCodeWorkspaceRoot(), languageModel: new VsCodeLanguageModel(), chatHost: new VsCodeChatHost(), notifier: new VsCodeNotifier() });
    const handler = fake.chatParticipants[0]!.handler as (...args: unknown[]) => Promise<unknown>;
    const markdown: string[] = [];
    const stream = { progress: () => undefined, markdown: (v: unknown) => markdown.push(String(v)), button: () => undefined, anchor: () => undefined };
    await handler({ prompt: "status", references: [], toolReferences: [] }, { history: [] }, stream, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
    return {
      card: markdown.find((m) => m.includes("### 🧭")) ?? "",
      checklistPhases: markdown.map((m) => m.match(/Checklist da fase `([^`]+)`/)?.[1]).filter((x): x is string => !!x),
    };
  }

  it("REGRESSÃO: current_phase canônico (sprint-plan) com o bloco no alias (sprint-planner) mostra 'em andamento' e o checklist lido do bloco", async () => {
    const out = await card("sprint-plan", "sprint-planner");
    expect(out.card).toContain("⏳ em andamento");
    expect(out.checklistPhases).toContain("sprint-plan");
  });

  it("REGRESSÃO: current_phase no alias (sprint-planner) mostra rótulo e agente da fase canônica e o checklist de sprint-plan", async () => {
    const out = await card("sprint-planner", "sprint-planner");
    expect(out.card).toContain("Sprint Plan");
    expect(out.card).toContain("`@sprint-planner`");
    expect(out.checklistPhases).toContain("sprint-plan");
  });
});
