import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
vi.mock("vscode", () => import("./helpers/fake-vscode"));
import * as fs from "fs";
import * as path from "path";
import { fake } from "./helpers/fake-vscode";
import { approveAndAdvancePhase } from "../../src/views/actions/greenfieldPhaseActions";
import type { ActionContext } from "../../src/views/actions/CommandHandler";
import type { DeliveryStateAccess } from "../../src/views/actions/deliveryStateAccess";
import { registerConciergeParticipant } from "../../src/chat/ConciergeParticipant";
import { PhaseAgentLoader } from "../../src/chat/PhaseAgentLoader";
import { VsCodeWorkspaceRoot } from "../../src/adapters/workspace/VsCodeWorkspaceRoot";
import { VsCodeLanguageModel } from "../../src/adapters/lm/VsCodeLanguageModel";
import { VsCodeChatHost } from "../../src/adapters/chat/VsCodeChatHost";
import { VsCodeNotifier } from "../../src/adapters/notifier/VsCodeNotifier";
import { PHASE_CONTRACTS } from "../../src/data/phase-contracts";
import { parseDeliveryState, type DeliveryState } from "../../src/data/delivery-state-contract.pure";
import { PHASE_KEY_VARIANTS, findPhaseHeaderIdx } from "../../src/views/actions/yamlUpsert";
import { YamlStateRepository } from "../../src/cli/lib/StateRepository";
import { cleanupWorkspaces, makeNormalizer, makeWorkspace } from "./helpers/workspace-fixture";
import { goldenBrandSnapshotSerializer } from "../golden/lib/brand";
import { BRAND } from "../../src/data/brand.pure";

