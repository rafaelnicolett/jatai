import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
vi.mock("vscode", () => import("./helpers/fake-vscode"));
import * as fs from "fs";
import * as path from "path";
import { fake, ThemeIcon } from "./helpers/fake-vscode";
import { registerConciergeParticipant } from "../../src/chat/ConciergeParticipant";
import { VsCodeWorkspaceRoot } from "../../src/adapters/workspace/VsCodeWorkspaceRoot";
import { VsCodeLanguageModel } from "../../src/adapters/lm/VsCodeLanguageModel";
import { VsCodeChatHost } from "../../src/adapters/chat/VsCodeChatHost";
import { VsCodeNotifier } from "../../src/adapters/notifier/VsCodeNotifier";
import { PHASE_CONTRACTS } from "../../src/data/phase-contracts";
import type { DeliveryStateAccess } from "../../src/views/actions/deliveryStateAccess";
import type { DeliveryState } from "../../src/data/delivery-state-contract";
import { cleanupWorkspaces, makeNormalizer, makeTempDir, makeWorkspace, writeFiles } from "./helpers/workspace-fixture";
import { goldenBrandSnapshotSerializer } from "../golden/lib/brand";
import { BRAND } from "../../src/data/brand.pure";

// Snapshots gravados com a Helyx: toda string entra na marca do golden antes de
// comparar, e só a marca pode ter mudado (F1.3, ADR-0012/0013).
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * CH1 — caracterização do participante de chat `@helyx`
 * (`src/chat/ConciergeParticipant.ts`, 991 LOC, zero testes antes). F0.4
 * (lane B), arquitetura-e-refatoracao.md §2.3 passo CH1: "Golden da
 * transcrição do stream para fixtures (sem iniciativa; brownfield pronto e não
 * pronto; fase com HITL pendente; fase ativa com checklist; aliases
 * `sprint-planner`); pinar L1 e L3 como `@known-bug`".
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * Seams (nenhuma mudança de produção): o fake de `vscode` captura o handler
 * passado a `chat.createChatParticipant`; a API de LM é simulada AQUI —
 * `lm.selectChatModels` devolve um modelo cujo `sendRequest` grava as
 * mensagens e emite chunks fixos; um `ChatResponseStream` fake grava
 * progress/markdown/button/anchor na ordem. O `DeliveryStateAccess` é um fake
 * escrito à mão (a porta já existe). Workspaces sintéticos em tmp dir.
 *
 * O golden de cada fixture tem: a transcrição do stream, os seletores de LM
 * pedidos, a parte DINÂMICA do system prompt (persona + mapa de fases +
 * contexto do workspace + pedido) e o `ChatResult` (followups). As regras
 * HITL fixas do prompt (~70 linhas) têm um golden próprio, único — é o alvo
 * do passo CH5 (SystemPromptBuilder).
 */

const startedAt = new Date();
afterAll(() => cleanupWorkspaces());

// ── fakes ──────────────────────────────────────────────────────────────────

interface StreamEntry {
  kind: "progress" | "markdown" | "button" | "anchor";
  value: unknown;
}

function fakeStream(): { stream: Record<string, (...args: unknown[]) => void>; entries: StreamEntry[] } {
  const entries: StreamEntry[] = [];
  const stream = {
    progress: (v: unknown) => entries.push({ kind: "progress", value: v }),
    markdown: (v: unknown) => entries.push({ kind: "markdown", value: typeof v === "string" ? v : (v as { value: string }).value }),
    button: (v: unknown) => entries.push({ kind: "button", value: v }),
    anchor: (uri: unknown, title?: unknown) => entries.push({ kind: "anchor", value: { fsPath: (uri as { fsPath: string }).fsPath, title } }),
  };
  return { stream, entries };
}

interface LmBehavior {
  /** `null` = nenhum modelo para aquele seletor. */
  models: "gpt-4o" | "fallback" | "none";
  chunks?: string[];
  throws?: string;
  /** Efeito colateral no meio do stream (simula o agent mode do Copilot gravando arquivo). */
  duringStream?: () => void;
}

