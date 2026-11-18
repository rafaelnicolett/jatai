/**
 * generator-cases.ts — a matriz de casos do golden do gerador (§4.1 e §4.4 de
 * `analysis/arquitetura-e-refatoracao.md`).
 *
 * Famílias:
 * - greenfield local (scaffold, sem `TemplateSource` plugada — o padrão da
 *   edição aberta, F2.1): 2 casos "padrão" (um por host,
 *   são as bases do delta) + 33 casos pairwise sobre os 11 eixos do Wizard +
 *   casos de bug conhecido;
 * - greenfield zip (uma `TemplateSource` falsa, injetada no gerador, devolve o
 *   zip-fixture; sem rede);
 * - brownfield `installAgentStructure` (host × maturidade, workspace existente);
 * - `migrateKit` sobre workspaces de versões anteriores.
 *
 * Fixtures 100% sintéticas. Nomes que carregam a marca (`helyx.config.yaml`,
 * `helyx-state.cjs`, `/helyx`, `helyx.agent.md`, o marcador do `.gitignore`)
 * são montados a partir de `CURRENT_BRAND`, para que na F1.3 o cenário seja
 * "o mesmo workspace, na marca nova" e a saída normalize de volta ao golden.
 *
 * Behavior pinned on 2026-11-14 (F0.4, mod-missao-open-source). Mudar um caso
 * aqui muda o golden: revise se a mudança é intencional.
 */
import { CURRENT_BRAND } from "./brand";

// ---------------------------------------------------------------------------
// Greenfield
// ---------------------------------------------------------------------------

export const PAIRWISE_FACTORS = [
  "hostAdapter",
  "backendStack",
  "backendArchitecture",
  "frontendStack",
  "frontendArchitecture",
  "database",
  "cloud",
  "cicd",
  "deliveryMode",
  "startupIdea",
  "projectName",
] as const;

/** Níveis de cada eixo. `-` = campo ausente do estado do Wizard. */
export const PAIRWISE_LEVELS: Readonly<Record<(typeof PAIRWISE_FACTORS)[number], readonly string[]>> = {
  hostAdapter: ["claude", "copilot"],
  backendStack: ["python-api", "java-spring", "dotnet-core", "python-agentic"],
  backendArchitecture: ["hexagonal", "vertical-slice", "layered", "ddd-tactical"],
  frontendStack: ["none", "react-vite", "flutter", "android-compose", "ios-swiftui"],
  frontendArchitecture: ["-", "feature-based", "clean-frontend", "mvvm", "mvc"],
  database: ["postgresql", "mysql", "mongodb", "sqlite", "none"],
  cloud: ["none", "gcp", "aws", "azure"],
  cicd: ["github-actions", "gitlab-ci", "jenkins", "none"],
  deliveryMode: ["full-cycle", "code-first", "agentic-only"],
  startupIdea: ["-", "ideia"],
  projectName: ["orbita", "painel-ficticio"],
};

/**
 * Covering array pairwise (todo par de níveis de quaisquer 2 eixos aparece em
 * pelo menos uma linha), gerado uma vez por um guloso determinístico e
 * congelado aqui. `generator.golden.test.ts` confere a cobertura.
 */