// Snapshots gravados com a Helyx: toda string entra na marca do golden antes de
// comparar, e só a marca pode ter mudado (F1.3, ADR-0012/0013).
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * Caracterização das 6 tabelas de fase ANTES do catálogo único (F3.1,
 * arquitetura-e-refatoracao.md §2.3 CH2 / §2.6 PC1: "snapshot das 6 tabelas
 * atuais + teste que documenta as divergências").
 *
 * As 6 tabelas (privadas aos módulos) são observadas pelo COMPORTAMENTO que
 * elas dirigem, nunca importadas — assim este arquivo sobrevive intacto ao
 * refactor que as troca por consultas, e é a prova de que o refactor não
 * mudou nada:
 *
 * | Tabela | Onde | Observada por |
 * |---|---|---|
 * | `PHASE_ORDER` + cabeçalho de `PHASE_CONTRACTS` | `data/phase-contracts.ts` | quem tem contrato (gate HITL, aprovação) |
 * | `PHASE_META` + `PHASE_ALIASES` | `chat/ConciergeParticipant.ts` | `advancePhase`, `startWithTemplate`, card ativo, gate HITL |
 * | `PHASE_NEXT`/`PHASE_LABEL`/`PHASE_AGENT_NAME` | `views/actions/greenfieldPhaseActions.ts` | `approveAndAdvancePhase` (YAML + handoff) |
 * | `AGENT_PATH_BY_PHASE` | `chat/PhaseAgentLoader.ts` | `PhaseAgentLoader.load` + prompt de handoff |
 * | `PHASE_KEY_ALIASES` | `data/delivery-state-contract.pure.ts` | `parseDeliveryState` |
 * | `PHASE_KEY_ALIASES` | `views/actions/yamlUpsert.ts` | `PHASE_KEY_VARIANTS`, `findPhaseHeaderIdx` |
 *
 * Behavior pinned on 2026-11-15. As divergências (L4/A4: `review` ×
 * `reviewer`, `sustain` ausente, rótulos/ícones/agentes diferentes entre o
 * chat e o handoff) aparecem nos snapshots de propósito: quem as corrige é o
 * commit de comportamento da F3.1, que atualiza este golden conscientemente.
 */

const startedAt = new Date();
afterAll(() => cleanupWorkspaces());
beforeEach(() => fake.reset());

/** Universo de ids: as 16 fases do contrato, o `review` do chat/handoff, os 4 aliases e um id desconhecido. */
const IDS = [
  "business", "product", "ux-design", "domain", "bdd", "architecture", "sprint-plan",
  "sprint-run", "backend", "frontend", "review", "reviewer",
  "devops", "release", "observability", "incident", "sustain",
  "sprint-planner", "domain-modeler", "ux-designer", "sprint-runner",
  "fase-inexistente",
] as const;

function mandatoryIds(phaseId: string): string[] {
  return (PHASE_CONTRACTS[phaseId]?.guardRailChecklist ?? []).filter((i) => i.mandatory).map((i) => i.id);
}

function checklistLines(phaseId: string): string {
  const ids = mandatoryIds(phaseId);
  return ids.length ? `    human_checklist:\n${ids.map((id) => `      ${id}: true`).join("\n")}\n` : "";
}

// `- id:` na coluna 0: é o único formato de lista que o leitor por regex do
// chat (`WorkspaceStateReader`) reconhece — com a lista indentada o chat não
// vê iniciativa nenhuma (achado registrado no relatório da F3.1).
const initiativesAt = (phase: string): string =>
  `active: loja-demo\ninitiatives:\n- id: loja-demo\n  name: "Loja Demo"\n  stream: upstream\n  current_phase: ${phase}\n`;

// ── greenfieldPhaseActions: PHASE_NEXT / PHASE_LABEL / PHASE_AGENT_NAME / AGENT_PATH_BY_PHASE ──

describe("catálogo de fases — aprovação greenfield (approveAndAdvancePhase)", () => {
  async function approve(phaseId: string, host: "copilot" | "claude"): Promise<unknown> {
    const deliveryRel = ".github/artifacts/initiatives/loja-demo/delivery-state.yaml";
    const root = makeWorkspace(`cat-approve-${phaseId}`, {
      ".github/artifacts/initiatives.yaml": initiativesAt(phaseId),
      [deliveryRel]: `initiative_id: loja-demo\nphases:\n  ${phaseId}:\n    status: done\n    agent: "@quem-fez"\n${checklistLines(phaseId)}`,
    });
    fake.setWorkspaceRoot(root);
    const ctx = {
      configLoader: { load: async () => ({ host_adapter: host }), hostAdapter: async () => host },
      promptMap: {},
      repository: new YamlStateRepository(),
      requestRefresh: async () => undefined,
      pushTelemetry: () => undefined,
    } as unknown as ActionContext;
    await approveAndAdvancePhase(phaseId, ctx);
    const normalize = makeNormalizer({ roots: [root], since: startedAt });
    const initiatives = fs.readFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), "utf-8");
    return normalize({
      vscode: fake.log.map((c) => ({ [c.api]: c.args })),
      deliveryState: fs.readFileSync(path.join(root, deliveryRel), "utf-8"),
      currentPhaseDepois: initiatives.match(/current_phase:\s*(\S+)/)?.[1],
    });
  }

  it.each(IDS)("copilot · aprova %s", async (phaseId) => {
    expect(await approve(phaseId, "copilot")).toMatchSnapshot();
  });

  it("claude · aprova frontend (o path do agente troca .github/ por .claude/)", async () => {
    expect(await approve("frontend", "claude")).toMatchSnapshot();
  });

  // Corrigido na F3.1 — L4 / A4: o pipeline do handoff usava `review` (sem
  // contrato) no lugar de `reviewer` e parava em `incident`. Aprovar
  // `reviewer` ou `incident` encerrava o pipeline; aprovar `review` falhava
  // com "Sem contrato definido".
  it("pipeline canônico: frontend → reviewer → devops, incident → sustain, sustain encerra; `review` legado aprova reviewer (L4 / A4)", async () => {
    const next = async (phaseId: string, block = phaseId, checklistOf = phaseId): Promise<{ next: string | undefined; info: string }> => {
      fake.reset();
      const deliveryRel = ".github/artifacts/initiatives/loja-demo/delivery-state.yaml";
      const root = makeWorkspace(`cat-l4-${phaseId}`, {
        ".github/artifacts/initiatives.yaml": initiativesAt(phaseId),
        [deliveryRel]: `initiative_id: loja-demo\nphases:\n  ${block}:\n    status: done\n${checklistLines(checklistOf)}`,
      });
      fake.setWorkspaceRoot(root);
      const ctx = {
        configLoader: { load: async () => ({ host_adapter: "copilot" }), hostAdapter: async () => "copilot" },
        promptMap: {},
        repository: new YamlStateRepository(),
        requestRefresh: async () => undefined,
        pushTelemetry: () => undefined,
      } as unknown as ActionContext;
      await approveAndAdvancePhase(phaseId, ctx);
      const initiatives = fs.readFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), "utf-8");
      return {
        next: initiatives.match(/current_phase:\s*(\S+)/)?.[1],
        info: String([...fake.calls("window.showInformationMessage"), ...fake.calls("window.showWarningMessage")][0]?.[0] ?? ""),
      };
    };
    expect(await next("frontend")).toMatchObject({ next: "reviewer" });
    expect(await next("reviewer")).toMatchObject({ next: "devops" });
    expect(await next("incident")).toMatchObject({ next: "sustain" });
    expect((await next("sustain")).info).toContain("fim do pipeline");
    expect(await next("review", "review", "reviewer")).toMatchObject({ next: "devops" });
  });

  // Corrigido na F3.1 — A3 / H-BUG-17: com o bloco no alias do agente, o
  // checklist lido era {} e a aprovação travava em "Não posso avançar".
  it("aprova sprint-plan com o bloco gravado sob o alias do agente (sprint-planner) — A3 / H-BUG-17", async () => {
    const deliveryRel = ".github/artifacts/initiatives/loja-demo/delivery-state.yaml";
    const root = makeWorkspace("cat-approve-alias", {
      ".github/artifacts/initiatives.yaml": initiativesAt("sprint-plan"),
      [deliveryRel]: `initiative_id: loja-demo\nphases:\n  sprint-planner:\n    status: done\n${checklistLines("sprint-plan")}`,
    });
    fake.setWorkspaceRoot(root);
    const ctx = {
      configLoader: { load: async () => ({ host_adapter: "copilot" }), hostAdapter: async () => "copilot" },
      promptMap: {},
      repository: new YamlStateRepository(),
      requestRefresh: async () => undefined,
      pushTelemetry: () => undefined,
    } as unknown as ActionContext;
    await approveAndAdvancePhase("sprint-plan", ctx);
    expect(fake.calls("window.showWarningMessage")).toEqual([]);
    expect(fake.calls("window.showInformationMessage")[0]![0]).toContain("Fase `sprint-plan` aprovada");
    const after = parseDeliveryState(fs.readFileSync(path.join(root, deliveryRel), "utf-8"))!;
    expect(after.phases["sprint-plan"]!.status).toBe("done");
    expect(after.phases["sprint-run"]!.status).toBe("in-progress");
  });
});

