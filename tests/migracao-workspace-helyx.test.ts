import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BRAND, renderBrandPlaceholders } from "../src/data/brand.pure";
import { CLAUDE_LAYOUT_DIR, WORKSPACE_MARKER_FILES, shouldEnsureClaudeCommand, shouldStartWorkspaceServices } from "../src/data/workspace-activation";
import { findConfigPath, getKitStatus, kitVersion, readKitVersion } from "../src/data/kit-version";
import { helyxCommandContent } from "../src/data/foundation-prompt";
import { loadInitiatives } from "../src/data/initiatives-contract";
import { loadDeliveryState } from "../src/data/delivery-state-contract";
import { loadFoundationState } from "../src/data/foundation-state-contract";
import { loadRepos } from "../src/data/repos-contract";
import { validateWorkspaceDir } from "../src/wizard/workspace-validation";
import { ConfigLoader } from "../src/adapters/config/ConfigLoader";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { legacyCliShim } from "../src/generator/legacy-cli-shim";
import { resolveStateServiceRoot } from "../src/server/state-service-discovery";

/**
 * Migração de ponta a ponta (F1.3, ADR-0013): um workspace Helyx que já
 * existe abre no Jataí sem perder nada.
 *
 * O workspace é sintético e tem o que um workspace Helyx Claude Code tem
 * depois do Foundation: `helyx.config.yaml` multi-repo (sem `host_adapter`),
 * o CLI `.github/scripts/helyx-state.cjs`, o orquestrador
 * `.claude/agents/helyx.agent.md`, o slash command `/helyx`, um agente de
 * domínio do cliente que chama o CLI antigo, o opt-out de `repos/` no
 * `.gitignore` e `.github/artifacts/**` com iniciativas, delivery-state,
 * repos e foundation-state.
 *
 * O que tem que valer, nesta ordem: ativa; lê o estado; o `migrateKit`
 * instala o kit Jataí; `.github/artifacts/**` fica byte a byte igual; e o que
 * o kit antigo chama (o CLI antigo, o `/helyx`, `HELYX_WORKSPACE_ROOT`)
 * continua funcionando.
 */

const HELYX = {
  config: "helyx.config.yaml",
  cli: "helyx-state.cjs",
  orchestrator: "helyx.agent.md",
  slash: "helyx.md",
  marker: "helyx:repos-versionado-por-decisao-explicita",
  env: "HELYX_WORKSPACE_ROOT",
};

const HELYX_CONFIG = [
  "# config gravado pelo Foundation do Helyx",
  'kit_version: "0.9.4"   # versão do Helyx que instalou esta estrutura',
  "repos:",
  "  pedidos-api:",
  "    skills:",
  "      - coding-guidelines-pedidos-api",
  "",
].join("\n");

const ARTIFACTS: Record<string, string> = {
  ".github/artifacts/initiatives.yaml": [
    "# iniciativas do workspace (comentário do time, não pode sumir)",
    "initiatives:",
    '  - id: "mod-pedidos"',
    '    name: "Modernizar pedidos"',
    '    status: "in-progress"',
    '    mode: "brownfield"',
    '    type: "modernization"',
    '    current_phase: "modernization-planner"',
    '  - id: "feat-cupom"',
    '    name: "Cupom de desconto"',
    '    status: "planned"',
    '    mode: "brownfield"',
    'active: "mod-pedidos"',
    "",
  ].join("\n"),
  ".github/artifacts/initiatives/mod-pedidos/delivery-state.yaml": "phases:\n  modernization-planner:\n    status: in-progress\n    artifacts:\n      - .github/artifacts/planning/roadmap.md\n",
  ".github/artifacts/repos.yaml": "repos:\n  - id: pedidos-api\n    source: git\n    url: git@exemplo.invalid:time/pedidos-api.git\n    pinned_sha: 0123456789abcdef0123456789abcdef01234567\n",
  ".github/artifacts/assessment/foundation-state.yaml": "phases:\n  tech-stack:\n    status: done\n  domain:\n    status: done\n",
  ".github/artifacts/assessment/repos/pedidos-api/debt/tech-debt.md": "# débito levantado no Discovery\n",
  ".github/artifacts/planning/roadmap.md": "# roadmap aprovado no gate D2\n",
  ".github/artifacts/runs/2026-11-01.jsonl": '{"type":"phase.started","phase_id":"tech-stack"}\n',
};