function installLm(behavior: LmBehavior): { prompts: string[] } {
  const prompts: string[] = [];
  const model = {
    id: "fake-model",
    sendRequest: async (messages: Array<{ content: string }>): Promise<{ text: AsyncIterable<string> }> => {
      prompts.push(...messages.map((m) => m.content));
      if (behavior.throws) throw new Error(behavior.throws);
      const chunks = behavior.chunks ?? ["Resposta sintética do modelo. ", "⏸ Fase pausada — aguardando validação humana no checklist abaixo."];
      return {
        text: (async function* () {
          for (const [i, c] of chunks.entries()) {
            if (i === 0) behavior.duringStream?.();
            yield c;
          }
        })(),
      };
    },
  };
  fake.responders["lm.selectChatModels"] = (selector: unknown) => {
    const s = selector as { family?: string };
    if (behavior.models === "gpt-4o" && s.family === "gpt-4o") return [model];
    if (behavior.models === "fallback" && !s.family) return [model];
    return [];
  };
  return { prompts };
}

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

function register(access = fakeDeliveryAccess()): { handler: (...args: unknown[]) => Promise<unknown>; access: typeof access } {
  const ctx = fake.createExtensionContext();
  registerConciergeParticipant(ctx as never, access, { workspaceRoot: new VsCodeWorkspaceRoot(), languageModel: new VsCodeLanguageModel(), chatHost: new VsCodeChatHost(), notifier: new VsCodeNotifier() });
  return { handler: fake.chatParticipants[0]!.handler as (...args: unknown[]) => Promise<unknown>, access };
}

const RULES_END = "- Português brasileiro.\n";

function renderTranscript(entries: StreamEntry[]): string {
  return entries
    .map((e) => {
      if (e.kind === "markdown") return `markdown:\n${String(e.value).split("\n").map((l) => `  │ ${l}`).join("\n")}`;
      if (e.kind === "button") {
        const b = e.value as { command: string; title: string; arguments?: unknown[] };
        return `button: ${b.command} · "${b.title}"${b.arguments ? ` · args=${JSON.stringify(b.arguments)}` : ""}`;
      }
      if (e.kind === "anchor") {
        const a = e.value as { fsPath: string; title: string };
        return `anchor: ${a.fsPath} · "${a.title}"`;
      }
      return `${e.kind}: ${String(e.value)}`;
    })
    .join("\n");
}

interface Turn {
  transcript: string;
  lmSelectors: unknown[];
  promptHead?: string;
  promptTail?: string;
  result: unknown;
  entries: StreamEntry[];
}