export const PAIRWISE_ROWS: ReadonlyArray<readonly string[]> = [
  ["claude", "python-api", "hexagonal", "none", "-", "mongodb", "none", "github-actions", "agentic-only", "-", "orbita"],
  ["copilot", "python-api", "vertical-slice", "react-vite", "feature-based", "none", "gcp", "gitlab-ci", "full-cycle", "ideia", "painel-ficticio"],
  ["claude", "java-spring", "ddd-tactical", "flutter", "clean-frontend", "sqlite", "aws", "jenkins", "code-first", "ideia", "orbita"],
  ["copilot", "dotnet-core", "layered", "android-compose", "mvc", "postgresql", "azure", "none", "code-first", "-", "painel-ficticio"],
  ["claude", "python-agentic", "vertical-slice", "ios-swiftui", "mvvm", "mysql", "azure", "gitlab-ci", "full-cycle", "-", "orbita"],
  ["copilot", "python-agentic", "ddd-tactical", "none", "mvvm", "postgresql", "none", "jenkins", "agentic-only", "ideia", "painel-ficticio"],
  ["copilot", "dotnet-core", "hexagonal", "ios-swiftui", "-", "sqlite", "aws", "github-actions", "full-cycle", "ideia", "painel-ficticio"],
  ["claude", "java-spring", "layered", "react-vite", "feature-based", "mysql", "gcp", "none", "agentic-only", "-", "orbita"],
  ["copilot", "java-spring", "vertical-slice", "flutter", "clean-frontend", "mongodb", "none", "none", "full-cycle", "-", "painel-ficticio"],
  ["claude", "dotnet-core", "ddd-tactical", "android-compose", "mvc", "none", "aws", "gitlab-ci", "agentic-only", "-", "orbita"],
  ["claude", "python-agentic", "hexagonal", "flutter", "mvc", "mysql", "gcp", "github-actions", "code-first", "ideia", "painel-ficticio"],
  ["copilot", "python-api", "ddd-tactical", "ios-swiftui", "feature-based", "mongodb", "azure", "jenkins", "code-first", "ideia", "orbita"],
  ["claude", "java-spring", "layered", "none", "-", "none", "none", "gitlab-ci", "code-first", "ideia", "orbita"],
  ["claude", "java-spring", "hexagonal", "react-vite", "clean-frontend", "postgresql", "azure", "github-actions", "agentic-only", "-", "orbita"],
  ["copilot", "python-api", "layered", "android-compose", "mvvm", "sqlite", "aws", "none", "full-cycle", "ideia", "painel-ficticio"],
  ["copilot", "dotnet-core", "vertical-slice", "none", "mvc", "sqlite", "gcp", "jenkins", "full-cycle", "-", "painel-ficticio"],
  ["copilot", "python-agentic", "vertical-slice", "react-vite", "-", "mysql", "aws", "jenkins", "code-first", "-", "orbita"],
  ["claude", "python-agentic", "layered", "ios-swiftui", "clean-frontend", "none", "gcp", "none", "agentic-only", "ideia", "painel-ficticio"],
  ["claude", "python-agentic", "vertical-slice", "android-compose", "feature-based", "sqlite", "none", "github-actions", "agentic-only", "-", "orbita"],
  ["copilot", "python-api", "ddd-tactical", "flutter", "-", "postgresql", "gcp", "none", "full-cycle", "ideia", "painel-ficticio"],
  ["claude", "dotnet-core", "hexagonal", "flutter", "mvvm", "none", "azure", "github-actions", "code-first", "-", "orbita"],
  ["copilot", "java-spring", "hexagonal", "android-compose", "mvvm", "mongodb", "gcp", "jenkins", "full-cycle", "ideia", "painel-ficticio"],
  ["claude", "dotnet-core", "layered", "react-vite", "mvc", "mongodb", "none", "gitlab-ci", "code-first", "-", "orbita"],
  ["copilot", "dotnet-core", "hexagonal", "flutter", "feature-based", "postgresql", "aws", "gitlab-ci", "agentic-only", "ideia", "painel-ficticio"],
  ["claude", "python-api", "ddd-tactical", "none", "clean-frontend", "mysql", "none", "github-actions", "full-cycle", "-", "orbita"],
  ["copilot", "dotnet-core", "ddd-tactical", "react-vite", "clean-frontend", "sqlite", "azure", "gitlab-ci", "code-first", "ideia", "painel-ficticio"],
  ["claude", "java-spring", "vertical-slice", "ios-swiftui", "mvc", "postgresql", "none", "jenkins", "agentic-only", "-", "orbita"],
  ["copilot", "python-agentic", "hexagonal", "none", "feature-based", "mongodb", "aws", "none", "full-cycle", "ideia", "painel-ficticio"],
  ["claude", "dotnet-core", "layered", "android-compose", "-", "mysql", "azure", "github-actions", "code-first", "-", "orbita"],
  ["copilot", "python-api", "layered", "flutter", "mvc", "none", "gcp", "jenkins", "agentic-only", "ideia", "painel-ficticio"],
  ["claude", "python-api", "vertical-slice", "none", "mvvm", "postgresql", "azure", "gitlab-ci", "full-cycle", "-", "orbita"],
  ["copilot", "java-spring", "ddd-tactical", "react-vite", "mvvm", "mysql", "aws", "none", "code-first", "ideia", "painel-ficticio"],
  ["claude", "python-agentic", "hexagonal", "android-compose", "clean-frontend", "mongodb", "none", "github-actions", "agentic-only", "-", "orbita"],
];

