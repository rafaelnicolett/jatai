import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { createConciergeTurn, type ConciergeOutput } from "../../src/chat/ConciergeTurn";
import { continueWithOrchestrator } from "../../src/chat/conciergeCommands";
import { startFoundation } from "../../src/extension/startup/foundationResume";
import { FixedWorkspaceRoot } from "../../src/adapters/workspace/WorkspaceRoot";
import { ScriptedLanguageModel } from "../../src/adapters/lm/LanguageModel";
import { RecordingChatHost } from "../../src/adapters/chat/ChatHost";
import { RecordingNotifier } from "../../src/adapters/notifier/Notifier";
import { foundationPrompt } from "../../src/data/foundation-prompt";
import { BRAND } from "../../src/data/brand.pure";

/**
 * Step definitions de `guia-do-chat.feature` (F3.7, ADR-0025). O turno do
 * chat e os comandos recebem as portas (raiz do workspace, modelo, chat), então
 * os cenários rodam sem o VS Code e sem `vi.mock`: modelo roteirizado, chat
 * que só grava e um workspace temporário.
 */
const FEATURE = path.join(__dirname, "guia-do-chat.feature");
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

const INITIATIVE_BUSINESS = 'active: loja-demo\ninitiatives:\n- id: loja-demo\n  name: "Loja Demo"\n  status: in-progress\n  stream: upstream\n  current_phase: business\n';
const PERSONA = "---\nid: business\noutputs:\n  - .github/artifacts/initiatives/<id>/business-brief.md\nexit_contract:\n  - Problema e persona descritos\n---\n# @business (persona SINTÉTICA de teste)\nFaça uma pergunta por vez.\n";

/** Dado a iniciativa "loja-demo" ativa na fase "business" (com a persona do @business no kit Copilot). */
function workspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-guia-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content, "utf-8");
  }
  return root;
}
const lojaDemoEmBusiness = (): string =>
  workspace({
    ".github/artifacts/initiatives.yaml": INITIATIVE_BUSINESS,
    ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": "phases:\n  business:\n    status: in-progress\n",
    ".github/agents/upstream/business.agent.md": PERSONA,
  });

interface Entry {
  kind: "markdown" | "button" | "anchor" | "progress";
  value: unknown;
}

/** Quando o usuário fala com o guia: um turno com o modelo roteirizado. */
async function askGuide(root: string | undefined, prompt: string): Promise<{ entries: Entry[]; text: string; buttons: Array<{ command: string; title: string; arguments?: unknown[] }>; prompts: string[] }> {
  const entries: Entry[] = [];
  const out: ConciergeOutput = {
    markdown: (v) => void entries.push({ kind: "markdown", value: v }),
    button: (v) => void entries.push({ kind: "button", value: v }),
    anchor: (p, t) => void entries.push({ kind: "anchor", value: { p, t } }),
    progress: (v) => void entries.push({ kind: "progress", value: v }),
  };
  const lm = new ScriptedLanguageModel(["Resposta sintética do guia."]);
  const turn = createConciergeTurn({ workspaceRoot: new FixedWorkspaceRoot(root), languageModel: lm });
  await turn({ prompt }, out, { isCancellationRequested: false });
  const text = entries.filter((e) => e.kind === "markdown").map((e) => String(e.value)).join("");
  const buttons = entries.filter((e) => e.kind === "button").map((e) => e.value as { command: string; title: string; arguments?: unknown[] });
  return { entries, text, buttons, prompts: lm.prompts };
}

function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else out[path.relative(root, full)] = fs.readFileSync(full, "utf-8");
    }
  };
  walk(root);
  return out;
}

interface PackageJson {
  contributes: { chatParticipants: Array<{ id: string; name: string; fullName: string }> };
}
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8")) as PackageJson;

const CONTINUE_COMMAND = `${BRAND.commandPrefix}.concierge.continuePhase`;

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "O guia tem nome próprio, diferente do agente": () => {
    // Quando a extensão declara o participante de chat
    const [participant] = pkg.contributes.chatParticipants;
    // Então o usuário chama o guia por um nome que não é o do agente jatai
    expect(participant!.name).toBe(BRAND.guide.name);
    expect(participant!.name).not.toBe(BRAND.participant.name);
    expect(participant!.fullName).toBe(BRAND.guide.fullName);
  },

  "O guia mostra a fase atual e explica o próximo passo": async () => {
    const root = lojaDemoEmBusiness();
    const turn = await askGuide(root, "onde estou?");
    // Então o guia mostra a fase "business" com o agente "@business"
    expect(turn.text).toContain("`business`");
    expect(turn.text).toContain("`@business`");
    // E diz o que o agente entrega e o que falta para a fase ser aprovada
    expect(turn.text).toContain("Próximo passo");
    expect(turn.text).toContain("business-brief.md");
    expect(turn.text).toMatch(/Para a fase ser aprovada/);
    // E oferece continuar com o agente jatai
    expect(turn.buttons).toContainEqual(expect.objectContaining({ command: CONTINUE_COMMAND, arguments: ["@business"] }));
    expect(turn.buttons.find((b) => b.command === CONTINUE_COMMAND)!.title).toContain(`agente ${BRAND.participant.name}`);
  },

  "Continuar com o agente jatai leva o pedido ao agente, não ao guia": async () => {
    // Quando o usuário escolhe continuar com o agente jatai
    const chat = new RecordingChatHost();
    await continueWithOrchestrator(chat, "@business");
    // Então o chat abre no agente jatai com o pedido de continuar com "@business"
    expect(chat.opened).toEqual([]);
    expect(chat.agentRequests).toEqual([{ agent: BRAND.participant.name, query: "continuar com @business", partial: false }]);
  },

  "O guia não aciona agentes nem grava arquivos": async () => {
    const root = lojaDemoEmBusiness();
    const before = snapshotTree(root);
    // Quando o usuário pede ao guia que escreva o business brief
    const turn = await askGuide(root, "escreva o business brief");
    // Então nenhum arquivo do workspace muda
    expect(snapshotTree(root)).toEqual(before);
    // E o guia responde como guia, sem assumir a persona do agente da fase
    const prompt = turn.prompts[0]!;
    expect(prompt).toContain(BRAND.guide.fullName);
    expect(prompt).toMatch(/não aciona agentes/i);
    expect(prompt).not.toContain("PERSONA ATIVA");
    expect(prompt).not.toContain("WHITELIST DE ARQUIVOS");
    expect(prompt).not.toContain("Faça uma pergunta por vez.");
  },

  "Sem iniciativa, o guia explica que o trabalho começa no agente jatai": async () => {
    const root = workspace({});
    const turn = await askGuide(root, "onde estou?");
    // Então o guia explica que quem abre a iniciativa é o agente jatai
    expect(turn.text).toContain(`agente **${BRAND.participant.name}**`);
  },

  "O Foundation de um workspace novo começa no agente jatai": async () => {
    const chat = new RecordingChatHost();
    // Quando a extensão inicia o Foundation de um workspace Copilot
    await startFoundation("copilot", { chatHost: chat, notifier: new RecordingNotifier() });
    // Então o chat abre no agente jatai com o pedido do Foundation
    expect(chat.opened).toEqual([]);
    expect(chat.agentRequests).toEqual([{ agent: BRAND.participant.name, query: foundationPrompt("copilot"), partial: false, host: "copilot" }]);
  },
};

describe("Funcionalidade: Guia de chat que mostra onde a iniciativa está e encaminha para o agente jatai", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