async function turn(root: string | undefined, opts: { prompt?: string; command?: string; lm?: LmBehavior } = {}): Promise<Turn> {
  fake.setWorkspaceRoot(root);
  const lm = installLm(opts.lm ?? { models: "gpt-4o" });
  const { handler } = register();
  const { stream, entries } = fakeStream();
  const request = { prompt: opts.prompt ?? "quero começar", command: opts.command, references: [], toolReferences: [] };
  const result = await handler(request, { history: [] }, stream, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
  const normalize = makeNormalizer({ roots: root ? [root] : [], since: startedAt });
  const prompt = lm.prompts[0];
  const cut = prompt ? prompt.indexOf(RULES_END) : -1;
  return {
    transcript: normalize.text(renderTranscript(entries)),
    lmSelectors: fake.calls("lm.selectChatModels").map((a) => a[0]),
    ...(prompt ? { promptHead: prompt.slice(0, cut + RULES_END.length), promptTail: normalize.text(prompt.slice(cut + RULES_END.length)) } : {}),
    result,
    entries,
  };
}

function golden(t: Turn): unknown {
  return { transcript: t.transcript, lmSelectors: t.lmSelectors, promptTail: t.promptTail ?? "(LM não foi chamado)", result: t.result };
}

// ── workspaces sintéticos ───────────────────────────────────────────────────

const INITIATIVE_BUSINESS = 'active: loja-demo\ninitiatives:\n- id: loja-demo\n  name: "Loja Demo"\n  status: in-progress\n  stream: upstream\n  type: feature\n  current_phase: business\n  owner: time-produto\n  priority: P1\n  created_at: "2025-03-01"\n';
const INITIATIVES_TWO = 'initiatives:\n- id: loja-demo\n  name: "Loja Demo"\n  stream: upstream\n  current_phase: business\n  priority: P0\n  created_at: "2025-03-01"\n- id: catalogo-hotfix\n  name: "Correção do Catálogo"\n  stream: operation\n  current_phase: incident\n  created_at: "2025-04-01"\n';

const PERSONA = `---
id: business
stream: upstream
outputs:
  - .github/artifacts/initiatives/<id>/business-brief.md
exit_contract:
  - Problema e persona descritos
guard_rails:
  - Não escrever PRD
---
# @business (persona SINTÉTICA de teste)
Faça uma pergunta por vez.
`;

const businessMandatory = PHASE_CONTRACTS.business!.guardRailChecklist.filter((i) => i.mandatory).map((i) => i.id);

const FIXTURES: Record<string, Record<string, string>> = {
  "workspace vazio": {},
  "brownfield não pronto (config em .github/ai-sdk.config.yaml)": {
    ".github/ai-sdk.config.yaml": "project:\n  name: legado-sintetico\n  mode: brownfield\nassessment:\n  maturity_frameworks: [dora-4keys, tech-radar]\n",
  },
  "brownfield pronto (report.md + business-context.md)": {
    ".github/ai-sdk.config.yaml": "project:\n  name: legado-sintetico\n  mode: brownfield\nassessment:\n  maturity_frameworks:\n    - dora-4keys\n",
    ".github/artifacts/assessment/report.md": "# relatório sintético\n",
    ".github/artifacts/assessment/business-context.md": "# contexto sintético\n",
  },
  "iniciativa ativa em business, checklist parcial, persona carregada": {
    ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS,
    ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": `initiative_id: loja-demo\nphases:\n  business:\n    status: in-progress\n    agent: "@business"\n    human_checklist:\n      ${businessMandatory[0]}: true\n`,
    ".github/artifacts/initiatives/loja-demo/business-brief.md": "# brief sintético\n",
    ".github/agents/upstream/business.agent.md": PERSONA,
  },
  "todos os mandatory ✓ em business, sem human-ok → botão 'Aprovar e avançar fase'": {
    ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS,
    ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": `phases:\n  business:\n    status: in-progress\n    human_checklist:\n${businessMandatory.map((id) => `      ${id}: true`).join("\n")}\n`,
  },
  "HITL pendente: business done sem human-ok (LM não é chamado)": {
    ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS,
    ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": "phases:\n  business:\n    status: done\n    human_checklist:\n      problem-section: true\n",
  },
  "alias: bloco sprint-planner done sem human-ok → gate de sprint-plan": {
    ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS.replace("current_phase: business", "current_phase: sprint-plan"),
    ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": "phases:\n  business:\n    status: done\n    human_checklist:\n      human-ok: true\n  sprint-planner:\n    status: done\n",
  },
  // Sem `active:`, a primeira iniciativa listada assume, como no Cockpit
  // (achado da F6.1; antes o chat mostrava o card de lista e pedia um `active:`).
  "várias iniciativas sem active: a primeira listada assume, como no Cockpit": {
    ".github/artifacts/initiatives.yaml": INITIATIVES_TWO,
  },
  "várias iniciativas com active de um id que não existe (card de lista + fallback pós-LLM)": {
    ".github/artifacts/initiatives.yaml": `active: nao-existe\n${INITIATIVES_TWO}`,
  },
};

beforeEach(() => fake.reset());

// ── testes ──────────────────────────────────────────────────────────────────

describe("CH1 — registro do participante (K2)", () => {
  it("cria o participante helyx.concierge com ícone 'rocket' e registra exatamente 6 comandos", () => {
    register();
    expect(fake.chatParticipants.map((p) => p.id)).toEqual([BRAND.participant.id]);
    expect(fake.chatParticipants[0]!.iconPath).toEqual(new ThemeIcon("rocket"));
    expect([...fake.commands.keys()]).toEqual([
      `${BRAND.commandPrefix}.concierge.continuePhase`,
      `${BRAND.commandPrefix}.concierge.toggleGuardRail`,
      `${BRAND.commandPrefix}.concierge.advancePhase`,
      `${BRAND.commandPrefix}.concierge.runRawPrompt`,
      `${BRAND.commandPrefix}.concierge.startWithTemplate`,
      `${BRAND.commandPrefix}.concierge.revealArtifact`,
    ]);
  });

  it("followupProvider devolve result.metadata.followups (ou [] sem metadata)", () => {
    register();
    const provider = fake.chatParticipants[0]!.followupProvider!;
    expect(provider.provideFollowups({ metadata: { followups: [{ prompt: "x", label: "y" }] } }, {}, {})).toEqual([{ prompt: "x", label: "y" }]);
    expect(provider.provideFollowups({}, {}, {})).toEqual([]);
  });
});

describe("CH1 — golden da transcrição por fixture (K3/K5/K6/K7)", () => {
  it("sem pasta aberta", async () => {
    expect(golden(await turn(undefined))).toMatchSnapshot();
  });

  it.each(Object.entries(FIXTURES))("%s", async (name, files) => {
    const root = makeWorkspace(`ch1-${name.slice(0, 20).replace(/\W+/g, "-")}`, files);
    expect(golden(await turn(root))).toMatchSnapshot();
  });

  it("as regras HITL fixas do system prompt são idênticas em toda fixture que chama o LM (golden único — alvo do CH5)", async () => {
    const heads = new Set<string>();
    for (const files of [{}, FIXTURES["iniciativa ativa em business, checklist parcial, persona carregada"]!]) {
      const t = await turn(makeWorkspace("ch1-head", files));
      heads.add(t.promptHead!);
      fake.reset();
    }
    expect(heads.size).toBe(1);
    expect([...heads][0]).toMatchSnapshot();
  });

  // ADR-0025 (F3.7): o chat é guia e não grava nada, então não relê o estado
  // depois do modelo. Antes, o turno relia o delivery-state e renderizava o
  // gate HITL no mesmo turno, supondo que o modelo (agent mode) tivesse gravado.
  it("o guia não relê o estado depois do modelo: uma escrita externa durante a resposta só aparece no turno seguinte (ADR-0025)", async () => {
    const root = makeWorkspace("ch1-post-llm", {
      ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS,
      ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": "phases:\n  business:\n    status: in-progress\n",
    });
    const t = await turn(root, {
      lm: {
        models: "gpt-4o",
        duringStream: () =>
          writeFiles(root, { ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": "phases:\n  business:\n    status: done\n" }),
      },
    });
    expect(golden(t)).toMatchSnapshot();
    expect(t.transcript).not.toContain("Gate HITL — Aprovação necessária");
  });

  // Behavior pinned on 2026-11-14 — H-BUG-24: o LM está fixo em
  // `vendor: "copilot"` (gpt-4o, depois qualquer copilot); sem Copilot, aviso.
  // H-BUG-24, corrigido na F3.7: sem modelo do Copilot o turno terminava num
  // aviso "Verifique o Copilot", como se o guia não funcionasse. O guia funciona
  // com o que é determinístico: card, próximo passo e o botão para o agente.
  it("REGRESSÃO: sem modelo de linguagem o guia responde com o determinístico, sem o aviso de Copilot (H-BUG-24)", async () => {
    const t = await turn(makeWorkspace("ch1-no-lm", FIXTURES["iniciativa ativa em business, checklist parcial, persona carregada"]!), { lm: { models: "none" } });
    expect(t.lmSelectors).toEqual([{ vendor: "copilot", family: "gpt-4o" }, { vendor: "copilot" }]);
    expect(t.transcript).not.toContain("Verifique o Copilot");
    expect(t.transcript).not.toContain("⚠️");
    expect(t.transcript).toContain("Próximo passo");
    expect(t.transcript).toContain("sem modelo de linguagem");
    expect(golden(t)).toMatchSnapshot();
  });

  it("sem gpt-4o cai no 2º seletor (qualquer modelo copilot) e segue normalmente", async () => {
    const t = await turn(makeWorkspace("ch1-fallback-lm"), { lm: { models: "fallback" } });
    expect(t.lmSelectors).toEqual([{ vendor: "copilot", family: "gpt-4o" }, { vendor: "copilot" }]);
    expect(t.promptTail).toBeDefined();
  });

  it("LM lançando no sendRequest → markdown '⚠️ Erro ao consultar o modelo: …' e o turno continua", async () => {
    const t = await turn(makeWorkspace("ch1-lm-throws"), { lm: { models: "gpt-4o", throws: "cota sintética excedida" } });
    expect(golden(t)).toMatchSnapshot();
  });

  // L3 / H-BUG-22, corrigido na F3.7: o leitor procurava o config em
  // `.github/ai-sdk.config.yaml`, mas o gerador grava na RAIZ (e o chat mostrava
  // o onboarding greenfield num workspace brownfield).
  it.each([
    ["config da marca", BRAND.files.config, 'version: "1"\nproject:\n  name: legado-sintetico\n  slug: legado-sintetico\n  mode: brownfield\nhost_adapter: claude\nassessment:\n  maturity_frameworks: [dora-4keys]\n'],
    ["config legado", BRAND.legacy.configFiles[0]!, 'version: "1"\nproject:\n  name: legado-sintetico\n  mode: brownfield\n'],
    ["config multi-repo do Foundation (sem project.mode)", BRAND.files.config, 'kit_version: "0.1.0"\nrepos:\n  app-a:\n    skills: []\n'],
  ])("REGRESSÃO: %s na raiz do workspace → o chat lê o modo brownfield e mostra o onboarding brownfield (L3 / H-BUG-22)", async (_caso, file, content) => {
    const root = makeWorkspace("ch1-l3", { [file]: content });
    const t = await turn(root);
    expect(t.transcript).toContain("modo **brownfield**");
    expect(t.transcript).not.toContain("Ainda não há iniciativa.");
    expect(t.promptTail).toContain("Project mode: **brownfield**");
  });

  it("REGRESSÃO: os maturity_frameworks do config na raiz aparecem no onboarding brownfield (L3 / H-BUG-22)", async () => {
    const root = makeWorkspace("ch1-l3-fw", { [BRAND.files.config]: "project:\n  name: legado\n  mode: brownfield\nassessment:\n  maturity_frameworks:\n    - dora-4keys\n    - tech-radar\n" });
    const t = await turn(root);
    expect(t.transcript).toContain("`dora-4keys`, `tech-radar`");
  });

  // C2 / H-BUG-02 no chat, corrigido na F6.1: `active: "id"` (como o writer
  // grava) é lido como YAML → o chat acha a iniciativa ativa, igual ao id sem aspas.
  it('REGRESSÃO: active entre aspas → o chat acha a iniciativa ativa, com a mesma transcrição e o mesmo prompt do id sem aspas (C2 / H-BUG-02)', async () => {
    const quoted = await turn(makeWorkspace("ch1-c2", { ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS.replace("active: loja-demo", 'active: "loja-demo"') }));
    fake.reset();
    const plain = await turn(makeWorkspace("ch1-c2-sem-aspas", { ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS }));
    expect(quoted.transcript).not.toContain("Nenhuma iniciativa marcada como `active`");
    expect(quoted.transcript).toBe(plain.transcript);
    expect(quoted.promptTail).toBe(plain.promptTail);
  });

  // L9, corrigido na F3.7: o loader só procurava persona em `.github/agents/…`;
  // num workspace Claude (`.claude/agents/…`) não achava nada. A persona
  // alimenta o "Próximo passo" do guia (ADR-0025).
  it("REGRESSÃO: persona só em .claude/agents é carregada — o próximo passo traz o que o agente entrega e o exit_contract (L9)", async () => {
    const files = { ...FIXTURES["iniciativa ativa em business, checklist parcial, persona carregada"]! };
    delete files[".github/agents/upstream/business.agent.md"];
    files[".claude/agents/upstream/business.agent.md"] = PERSONA;
    const t = await turn(makeWorkspace("ch1-l9", files));
    expect(t.transcript).toContain("Próximo passo");
    expect(t.transcript).toContain("Problema e persona descritos");
    expect(t.transcript).toContain("`.github/artifacts/initiatives/<id>/business-brief.md`");
  });

  // H-BUG-23, corrigido na F3.7: `request.command` nunca era lido, e
  // `/status`, `/nova` e `/continuar` caíam no fluxo genérico do modelo.
  // Agora as três respondem com o que é determinístico, sem chamar o modelo.
  it("REGRESSÃO: /status mostra o estado e o próximo passo, sem chamar o modelo (H-BUG-23)", async () => {
    const root = makeWorkspace("ch1-cmd-status", FIXTURES["iniciativa ativa em business, checklist parcial, persona carregada"]!);
    const t = await turn(root, { prompt: "", command: "status" });
    expect(t.lmSelectors).toEqual([]);
    expect(t.transcript).toContain("`loja-demo`");
    expect(t.transcript).toContain("Checklist da fase `business`");
    expect(t.transcript).toContain("Próximo passo");
    expect(t.transcript).not.toContain("Consultando o guia");
  });

  it("REGRESSÃO: /continuar mostra só o próximo passo e o botão para o agente, sem chamar o modelo (H-BUG-23)", async () => {
    const root = makeWorkspace("ch1-cmd-continuar", FIXTURES["iniciativa ativa em business, checklist parcial, persona carregada"]!);
    const t = await turn(root, { prompt: "", command: "continuar" });
    expect(t.lmSelectors).toEqual([]);
    expect(t.transcript).toContain("Próximo passo");
    expect(t.transcript).not.toContain("Checklist da fase");
    expect(t.entries.filter((e) => e.kind === "button").map((e) => (e.value as { command: string }).command)).toEqual([`${BRAND.commandPrefix}.concierge.continuePhase`]);
  });

  it("REGRESSÃO: /continuar com fase esperando aprovação mostra o gate HITL primeiro (H-BUG-23)", async () => {
    const root = makeWorkspace("ch1-cmd-continuar-gate", FIXTURES["HITL pendente: business done sem human-ok (LM não é chamado)"]!);
    const t = await turn(root, { prompt: "", command: "continuar" });
    expect(t.lmSelectors).toEqual([]);
    expect(t.transcript).toContain("Gate HITL — Aprovação necessária");
  });

  it("REGRESSÃO: /nova explica que o agente abre a iniciativa e oferece o botão para ele, sem chamar o modelo (H-BUG-23)", async () => {
    const t = await turn(makeWorkspace("ch1-cmd-nova"), { prompt: "", command: "nova" });
    expect(t.lmSelectors).toEqual([]);
    expect(t.transcript).toContain(`agente **${BRAND.participant.name}**`);
    const buttons = t.entries.filter((e) => e.kind === "button").map((e) => e.value as { command: string; arguments?: unknown[] });
    expect(buttons.map((b) => b.command)).toEqual([`${BRAND.commandPrefix}.concierge.runRawPrompt`]);
    expect(String(buttons[0]!.arguments![0])).toMatch(new RegExp(`^@${BRAND.participant.name} Quero iniciar uma nova iniciativa`));
  });

  // L1 / H-BUG-21, corrigido na F6.4 (efeito runtime; o lado estático está em
  // tests/contract/command-ids.contract.test.ts).
  it("REGRESSÃO: os botões de Cockpit renderizados nas fixtures apontam para helyx.openCockpitNext, o comando registrado (L1 / H-BUG-21)", async () => {
    const buttons = new Set<string>();
    for (const files of Object.values(FIXTURES)) {
      fake.reset();
      const t = await turn(makeWorkspace("ch1-l1", files));
      for (const e of t.entries) if (e.kind === "button") buttons.add((e.value as { command: string }).command);
    }
    expect([...buttons].sort()).toEqual([
      `${BRAND.commandPrefix}.concierge.advancePhase`,
      `${BRAND.commandPrefix}.concierge.continuePhase`,
      `${BRAND.commandPrefix}.concierge.runRawPrompt`,
      `${BRAND.commandPrefix}.concierge.startWithTemplate`,
      `${BRAND.commandPrefix}.concierge.toggleGuardRail`,
      `${BRAND.commandPrefix}.openCockpitNext`,
    ]);
    fake.reset();
    register();
    expect(fake.commands.has(`${BRAND.commandPrefix}.openCockpit`)).toBe(false);
    await expect(fake.commands.get(`${BRAND.commandPrefix}.concierge.runRawPrompt`)!("x")).resolves.toBeUndefined();
  });
});

describe("CH1 — comandos do participante (K2/K4)", () => {
  async function run(id: string, args: unknown[], access = fakeDeliveryAccess()): Promise<unknown> {
    const { access: a } = register(access);
    const before = fake.log.length;
    let error: string | undefined;
    try {
      await fake.commands.get(id)!(...args);
    } catch (err) {
      error = (err as Error).message;
    }
    return {
      call: `${id}(${args.map((x) => JSON.stringify(x)).join(", ")})`,
      vscode: fake.log.slice(before).filter((c) => c.api !== "commands.registerCommand").map((c) => ({ [c.api]: c.args })),
      access: a.calls,
      ...(error ? { error } : {}),
    };
  }

  it("continuePhase / runRawPrompt / startWithTemplate (template, sem template, fase desconhecida)", async () => {
    const rows = [];
    for (const [id, args] of [
      [`${BRAND.commandPrefix}.concierge.continuePhase`, ["@product"]],
      [`${BRAND.commandPrefix}.concierge.runRawPrompt`, [`@${BRAND.participant.name} prompt cru sintético`]],
      [`${BRAND.commandPrefix}.concierge.startWithTemplate`, ["architecture"]],
      [`${BRAND.commandPrefix}.concierge.startWithTemplate`, ["sprint-run"]],
      [`${BRAND.commandPrefix}.concierge.startWithTemplate`, ["fase-inexistente"]],
    ] as const) {
      fake.reset();
      rows.push(await run(id, [...args]));
    }
    expect(rows).toMatchSnapshot();
  });

  it("toggleGuardRail → porta DeliveryStateAccess + reabre o chat com '@helyx status'", async () => {
    expect(await run(`${BRAND.commandPrefix}.concierge.toggleGuardRail`, ["business", "kpi-defined", true])).toMatchSnapshot();
  });

  it("advancePhase: sem contrato / mandatory pendente (modal) / tudo ok → human-ok + done + roteia / última fase", async () => {
    const allBusiness = Object.fromEntries(businessMandatory.map((id) => [id, true]));
    // Desde a F3.1 (L4) a última fase do mapa é sustain (antes o chat parava em incident).
    const sustainMandatory = Object.fromEntries(PHASE_CONTRACTS.sustain!.guardRailChecklist.filter((i) => i.mandatory).map((i) => [i.id, true]));
    const ds = (phase: string, checklist: Record<string, boolean>): DeliveryState => ({ phases: { [phase]: { status: "done", human_checklist: checklist } } });
    const rows = [];
    for (const [phase, access] of [
      ["fase-inexistente", fakeDeliveryAccess()],
      ["business", fakeDeliveryAccess(ds("business", { [businessMandatory[0]!]: true }))],
      ["business", fakeDeliveryAccess(ds("business", allBusiness))],
      ["sustain", fakeDeliveryAccess(ds("sustain", sustainMandatory))],
    ] as const) {
      fake.reset();
      rows.push(await run(`${BRAND.commandPrefix}.concierge.advancePhase`, [phase], access));
    }
    expect(rows).toMatchSnapshot();
  });

  // Corrigido na F3.1 — L4 / A4: o catálogo do chat mandava `frontend` →
  // `review` (fase sem contrato); o canônico é `reviewer`.
  it("aprovar frontend roteia para a fase 'reviewer', a do contrato canônico (L4 / A4)", async () => {
    const all = Object.fromEntries(PHASE_CONTRACTS.frontend!.guardRailChecklist.filter((i) => i.mandatory).map((i) => [i.id, true]));
    const row = (await run(`${BRAND.commandPrefix}.concierge.advancePhase`, ["frontend"], fakeDeliveryAccess({ phases: { frontend: { status: "done", human_checklist: all } } }))) as {
      vscode: Array<Record<string, unknown[]>>;
    };
    const query = (row.vscode.find((c) => c["commands.executeCommand"])!["commands.executeCommand"]![1] as { query: string }).query;
    expect(query).toContain("próxima fase: reviewer)");
    expect(PHASE_CONTRACTS.review).toBeUndefined();
    expect(PHASE_CONTRACTS.reviewer).toBeDefined();
  });

  it("revealArtifact: pasta → revealFileInOS; arquivo → showTextDocument; inexistente/sem workspace → nada", async () => {
    const root = makeWorkspace("ch1-reveal", { "docs/a.md": "# a\n" });
    const normalize = makeNormalizer({ roots: [root], since: startedAt });
    const rows = [];
    for (const [rootFor, rel] of [
      [root, "docs"],
      [root, "docs/a.md"],
      [root, "docs/nao-existe.md"],
      [undefined, "docs/a.md"],
    ] as const) {
      fake.reset();
      fake.setWorkspaceRoot(rootFor);
      rows.push(await run(`${BRAND.commandPrefix}.concierge.revealArtifact`, [rel]));
    }
    expect(normalize(rows)).toMatchSnapshot();
  });

  // Corrigido na F6.2 (L12 / A16b): era `path.join(root, relPath)` sem
  // contenção, e `../` abria arquivo FORA do workspace. Agora `../`, caminho
  // absoluto e symlink que aponta para fora não abrem nada. (O "fora" aqui é
  // um arquivo do próprio tmp dir do teste.)
  it.each([
    ["'../' relativo", (_base: string) => "../fora.txt"],
    ["pasta '../'", (_base: string) => ".."],
    ["caminho absoluto", (base: string) => path.join(base, "fora.txt")],
    ["symlink para fora", (_base: string) => "atalho/segredo.txt"],
  ])("REGRESSÃO: revealArtifact não abre nada fora do workspace (%s, path traversal, L12 / A16b)", async (_caso, relPathFor) => {
    const base = makeTempDir("ch1-traversal");
    const root = path.join(base, "ws");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(base, "fora.txt"), "fora do workspace\n");
    fs.mkdirSync(path.join(base, "fora-dir"));
    fs.writeFileSync(path.join(base, "fora-dir", "segredo.txt"), "segredo sintético\n");
    // "junction" no Windows dispensa privilégio de admin; fora dele o tipo é ignorado
    fs.symlinkSync(path.join(base, "fora-dir"), path.join(root, "atalho"), "junction");
    fake.setWorkspaceRoot(root);
    const row = (await run(`${BRAND.commandPrefix}.concierge.revealArtifact`, [relPathFor(base)])) as { vscode: Array<Record<string, unknown[]>>; error?: string };
    expect(row.error).toBeUndefined();
    expect(row.vscode.filter((c) => c["window.showTextDocument"] || c["commands.executeCommand"])).toEqual([]);
  });
});