export const STARTUP_IDEA = "Plataforma fictícia de agendamento, usada só para validar o golden master.";

/** Estado cru do Wizard (antes do `WizardStateSchema.parse`, que aplica os defaults). */
export type RawWizardState = Record<string, unknown>;

export function pairwiseRawState(row: readonly string[]): RawWizardState {
  const get = (f: (typeof PAIRWISE_FACTORS)[number]): string => row[PAIRWISE_FACTORS.indexOf(f)]!;
  const state: RawWizardState = {
    projectName: get("projectName"),
    hostAdapter: get("hostAdapter"),
    backendStack: get("backendStack"),
    backendArchitecture: get("backendArchitecture"),
    frontendStack: get("frontendStack"),
    database: get("database"),
    cloud: get("cloud"),
    cicd: get("cicd"),
    deliveryMode: get("deliveryMode"),
  };
  if (get("frontendArchitecture") !== "-") state.frontendArchitecture = get("frontendArchitecture");
  if (get("startupIdea") !== "-") state.startupIdea = STARTUP_IDEA;
  return state;
}

/**
 * O que a `TemplateSource` plugada no gerador devolve. `offline` = nenhuma
 * fonte plugada (o padrão da edição aberta, `NullTemplateSource`). Os nomes
 * vêm de antes da F2.1, quando a fonte era o registry privado.
 */
export type RegistryBehavior =
  | { readonly kind: "offline" }
  | { readonly kind: "zip" }
  | { readonly kind: "bytes"; readonly text: string };

export interface GreenfieldCase {
  readonly id: string;
  readonly title: string;
  readonly knownBugs?: readonly string[];
  readonly base: string | null;
  readonly state: RawWizardState;
  readonly registry: RegistryBehavior;
  /** A fonte plugada devolve o zip-fixture (antes da F2.1: cache local de templates). */
  readonly cacheHit?: boolean;
  /** Arquivos que já existem na pasta-alvo antes da geração. */
  readonly preexisting?: Readonly<Record<string, string>>;
}

const baseFor = (host: string): string => `greenfield-${host}-padrao`;