const DOMAIN_AGENT = [
  "# @pedidos — agente de domínio do cliente",
  "Para atualizar o estado, rode:",
  "node .github/scripts/helyx-state.cjs initiatives bump-phase --id <id> --phase <fase>",
  "",
].join("\n");

let root: string;
let home: string;
let artifactsBefore: Map<string, string>;

function write(rel: string, content: string, mode?: number): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mode !== undefined) fs.chmodSync(file, mode);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

/** sha256 de cada arquivo sob `dir` (relativo ao workspace), para comparar byte a byte. */
function hashTree(rel: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else out.set(child, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, child))).digest("hex"));
    }
  };
  walk(rel);
  return out;
}

/** Ambiente mínimo do subprocesso: nada de `<MARCA>_*` herdado do terminal, HOME num tmp. */
function cliEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HOME: home, USERPROFILE: home, ...extra };
  for (const key of ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "TMPDIR"]) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}

function runCli(rel: string, args: string[], cwd = root): { status: number | null; json: unknown; stderr: string } {
  const run = spawnSync(process.execPath, [path.join(root, rel), ...args], { cwd, env: cliEnv(), encoding: "utf-8" });
  const line = run.stdout.trim().split("\n").pop() ?? "";
  return { status: run.status, json: line ? (JSON.parse(line) as unknown) : null, stderr: run.stderr };
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "migracao-helyx-"));
  home = fs.mkdtempSync(path.join(os.tmpdir(), "migracao-helyx-home-"));
  write(HELYX.config, HELYX_CONFIG);
  write(`.github/scripts/${HELYX.cli}`, "// bundle do CLI da Helyx 0.9.4 (sintético)\nprocess.exit(3);\n", 0o755);
  write(`.claude/agents/${HELYX.orchestrator}`, "---\nname: \"Helyx\"\n---\n# @helyx — orquestrador da versão antiga\n");
  write(`.claude/commands/${HELYX.slash}`, "---\ndescription: \"versão antiga do /helyx\"\n---\nconteúdo antigo\n");
  write(".claude/agents/domain/pedidos.agent.md", DOMAIN_AGENT);
  write(".claude/skills/coding-guidelines-pedidos-api/SKILL.md", "# padrão descoberto no pedidos-api\n");
  write("CLAUDE.md", "# CLAUDE.md — Helyx Brownfield (versão antiga)\n");
  write("docs/input/contrato.md", "# contrato do cliente\n");
  write(".gitignore", `# decisão explícita do time\n${HELYX.marker}\n`);
  for (const [rel, content] of Object.entries(ARTIFACTS)) write(rel, content);
  artifactsBefore = hashTree(".github/artifacts");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