// ── ConciergeParticipant: PHASE_META / PHASE_ALIASES ──────────────────────────

function fakeDeliveryAccess(state: DeliveryState | null = null): DeliveryStateAccess & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    toggleChecklistFromChat: async (...args) => {
      calls.push(["toggleChecklistFromChat", ...args]);
    },
    markPhaseDoneFromChat: async (...args) => {
      calls.push(["markPhaseDoneFromChat", ...args]);
    },
    getActiveDeliveryStatePath: () => null,
    readActiveDeliveryState: () => state,
  };
}

function registerChat(access = fakeDeliveryAccess()): (...args: unknown[]) => Promise<unknown> {
  registerConciergeParticipant(fake.createExtensionContext() as never, access, { workspaceRoot: new VsCodeWorkspaceRoot(), languageModel: new VsCodeLanguageModel(), chatHost: new VsCodeChatHost(), notifier: new VsCodeNotifier() });
  return fake.chatParticipants[0]!.handler as (...args: unknown[]) => Promise<unknown>;
}

interface StreamEntry {
  kind: "progress" | "markdown" | "button" | "anchor";
  value: unknown;
}

async function chatTurn(root: string): Promise<{ entries: StreamEntry[]; result: unknown }> {
  fake.setWorkspaceRoot(root);
  const model = {
    id: "fake-model",
    sendRequest: async (): Promise<{ text: AsyncIterable<string> }> => ({
      text: (async function* () {
        yield "Resposta sintética.";
      })(),
    }),
  };
  fake.responders["lm.selectChatModels"] = () => [model];
  const handler = registerChat();
  const entries: StreamEntry[] = [];
  const stream = {
    progress: (v: unknown) => entries.push({ kind: "progress", value: v }),
    markdown: (v: unknown) => entries.push({ kind: "markdown", value: typeof v === "string" ? v : (v as { value: string }).value }),
    button: (v: unknown) => entries.push({ kind: "button", value: v }),
    anchor: (uri: unknown, title?: unknown) => entries.push({ kind: "anchor", value: { fsPath: (uri as { fsPath: string }).fsPath, title } }),
  };
  const request = { prompt: "status", references: [], toolReferences: [] };
  const result = await handler(request, { history: [] }, stream, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
  return { entries, result };
}

describe("catálogo de fases — chat (ConciergeParticipant)", () => {
  it.each(IDS)("advancePhase(%s) com todo mandatory ✓: rota para a próxima fase ou fim do mapa", async (phaseId) => {
    const all = Object.fromEntries(mandatoryIds(phaseId).map((id) => [id, true]));
    const access = fakeDeliveryAccess({ phases: { [phaseId]: { status: "done", human_checklist: all } } });
    registerChat(access);
    const before = fake.log.length;
    await fake.commands.get(`${BRAND.commandPrefix}.concierge.advancePhase`)!(phaseId);
    expect({
      vscode: fake.log.slice(before).map((c) => ({ [c.api]: c.args })),
      access: access.calls,
    }).toMatchSnapshot();
  });

  it("startWithTemplate: a query de cada fase (template próprio ou 'continuar com <agente>', para o agente orquestrador)", async () => {
    registerChat();
    const rows: Record<string, unknown> = {};
    for (const phaseId of IDS) {
      const before = fake.log.length;
      await fake.commands.get(`${BRAND.commandPrefix}.concierge.startWithTemplate`)!(phaseId);
      const query = (fake.log.slice(before)[0]!.args[1] as { query: string }).query;
      // ADR-0025: o template vai para o agente orquestrador, sem a menção `@<marca>` na frente.
      rows[phaseId] = query.startsWith("Quer") ? "(template próprio)" : query;
    }
    expect(rows).toMatchSnapshot();
  });

  it.each(IDS)("card da iniciativa ativa em %s: rótulo, ícone, agente, próximo, botões, âncoras e followups", async (phaseId) => {
    const root = makeWorkspace(`cat-card-${phaseId}`, {
      ".github/artifacts/initiatives.yaml": initiativesAt(phaseId),
      ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": `phases:\n  ${phaseId}:\n    status: in-progress\n`,
      // um arquivo para cada artefato (não-pasta) que algum card possa ancorar
      "business-brief.md": "# sintético\n",
      "prd.md": "# sintético\n",
      "feature-list.md": "# sintético\n",
      "api/openapi.yaml": "openapi: 3.0.0\n",
      "sprint-backlog.yaml": "sprint: s1\n",
    });
    const { entries, result } = await chatTurn(root);
    const normalize = makeNormalizer({ roots: [root], since: startedAt });
    expect(
      normalize({
        card: entries.find((e) => e.kind === "markdown" && String(e.value).includes("### 🧭"))?.value ?? null,
        buttons: entries
          .filter((e) => e.kind === "button")
          .map((e) => e.value as { command: string; title: string; arguments?: unknown[] })
          .filter((b) => b.command !== `${BRAND.commandPrefix}.concierge.toggleGuardRail`)
          .map((b) => `${b.command} · ${b.title}${b.arguments ? ` · ${JSON.stringify(b.arguments)}` : ""}`),
        anchors: entries.filter((e) => e.kind === "anchor").map((e) => e.value),
        checklists: entries
          .filter((e) => e.kind === "markdown")
          .map((e) => String(e.value).match(/Checklist da fase `([^`]+)`/)?.[1])
          .filter(Boolean),
        result,
      })
    ).toMatchSnapshot();
  });

  it.each(IDS)("gate HITL: %s done sem human-ok (ícone e rótulo do card de gate, ou nenhum gate)", async (phaseId) => {
    const root = makeWorkspace(`cat-gate-${phaseId}`, {
      ".github/artifacts/initiatives.yaml": initiativesAt("business"),
      ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": `phases:\n  ${phaseId}:\n    status: done\n`,
    });
    const { entries } = await chatTurn(root);
    const gate = entries.find((e) => e.kind === "markdown" && String(e.value).includes("Gate HITL"));
    expect(gate ? String(gate.value).split("\n").find((l) => l.includes("foi concluída pelo agente")) : "(sem gate)").toMatchSnapshot();
  });

  it("gate HITL: com várias fases pendentes, a escolhida segue a ordem do catálogo de fases (e o fallback, a ordem do arquivo)", async () => {
    const rows: Record<string, string> = {};
    for (const order of [["incident", "reviewer", "sustain"], ["sustain", "reviewer"], ["sprint-runner", "sprint-planner"], ["review", "devops"]]) {
      fake.reset();
      const root = makeWorkspace("cat-gate-ordem", {
        ".github/artifacts/initiatives.yaml": initiativesAt("business"),
        ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": `phases:\n${order.map((id) => `  ${id}:\n    status: done\n`).join("")}`,
      });
      const { entries } = await chatTurn(root);
      const gate = entries.find((e) => e.kind === "markdown" && String(e.value).includes("Gate HITL"));
      rows[order.join(" → ")] = gate ? String(gate.value).match(/`([^`]+)`\*\* \*\(/)?.[1] ?? "?" : "(sem gate)";
    }
    expect(rows).toMatchSnapshot();
  });
});

// ── PhaseAgentLoader: AGENT_PATH_BY_PHASE ─────────────────────────────────────

describe("catálogo de fases — arquivo do agente (PhaseAgentLoader)", () => {
  it("load(id) para cada id: qual arquivo `.github/agents/<pasta>/<nome>.agent.md` é lido (ou null)", () => {
    const names = [
      "business", "product", "ux-designer", "ux-design", "domain-modeler", "domain", "bdd", "architecture",
      "sprint-planner", "sprint-plan", "sprint-runner", "sprint-run", "backend", "backend-python-api",
      "frontend", "frontend-react", "reviewer", "review", "devops", "release", "observability", "incident", "sustain",
    ];
    const files: Record<string, string> = {};
    for (const folder of ["upstream", "downstream", "operation"]) {
      for (const name of names) files[`.github/agents/${folder}/${name}.agent.md`] = `---\nid: ${folder}/${name}\n---\n# persona sintética\n`;
    }
    const loader = new PhaseAgentLoader(makeWorkspace("cat-loader", files));
    expect(Object.fromEntries(IDS.map((id) => [id, loader.load(id)?.agentName ?? null]))).toMatchSnapshot();
  });
});

// ── aliases: delivery-state-contract.pure.ts e yamlUpsert.ts ──────────────────

describe("catálogo de fases — aliases de chave no delivery-state.yaml", () => {
  const yaml = `phases:\n${IDS.map((id) => `  ${id}:\n    status: in-progress\n    human_checklist:\n      lido-de-${id}: true\n`).join("")}`;

  it("PHASE_KEY_VARIANTS (writers): id canônico → chaves aceitas", () => {
    expect(PHASE_KEY_VARIANTS).toMatchSnapshot();
  });

  it("parseDeliveryState (reader): chave escrita → fase canônica, alias nunca sobrescreve canônica", () => {
    const onlyAliases = `phases:\n${["sprint-planner", "domain-modeler", "ux-designer", "sprint-runner", "review"].map((id) => `  ${id}:\n    status: done\n`).join("")}`;
    expect({
      todasAsChaves: Object.keys(parseDeliveryState(yaml)!.phases),
      soAliases: parseDeliveryState(onlyAliases)!.phases,
    }).toMatchSnapshot();
  });

  it("findPhaseHeaderIdx (writers): para cada id, qual cabeçalho é achado num arquivo só com aliases", () => {
    const lines = `phases:\n${["sprint-planner", "domain-modeler", "ux-designer", "sprint-runner", "review"].map((id) => `  ${id}:\n    status: done`).join("\n")}\n`.split("\n");
    expect(Object.fromEntries(IDS.map((id) => {
      const idx = findPhaseHeaderIdx(lines, 0, id);
      return [id, idx === -1 ? null : lines[idx]];
    }))).toMatchSnapshot();
  });

  it("readChecklistState (aprovação): num arquivo só com aliases, qual id acha qual checklist", () => {
    const onlyAliases = `phases:\n${["sprint-planner", "domain-modeler", "ux-designer", "sprint-runner", "review"].map((id) => `  ${id}:\n    status: done\n    human_checklist:\n      lido-de-${id}: true\n`).join("")}`;
    const root = makeWorkspace("cat-read-checklist", { "ds.yaml": onlyAliases });
    const repo = new YamlStateRepository();
    expect(Object.fromEntries(IDS.map((id) => [id, repo.readChecklistState(path.join(root, "ds.yaml"), id, "human_checklist")]))).toMatchSnapshot();
  });
});

// ── apresentação: chat e handoff mostram o que o contrato diz ────────────────

// Corrigido na F3.1 — L4 / A4 (apresentação): o chat e o prompt de handoff
// tinham rótulos, ícones e agentes próprios, diferentes do contrato canônico
// (o que o Cockpit mostra): "Sprint"/"Sprint Run" × "Sprint Runner",
// "Observabilidade" × "Observability", "Incident" × "Incidente",
// "@backend-*"/"@frontend-*" × "@backend"/"@frontend" e 6 ícones.
describe("catálogo de fases — apresentação igual ao contrato (L4 / A4)", () => {
  const CANONICAL_IDS = IDS.slice(0, 17).filter((id) => id !== "review");

  it("o card do chat mostra ícone, rótulo e agente do contrato em toda fase", async () => {
    const diverging: string[] = [];
    for (const phaseId of CANONICAL_IDS) {
      fake.reset();
      const contract = PHASE_CONTRACTS[phaseId]!;
      const root = makeWorkspace(`cat-ui-${phaseId}`, {
        ".github/artifacts/initiatives.yaml": initiativesAt(phaseId),
        ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": `phases:\n  ${phaseId}:\n    status: in-progress\n`,
      });
      const { entries } = await chatTurn(root);
      const card = String(entries.find((e) => e.kind === "markdown" && String(e.value).includes("### 🧭"))?.value ?? "");
      if (!card.includes(`| ${contract.icon} **Fase**     | \`${phaseId}\` — ${contract.label} |`)) diverging.push(`${phaseId}: fase`);
      if (!card.includes(`| 🤖 **Agente**   | \`${contract.agent}\` |`)) diverging.push(`${phaseId}: agente`);
    }
    expect(diverging).toEqual([]);
  });

  it("o prompt de handoff greenfield usa o rótulo e o agente do contrato da próxima fase", async () => {
    const diverging: string[] = [];
    for (const [i, phaseId] of CANONICAL_IDS.entries()) {
      const nextId = CANONICAL_IDS[i + 1];
      if (!nextId) continue;
      fake.reset();
      const root = makeWorkspace(`cat-ui-handoff-${phaseId}`, {
        ".github/artifacts/initiatives.yaml": initiativesAt(phaseId),
        ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": `initiative_id: loja-demo\nphases:\n  ${phaseId}:\n    status: done\n${checklistLines(phaseId)}`,
      });
      fake.setWorkspaceRoot(root);
      const ctx = {
        configLoader: { load: async () => ({ host_adapter: "copilot" }), hostAdapter: async () => "copilot" },
        promptMap: {},
        repository: new YamlStateRepository(),
        requestRefresh: async () => undefined,
        pushTelemetry: () => undefined,
      } as unknown as ActionContext;
      await approveAndAdvancePhase(phaseId, ctx);
      const query = (fake.calls("commands.executeCommand")[0]?.[1] as { query?: string } | undefined)?.query ?? "";
      const next = PHASE_CONTRACTS[nextId]!;
      if (!query.includes(`Você é o agente **${next.agent}** — execute a fase **${next.label}**`)) diverging.push(nextId);
    }
    expect(diverging).toEqual([]);
  });
});