export const GREENFIELD_CASES: readonly GreenfieldCase[] = [
  {
    id: "greenfield-claude-padrao",
    title: "Claude Code, todos os defaults do Wizard (base do delta claude)",
    base: null,
    state: { projectName: "orbita", hostAdapter: "claude", backendStack: "python-api" },
    registry: { kind: "offline" },
  },
  {
    id: "greenfield-copilot-padrao",
    title: "Copilot, todos os defaults do Wizard (base do delta copilot)",
    base: null,
    state: { projectName: "orbita", hostAdapter: "copilot", backendStack: "python-api" },
    registry: { kind: "offline" },
  },
  {
    id: "greenfield-opencode-padrao",
    title: "OpenCode, todos os defaults do Wizard (base do delta opencode)",
    base: null,
    state: { projectName: "orbita", hostAdapter: "opencode", backendStack: "python-api" },
    registry: { kind: "offline" },
  },
  ...PAIRWISE_ROWS.map((row, i): GreenfieldCase => {
    const state = pairwiseRawState(row);
    return {
      id: `greenfield-pw-${String(i + 1).padStart(2, "0")}`,
      title: `pairwise: ${row.join(" · ")}`,
      base: baseFor(String(state.hostAdapter)),
      state,
      registry: { kind: "offline" },
    };
  }),
  {
    id: "greenfield-bug45-startupidea-sem-escape",
    title: "startupIdea com aspas e quebra de linha entra cru em main.py, pyproject.toml e pubspec.yaml",
    knownBugs: ["BUG-45: startupIdea sem escape quebra main.py/pyproject.toml/pubspec.yaml"],
    base: "greenfield-claude-padrao",
    state: {
      projectName: "orbita",
      hostAdapter: "claude",
      backendStack: "python-api",
      frontendStack: "flutter",
      startupIdea: 'Agenda "fictícia" de testes\ncom segunda linha',
    },
    registry: { kind: "offline" },
  },
  {
    id: "greenfield-bug46-pasta-existente",
    title: "pasta-alvo já existe e não está vazia: o rename falha e a geração mescla por cima",
    knownBugs: ["BUG-46: pasta não vazia é mesclada e sobrescrita sem aviso"],
    base: "greenfield-copilot-padrao",
    state: { projectName: "orbita", hostAdapter: "copilot", backendStack: "python-api" },
    registry: { kind: "offline" },
    preexisting: {
      "notas-do-usuario.md": "# notas que o usuário já tinha na pasta\n",
      "docs/README.md": "# README do usuário, vai ser sobrescrito\n",
      "AGENTS.md": "# AGENTS.md do usuário, vai ser sobrescrito\n",
    },
  },
  {
    id: "greenfield-zip-registry",
    title: "zip de uma TemplateSource plugada (com versão): renderiza {{var|filtro}} e não instala o kit de agentes",
    knownBugs: ["BUG-44: binário corrompido, placeholder desconhecido apagado, bit de execução perdido, sem agentes no caminho zip"],
    base: null,
    state: {
      projectName: "painel-ficticio",
      hostAdapter: "claude",
      backendStack: "python-api",
      resolvedTemplate: { id: "template-sintetico", name: "Template sintético", stack: "python-api", version: "1.2.3" },
    },
    registry: { kind: "zip" },
  },
  {
    id: "greenfield-zip-cache",
    title: "zip de uma TemplateSource plugada, host Copilot, stack java-spring",
    knownBugs: ["BUG-44: mesmo caminho zip"],
    base: null,
    state: {
      projectName: "orbita",
      hostAdapter: "copilot",
      backendStack: "java-spring",
      resolvedTemplate: { id: "template-sintetico", name: "Template sintético", stack: "java-spring", version: "2.0.0" },
    },
    registry: { kind: "offline" },
    cacheHit: true,
  },
  {
    id: "greenfield-zip-bug43-nao-zip",
    title: "TemplateSource plugada devolve HTML (portal cativo) no lugar do zip: a geração falha em vez de cair no scaffold local",
    knownBugs: ["BUG-43: payload que não é zip derruba a geração"],
    base: null,
    state: { projectName: "orbita", hostAdapter: "claude", backendStack: "python-api" },
    registry: { kind: "bytes", text: "<html><body>portal cativo fictício</body></html>\n" },
  },
  {
    id: "greenfield-stack-divergente",
    title: "resolvedTemplate.stack diferente do backendStack: lança 'Stack mismatch' e faz rollback",
    base: null,
    state: {
      projectName: "orbita",
      hostAdapter: "claude",
      backendStack: "java-spring",
      resolvedTemplate: { id: "template-sintetico", name: "Template sintético", stack: "python-api", version: "1.0.0" },
    },
    registry: { kind: "offline" },
  },
];

/** Entradas do zip-fixture (synthetic). `../` testa o zip-slip; JSZip 3.10.1 sanitiza o nome. */
export interface ZipFixtureEntry {
  readonly name: string;
  readonly text?: string;
  readonly bytes?: readonly number[];
  readonly unixPermissions?: number;
  readonly dir?: boolean;
}