describe("migração Helyx → Jataí — um workspace Helyx existente abre sem perda", () => {
  it("pré-condição: a marca em uso não é a Helyx, e a Helyx está na seção legacy do brand.json", () => {
    expect(BRAND.name).not.toBe("helyx");
    expect(BRAND.legacy.names).toContain("helyx");
    expect(BRAND.legacy.configFiles).toContain(HELYX.config);
    expect(BRAND.legacy.cliFiles).toContain(HELYX.cli);
    expect(BRAND.legacy.orchestratorAgents).toContain(HELYX.orchestrator);
    expect(BRAND.legacy.slashCommands).toContain(HELYX.slash);
    expect(BRAND.legacy.gitignoreMarkers).toContain(HELYX.marker);
    expect(BRAND.legacy.envPrefixes).toContain("HELYX_");
  });

  it("1. ativa: o predicado de ativação e o Wizard reconhecem o workspace", async () => {
    const rootEntries = [...WORKSPACE_MARKER_FILES, CLAUDE_LAYOUT_DIR].filter((name) => exists(name));
    expect(rootEntries).toEqual([HELYX.config, CLAUDE_LAYOUT_DIR]);
    const facts = { hasFolder: true, trusted: true, rootEntries };
    expect(shouldStartWorkspaceServices(facts)).toBe(true);
    expect(shouldEnsureClaudeCommand(facts)).toBe(true);
    const wizard = await validateWorkspaceDir(root);
    expect(wizard.valid).toBe(true);
    expect(wizard.reason).toMatch(/retomado/);
    expect(getKitStatus(root, kitVersion())).toMatchObject({ installed: "0.9.4", legacyConfigName: true, outdated: true });
  });

  it("2. lê o estado: config, host, iniciativas, delivery-state, repos e Foundation", async () => {
    expect(findConfigPath(root)).toBe(path.join(root, HELYX.config));
    const loader = new ConfigLoader([{ uri: { fsPath: root } }] as never);
    expect(await loader.isConfigured()).toBe(true);
    expect(await loader.hostAdapter()).toBe("claude"); // pelo orquestrador helyx.agent.md, o config não tem host_adapter
    const initiatives = loadInitiatives(root);
    expect(initiatives?.active).toBe("mod-pedidos");
    expect(initiatives?.initiatives.map((i) => i.id)).toEqual(["mod-pedidos", "feat-cupom"]);
    expect(loadDeliveryState(root, "mod-pedidos")?.phases["modernization-planner"]?.status).toBe("in-progress");
    expect(loadRepos(root)?.repos.map((r) => r.id)).toEqual(["pedidos-api"]);
    expect(loadFoundationState(root)?.phases?.["tech-stack"]?.status).toBe("done");
  });

  it("2b. o servidor MCP de um .mcp.json antigo acha a raiz por HELYX_WORKSPACE_ROOT", () => {
    const current = `${BRAND.envPrefix}WORKSPACE_ROOT`;
    const saved = { [current]: process.env[current], [HELYX.env]: process.env[HELYX.env] };
    delete process.env[current];
    process.env[HELYX.env] = root;
    try {
      expect(resolveStateServiceRoot()).toBe(root);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("3. o migrateKit instala o kit Jataí e adota o config novo, preservando o conteúdo", async () => {
    const loader = new ConfigLoader([{ uri: { fsPath: root } }] as never);
    await new StructureGenerator().migrateKit(root, "pedidos-ws", await loader.hostAdapter());

    // config: nome novo, comentários e repos preservados, kit_version atual; o legado só sai depois
    expect(exists(HELYX.config)).toBe(false);
    const config = read(BRAND.files.config);
    expect(config).toContain("# config gravado pelo Foundation do Helyx");
    expect(config).toContain("      - coding-guidelines-pedidos-api");
    expect(readKitVersion(root)).toBe(kitVersion());

    // kit Jataí: CLI, slash command, instruções e agentes do kit com a marca nova
    const kitCli = path.resolve(__dirname, "..", "kit", "scripts", BRAND.files.cli);
    expect(fs.readFileSync(path.join(root, ".github/scripts", BRAND.files.cli)).equals(fs.readFileSync(kitCli))).toBe(true);
    expect(read(`.claude/commands/${BRAND.files.slashCommand}`)).toBe(helyxCommandContent("claude"));
    const claudeMd = read("CLAUDE.md");
    expect(claudeMd).toBe(renderBrandPlaceholders(fs.readFileSync(path.resolve(__dirname, "..", "dist", "kit", "brownfield-templates", "claude-instructions.md"), "utf-8")));
    expect(claudeMd).toContain(`@${BRAND.participant.name}`);
    expect(read(".claude/agents/discovery/assessor.agent.md")).toContain(BRAND.files.config);
    expect(read(".claude/agents/discovery/assessor.agent.md")).not.toContain("{{brand.");

    // trabalho do cliente intocado
    expect(read(".claude/agents/domain/pedidos.agent.md")).toBe(DOMAIN_AGENT);
    expect(read(".claude/skills/coding-guidelines-pedidos-api/SKILL.md")).toBe("# padrão descoberto no pedidos-api\n");
    expect(read("docs/input/contrato.md")).toBe("# contrato do cliente\n");

    // opt-out de repos/ gravado com o marcador da Helyx continua respeitado
    expect(read(".gitignore").startsWith(`# decisão explícita do time\n${HELYX.marker}\n`)).toBe(true);
    expect(read(".gitignore").split("\n")).not.toContain("/repos/");

    // depois da migração o workspace continua ativando, agora pelo config novo
    expect(findConfigPath(root)).toBe(path.join(root, BRAND.files.config));
  });

  it("4. .github/artifacts/** fica byte a byte igual", () => {
    expect(hashTree(".github/artifacts")).toEqual(artifactsBefore);
  });

  it("5. o que o kit antigo chama continua funcionando: /helyx vira alias", () => {
    expect(read(`.claude/commands/${HELYX.slash}`)).toBe(helyxCommandContent("claude"));
  });

  // A7 / BUG-11, corrigido na F3.5: antes o orquestrador antigo ficava, e o
  // workspace terminava com helyx.agent.md (name: "Helyx") ao lado de um
  // CLAUDE.md que manda falar com @jatai.
  it("REGRESSÃO: A7 / BUG-11 — o orquestrador da Helyx vira o do kit Jataí, e o antigo fica guardado como .bak (nada do cliente se perde)", () => {
    const current = read(`.claude/agents/${BRAND.files.orchestratorAgent}`);
    expect(current).toContain("Orquestrador Brownfield");
    expect(current).not.toContain("{{brand.");
    expect(current).not.toContain(".github/agents/");
    expect(exists(`.claude/agents/${HELYX.orchestrator}`)).toBe(false);
    expect(read(`.claude/agents/${HELYX.orchestrator}.bak`)).toBe("---\nname: \"Helyx\"\n---\n# @helyx — orquestrador da versão antiga\n");
    expect(exists(".claude/agents/maestro.agent.md")).toBe(false);
  });

  it("5b. o CLI antigo (.github/scripts/helyx-state.cjs), chamado pelo agente de domínio, delega ao CLI novo e grava o estado", () => {
    const legacy = `.github/scripts/${HELYX.cli}`;
    expect(read(legacy)).toBe(legacyCliShim(HELYX.cli));
    if (process.platform !== "win32") expect(fs.statSync(path.join(root, legacy)).mode & 0o777).toBe(0o755);

    const viaLegacy = runCli(legacy, ["initiatives", "switch-active", "--id", "feat-cupom"]);
    expect(viaLegacy.status, viaLegacy.stderr).toBe(0);
    expect(viaLegacy.json).toMatchObject({ ok: true });
    expect(loadInitiatives(root)?.active).toBe("feat-cupom");

    // o mesmo verbo pelo CLI novo: mesmo arquivo, mesmo envelope (mesmo motor, mesmo contrato)
    const viaNew = runCli(`.github/scripts/${BRAND.files.cli}`, ["initiatives", "switch-active", "--id", "mod-pedidos"]);
    expect(viaNew.status).toBe(0);
    expect(viaNew.json).toEqual({ ...(viaLegacy.json as object), id: "mod-pedidos" });
    expect(loadInitiatives(root)?.active).toBe("mod-pedidos");
    expect(read(".github/artifacts/initiatives.yaml")).toContain("# iniciativas do workspace (comentário do time, não pode sumir)");

    // erro de uso continua no envelope de uma linha, com o mesmo código de saída
    const usage = runCli(legacy, ["initiatives"]);
    expect(usage.status).toBe(1);
    expect(usage.json).toMatchObject({ ok: false, error: { code: "USAGE" } });
  });
});
