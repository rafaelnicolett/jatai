import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentCatalogReader, parseAgentFile } from "../src/views/cockpit/agentDirectory";
import { CockpitSnapshotBuilder, type CockpitDataSources } from "../src/views/cockpit/CockpitSnapshotBuilder";
import type { OnDataIssue } from "../src/data/data-health";

/**
 * O catálogo dos agentes instalados (F5.3): a responsabilidade vem do
 * frontmatter de `.claude/agents/**` e `.github/agents/**`, só dele (nunca do
 * corpo do agente), e entra no snapshot do Cockpit de forma aditiva.
 */

const dirs: string[] = [];
function workspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-catalog-"));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const agent = (id: string, description: string, body = "# corpo\nSegredo do corpo do agente."): string => `---\nid: ${id}\nname: ${id}\ndescription: "${description}"\nlayer: L2-phase\n---\n\n${body}\n`;

describe("parseAgentFile", () => {
  it("lê id e description do frontmatter e tira o prefixo de stream", () => {
    expect(parseAgentFile(agent("migration-agent", "Execution: migra versão de runtime ou framework."), "migration-agent.agent.md")).toEqual({
      id: "@migration-agent",
      role: "Migra versão de runtime ou framework.",
    });
  });

  it("sem id no frontmatter, vale o nome do arquivo; aceita description em bloco dobrado e quebra de linha do Windows", () => {
    const raw = "---\r\nname: x\r\ndescription: >\r\n  Planning: monta o roadmap\r\n  em épicos.\r\n---\r\ncorpo";
    expect(parseAgentFile(raw, "modernization-planner.agent.md")).toEqual({ id: "@modernization-planner", role: "Monta o roadmap em épicos." });
  });

  it("OpenCode: arquivo .md plano sem id usa o nome do arquivo", () => {
    const raw = '---\ndescription: "Execution: agente do OpenCode."\nmode: subagent\n---\ncorpo';
    expect(parseAgentFile(raw, "migration-agent.md")).toEqual({ id: "@migration-agent", role: "Agente do OpenCode." });
  });

  it("sem frontmatter, sem description ou com YAML inválido não há responsabilidade a mostrar", () => {
    expect(parseAgentFile("# só corpo", "a.agent.md")).toBeNull();
    expect(parseAgentFile("---\nid: a\n---\ncorpo", "a.agent.md")).toBeNull();
    expect(parseAgentFile("---\ndescription: [quebrado\n---\n", "a.agent.md")).toBeNull();
  });

  it("nunca devolve o corpo do agente (R8)", () => {
    const entry = parseAgentFile(agent("a", "Execution: faz algo."), "a.agent.md");
    expect(JSON.stringify(entry)).not.toContain("Segredo");
  });
});

describe("AgentCatalogReader", () => {
  it("lê os três layouts (OpenCode, Claude Code e Copilot); o mesmo id vale uma vez, na ordem OpenCode → Claude → Copilot", () => {
    const root = workspace({
      ".opencode/agents/migration-agent.md": '---\ndescription: "Execution: a do OpenCode."\nmode: subagent\n---\n\n# corpo\n',
      ".claude/agents/execution/migration-agent.agent.md": agent("migration-agent", "Execution: a do Claude."),
      ".github/agents/execution/migration-agent.agent.md": agent("migration-agent", "Execution: a do Copilot."),
      ".github/agents/planning/risk-prioritizer.agent.md": agent("risk-prioritizer", "Planning: ordena o roadmap pela matriz."),
      ".claude/agents/leia-me.md": "# não é agente",
    });
    const catalog = new AgentCatalogReader().read(root);
    expect(catalog.map((e) => e.id).sort()).toEqual(["@migration-agent", "@risk-prioritizer"]);
    expect(catalog.find((e) => e.id === "@migration-agent")?.role).toBe("A do OpenCode.");
  });

  it("sem pasta de agentes devolve vazio, sem lançar", () => {
    expect(new AgentCatalogReader().read(workspace({ "README.md": "x" }))).toEqual([]);
  });

  it("guarda o resultado e só relê quando um arquivo muda (mesma referência, depois outra)", () => {
    const root = workspace({ ".claude/agents/a.agent.md": agent("a", "Execution: primeira.") });
    const reader = new AgentCatalogReader();
    const first = reader.read(root);
    expect(reader.read(root)).toBe(first);
    const file = path.join(root, ".claude/agents/a.agent.md");
    fs.writeFileSync(file, agent("a", "Execution: segunda, que muda o tamanho."));
    const second = reader.read(root);
    expect(second).not.toBe(first);
    expect(second[0]?.role).toBe("Segunda, que muda o tamanho.");
  });

  it("um arquivo ilegível não derruba os outros", () => {
    const root = workspace({
      ".claude/agents/ok.agent.md": agent("ok", "Execution: funciona."),
      ".claude/agents/ruim.agent.md": "---\ndescription: [quebrado\n---\n",
    });
    expect(new AgentCatalogReader().read(root).map((e) => e.id)).toEqual(["@ok"]);
  });
});

describe("snapshot do Cockpit — o campo agents é aditivo", () => {
  function sources(over: Partial<CockpitDataSources> = {}): CockpitDataSources {
    const none = (_root: string, _onError: OnDataIssue): null => null;
    return {
      loadConfig: async () => null,
      isConfigured: async () => false,
      loadRepos: none,
      loadFoundationState: none,
      loadContextRepos: none,
      loadRepoGraph: none,
      loadRunEvents: () => [],
      readInitiatives: async () => null,
      readDeliveryState: async () => null,
      loadSprintBacklog: () => null,
      loadOperationsSnapshot: () => ({ devops: null, observability: null, incidents: null, sustain: null }),
      kitStatus: () => null,
      ...over,
    };
  }
  const settings = (): { approvalFrictionFields: string[]; deliveryHierarchy: "legacy"; notificationsLastSeenAt: null } => ({ approvalFrictionFields: [], deliveryHierarchy: "legacy", notificationsLastSeenAt: null });

  it("sem a fonte, ou sem agente instalado, o snapshot não ganha o campo (os snapshots de antes não mudam)", async () => {
    const semFonte = await new CockpitSnapshotBuilder(sources()).build("/ws", settings);
    expect("agents" in semFonte.snapshot).toBe(false);
    const vazia = await new CockpitSnapshotBuilder(sources({ loadAgentCatalog: () => [] })).build("/ws", settings);
    expect("agents" in vazia.snapshot).toBe(false);
  });

  it("com agente instalado, o snapshot leva as responsabilidades", async () => {
    const built = await new CockpitSnapshotBuilder(sources({ loadAgentCatalog: () => [{ id: "@migration-agent", role: "Migra." }] })).build("/ws", settings);
    expect(built.snapshot.agents).toEqual([{ id: "@migration-agent", role: "Migra." }]);
  });
});