export const ZIP_FIXTURE: readonly ZipFixtureEntry[] = [
  {
    name: "README.md.tmpl",
    text:
      "# {{project_name}}\n\n" +
      "Serviço `{{svc_name}}` ({{svc_name_snake}}) · classe {{project_name|pascal}} · kebab {{svc_name_snake|kebab}} · snake {{project_name|snake}}\n" +
      "Python {{python_version}} · autor {{author}}\n" +
      "desconhecida: [{{variavel_inexistente}}] · Vue colado: [{{message}}] · com espaços: [{{ project_name }}]\n",
  },
  { name: "config/app.yaml", text: "app: {{project_name}}\n" },
  { name: "src/{{svc_name_snake}}/__init__.py.tmpl", text: "" },
  { name: "CLAUDE.md", text: "# CLAUDE.md do zip (o adapter sobrescreve)\n" },
  { name: ".github/copilot-instructions.md", text: "# instruções do zip (o adapter sobrescreve)\n" },
  { name: "scripts/mvnw", text: "#!/bin/sh\necho mvnw fictício\n", unixPermissions: 0o755 },
  { name: "assets/logo.png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff, 0xfe, 0x80, 0x81] },
  { name: "../fora-do-projeto.txt", text: "zip-slip {{project_name}}\n" },
  { name: "docs/", dir: true },
];

// ---------------------------------------------------------------------------
// Brownfield (installAgentStructure)
// ---------------------------------------------------------------------------

const slug = CURRENT_BRAND.slug;
export const GITIGNORE_OPT_OUT_LITERAL = `${slug}:repos-versionado-por-decisao-explicita`;

export interface BrownfieldCase {
  readonly id: string;
  readonly title: string;
  readonly knownBugs?: readonly string[];
  readonly base: string | null;
  readonly host: string;
  readonly projectName: string;
  readonly maturity?: readonly string[];
  readonly preexisting?: Readonly<Record<string, string>>;
}

const THREE_FRAMEWORKS = ["dora-4keys", "space-devex", "owasp-samm"] as const;

export const BROWNFIELD_CASES: readonly BrownfieldCase[] = [
  { id: "brownfield-claude-padrao", title: "Claude Code, maturidade default (base do delta claude)", base: null, host: "claude", projectName: "orbita-ws" },
  { id: "brownfield-copilot-padrao", title: "Copilot, maturidade default (base do delta copilot)", base: null, host: "copilot", projectName: "orbita-ws" },
  { id: "brownfield-opencode-padrao", title: "OpenCode, maturidade default (base do delta opencode)", base: null, host: "opencode", projectName: "orbita-ws" },
  {
    id: "brownfield-claude-maturidade-tres",
    title: "Claude Code com 3 frameworks de maturidade",
    base: "brownfield-claude-padrao",
    host: "claude",
    projectName: "orbita-ws",
    maturity: THREE_FRAMEWORKS,
  },
  {
    id: "brownfield-copilot-maturidade-tres",
    title: "Copilot com 3 frameworks de maturidade",
    base: "brownfield-copilot-padrao",
    host: "copilot",
    projectName: "orbita-ws",
    maturity: THREE_FRAMEWORKS,
  },
  {
    id: "brownfield-claude-workspace-existente",
    // C5 / BUG-08 corrigido na F6.1: com o config na raiz é retomada, e a
    // instalação só completa o que falta do kit.
    title: "Claude retomando workspace Helyx com trabalho: preserva instruções, config, docs/input/README e o orquestrador; só completa o kit",
    base: "brownfield-claude-padrao",
    host: "claude",
    projectName: "orbita-ws",
    preexisting: {
      ".gitignore": "# gitignore do usuário\nnode_modules/\n*.log\n",
      "CLAUDE.md": "# instruções do usuário (serão sobrescritas)\n",
      "AGENTS.md": "# AGENTS.md do usuário (será sobrescrito)\n",
      ".claude/agents/domain/agendamento.agent.md": "# @agendamento — agente de domínio do cliente fictício\nReferência: .github/agents/discovery/assessor.agent.md\n",
      [`.claude/agents/${slug}.agent.md`]: "# orquestrador customizado pelo usuário\n",
      ".claude/settings.json": '{ "permissions": { "allow": [] } }\n',
      [`${slug}.config.yaml`]: '# config gravado pelo Foundation\nkit_version: "0.9.4"\nrepos:\n  app-ficticio:\n    skills:\n      - coding-guidelines-app-ficticio\n',
      "docs/input/README.md": "# README do usuário em docs/input\n",
      "docs/input/contrato-ficticio.md": "# contrato fictício\n",
      ".github/artifacts/assessment/foundation-state.yaml": "phases:\n  tech-stack:\n    status: done\n",
      ".github/artifacts/assessment/.gitkeep": "# gitkeep do usuário\n",
      "repos/app-ficticio/README.md": "# repositório do cliente fictício\n",
    },
  },
  {
    id: "brownfield-copilot-workspace-existente",
    title: "Copilot sobre repositório com .git/.github: respeita o opt-out do .gitignore e preserva arquivos fora do kit",
    knownBugs: ["BUG-07: instala dentro do repositório do cliente e sobrescreve copilot-instructions.md/AGENTS.md"],
    base: "brownfield-copilot-padrao",
    host: "copilot",
    projectName: "orbita-ws",
    preexisting: {
      ".gitignore": `# decisão explícita do usuário\n${GITIGNORE_OPT_OUT_LITERAL}\n`,
      ".git/HEAD": "ref: refs/heads/main\n",
      ".github/workflows/ci.yml": "name: ci-ficticio\non: push\n",
      ".github/copilot-instructions.md": "# instruções do usuário (serão sobrescritas)\n",
      ".github/agents/custom.agent.md": "# agente do usuário\n",
      ".github/chatmodes/meu-modo.chatmode.md": "# chatmode do usuário\n",
      "AGENTS.md": "# AGENTS.md do usuário\n",
      "README.md": "# repositório fictício\n",
    },
  },
  {
    id: "brownfield-copilot-nome-com-aspas",
    title: "projectName com aspas entra sem escape no config",
    knownBugs: ["mesma classe do BUG-15: valor interpolado sem escape gera helyx.config.yaml inválido"],
    base: "brownfield-copilot-padrao",
    host: "copilot",
    projectName: 'Workspace "Fictício" 2',
  },
];

// ---------------------------------------------------------------------------
// migrateKit
// ---------------------------------------------------------------------------

export interface MigrateCase {
  readonly id: string;
  readonly title: string;
  readonly knownBugs?: readonly string[];
  readonly base: string;
  readonly host: "claude" | "copilot";
  readonly projectName: string;
  /** `legado` | `multi-repo` | `greenfield` (projeto gerado pelo próprio gerador). */
  readonly fixture: "legado" | "multi-repo" | "greenfield";
}

const hostDir = (host: "claude" | "copilot"): string => (host === "claude" ? ".claude" : ".github");
const orchestratorFile = (host: "claude" | "copilot"): string => (host === "claude" ? `${slug}.agent.md` : "maestro.agent.md");

/** Workspace de uma versão anterior: kit velho, config legado com comentários, muito trabalho do cliente. */
export function legacyWorkspaceFixture(host: "claude" | "copilot"): Record<string, string> {
  const hd = hostDir(host);
  const files: Record<string, string> = {
    [`${hd}/agents/discovery/assessor.agent.md`]: "# @assessor — VERSÃO ANTIGA DO KIT (fixture)\n",
    [`${hd}/agents/planning/modernization-planner.agent.md`]: "# @modernization-planner — VERSÃO ANTIGA DO KIT (fixture)\n",
    [`${hd}/agents/operation/devops.agent.md`]: "# @devops — VERSÃO ANTIGA DO KIT (fixture)\n",
    [`${hd}/agents/${orchestratorFile(host)}`]: "# orquestrador — VERSÃO ANTIGA DO KIT (fixture)\n",
    [`${hd}/agents/domain/agendamento.agent.md`]: "# @agendamento — LLM Wiki do cliente fictício\nVer também .github/agents/discovery/assessor.agent.md\n",
    [`${hd}/skills/codebase-enrichment/SKILL.md`]: "# skill do kit — VERSÃO ANTIGA (fixture)\n",
    [`${hd}/skills/skill-removida-do-kit/SKILL.md`]: "# skill que o kit não traz mais\n",
    [`${hd}/skills/coding-guidelines-app-ficticio/SKILL.md`]: "# padrão descoberto do app-ficticio\n",
    "AGENTS.md": "# AGENTS.md — VERSÃO ANTIGA (fixture)\n",
    "ai-sdk.config.yaml": `# Config do workspace fictício (comentário do usuário)\nversion: "1.0.0"\nhost_adapter: "${host}"\nproject:\n  name: "ws-legado"   # não perder\n`,
    ".github/artifacts/assessment/foundation-state.yaml": "phases:\n  domain:\n    status: done\n",
    ".github/artifacts/repos.yaml": "repos:\n  - id: app-ficticio\n    source: local-path\n    path: repos/app-ficticio\n",
    "docs/input/contrato-ficticio.md": "# contrato fictício\n",
  };
  if (host === "claude") {
    files["CLAUDE.md"] = "# CLAUDE.md — VERSÃO ANTIGA (fixture)\n";
    files[`.claude/commands/${slug}.md`] = "# comando antigo (fixture)\n";
  } else {
    files[".github/copilot-instructions.md"] = "# copilot-instructions — VERSÃO ANTIGA (fixture)\n";
    files[".github/chatmodes/maestro.chatmode.md"] = "# chatmode — VERSÃO ANTIGA (fixture)\n";
  }
  return files;
}

/** Workspace multi-repo depois do Foundation: config só com `kit_version` + `repos:`, 2 repos, CLI antigo. */
export function multiRepoWorkspaceFixture(host: "claude" | "copilot"): Record<string, string> {
  const hd = hostDir(host);
  return {
    [`${slug}.config.yaml`]:
      'kit_version: "0.9.4"\nrepos:\n  app-a:\n    skills:\n      - coding-guidelines-app-a\n  app-b:\n    skills:\n      - coding-guidelines-app-b\n',
    ".gitignore": "node_modules/\n\n# repositórios fora do git\n/repos/\n",
    ".github/artifacts/repos.yaml":
      "repos:\n  - id: app-a\n    source: local-path\n    path: repos/app-a\n  - id: app-b\n    source: local-path\n    path: repos/app-b\n",
    ".github/artifacts/assessment/foundation-state.yaml": "repos:\n  app-a:\n    gate_d1:\n      status: approved\n  app-b:\n    gate_d1:\n      status: pending\n",
    [`.github/scripts/${slug}-state.cjs`]: "// CLI de uma versão anterior (fixture)\n",
    "repos/app-a/README.md": "# app-a fictício\n",
    "repos/app-b/src/index.js": "module.exports = 1;\n",
    [`${hd}/skills/coding-guidelines-app-a/SKILL.md`]: "# padrão do app-a\n",
    [`${hd}/skills/coding-guidelines-app-b/SKILL.md`]: "# padrão do app-b\n",
    [`${hd}/agents/domain/faturamento-ficticio.agent.md`]: "# @faturamento-ficticio — domínio do cliente\n",
    [`${hd}/agents/execution/refactor-agent.agent.md`]: "# @refactor-agent — VERSÃO ANTIGA (fixture)\n",
  };
}

export const MIGRATE_CASES: readonly MigrateCase[] = [
  {
    id: "migrate-claude-legado",
    title: "Claude, workspace legado (ai-sdk.config.yaml com comentários, sem kit_version)",
    // A21 (agents/domain/ reescrito) corrigido na F6.1.
    knownBugs: ["BUG-11: orquestrador e agents/operation não são migrados"],
    base: "brownfield-claude-padrao",
    host: "claude",
    projectName: "ws-legado",
    fixture: "legado",
  },
  {
    id: "migrate-copilot-legado",
    title: "Copilot, workspace legado",
    knownBugs: ["BUG-11: orquestrador e agents/operation não são migrados"],
    base: "brownfield-copilot-padrao",
    host: "copilot",
    projectName: "ws-legado",
    fixture: "legado",
  },
  {
    id: "migrate-claude-multi-repo",
    title: "Claude, workspace multi-repo pós-Foundation (config só com kit_version + repos)",
    base: "brownfield-claude-padrao",
    host: "claude",
    projectName: "orbita-ws",
    fixture: "multi-repo",
  },
  {
    id: "migrate-copilot-multi-repo",
    title: "Copilot, workspace multi-repo pós-Foundation",
    base: "brownfield-copilot-padrao",
    host: "copilot",
    projectName: "orbita-ws",
    fixture: "multi-repo",
  },
  {
    id: "migrate-claude-projeto-greenfield",
    // A6 / BUG-10 corrigido na F6.1.
    title: "migrateKit num projeto greenfield recém-gerado não aplica o kit brownfield (nada muda)",
    base: "greenfield-claude-padrao",
    host: "claude",
    projectName: "orbita",
    fixture: "greenfield",
  },
];

export const GENERATOR_CASE_ORDER: readonly string[] = [
  ...GREENFIELD_CASES.map((c) => c.id),
  ...BROWNFIELD_CASES.map((c) => c.id),
  ...MIGRATE_CASES.map((c) => c.id),
];

/** Nome do teste: prefixo `@known-bug:` quando o caso pina defeito conhecido (convenção de structure-generator-greenfield.test.ts). */
export function caseTitle(c: { id: string; title: string; knownBugs?: readonly string[] }): string {
  const head = `${c.id} — ${c.title}`;
  return c.knownBugs && c.knownBugs.length > 0 ? `@known-bug: ${c.knownBugs.join("; ")} — ${head}` : head;
}
