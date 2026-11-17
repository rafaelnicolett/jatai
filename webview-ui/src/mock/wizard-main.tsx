import { createRoot } from "react-dom/client";
import type { HostToWizardMessage, TemplateManifest, WizardBoot, WizardMessage } from "@shared/wizard-protocol";
import { BRAND } from "@data";
import "../index.css";
import { getBrownfieldSchema, getWizardSchema } from "../../../src/wizard/wizard-schema";
import { WizardApp } from "../apps/wizard/WizardApp";
import { WizardFlow } from "../apps/wizard/WizardFlow";
import { applyCatalogTheme, type CatalogTheme } from "./catalog/catalogTheme";

/**
 * Wizard fora do VS Code, com um host de mentira (wizard.html, só no
 * `vite.config.mock.ts`): serve para ver e capturar cada passo da jornada nos
 * temas escuro, claro e alto contraste, sem o editor. Não prova o Wizard num
 * VS Code de verdade (o tema vem de uma aproximação das variáveis do editor).
 *
 * Parâmetros da URL:
 * - `screen`: a tela (abertura, modo, harness, projeto, dominio, backend,
 *   frontend, infra, local, pasta, repositorios, maturidade, revisao);
 * - `mode`: greenfield (padrão) ou brownfield;
 * - `theme`: dark (padrão), light, hcDark ou hcLight;
 * - `folders`: quantas pastas o editor tem aberta (1 por padrão);
 * - `state`: ok (padrão), erro-nome, instalando, falha, recusa, pronto ou
 *   pronto-fora (a instalação terminou em outra pasta);
 * - `motion=reduce`: movimento reduzido.
 */

const params = new URLSearchParams(window.location.search);
const theme = (params.get("theme") ?? "dark") as CatalogTheme;
applyCatalogTheme(document, { theme, vscode: true, reduceMotion: params.get("motion") === "reduce" });

const mode = params.get("mode") === "brownfield" ? "brownfield" : "greenfield";
const screen = params.get("screen") ?? "abertura";
const state = params.get("state") ?? "ok";
const folders = Number(params.get("folders") ?? "1");
const workspace = { folder: folders === 0 ? null : "/workspace/oficina", folderCount: folders };

const GREENFIELD_VALUES = {
  hostAdapter: "claude",
  projectName: state === "erro-nome" ? "Loja Demo" : "loja-demo",
  startupIdea: "Uma vitrine online para pequenos produtores locais.",
  domain: "ecommerce",
  backendStack: "python-api",
  backendArchitecture: "hexagonal",
  frontendStack: "react-vite",
  frontendArchitecture: "feature-based",
  database: "postgresql",
  cloud: "aws",
  cicd: "github-actions",
};
const BROWNFIELD_VALUES = {
  hostAdapter: "claude",
  targetDirectory: workspace.folder ?? "/workspace/novo-workspace",
  maturityFrameworks: ["dora-4keys", "tech-radar"],
};

const MANIFEST: TemplateManifest = {
  id: `${BRAND.templatePrefix}python-api`,
  name: `${BRAND.templatePrefix}python-api`,
  stack: "python-api",
  version: "local",
  description: "Prévia local da estrutura.",
  tags: [],
  rubricsAvailable: true,
  generatedTree: [".claude/", ".claude/agents/", ".claude/skills/", ".github/artifacts/", ".github/scripts/", BRAND.files.config, ".mcp.json", "AGENTS.md", "CLAUDE.md", "code/", "api/", "docs/", "features/", "infrastructure/", "pipelines/"],
};

async function main(): Promise<void> {
  const schema = mode === "brownfield" ? await getBrownfieldSchema() : await getWizardSchema();
  const boot: WizardBoot = {
    schema,
    state: (mode === "brownfield" ? BROWNFIELD_VALUES : GREENFIELD_VALUES) as WizardBoot["state"],
    brownfield: mode === "brownfield",
    brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix },
    workspace,
    modeChosen: true,
  };
  const reply = (msg: HostToWizardMessage): void => {
    window.setTimeout(() => flow.receive(msg), 30);
  };
  const flow: WizardFlow = new WizardFlow(boot, {
    postMessage: (msg: WizardMessage) => {
      if (msg.type === "fetchTemplate") reply({ type: "templateManifest", manifest: MANIFEST, source: "local" });
      if (msg.type === "pickFolder") reply({ type: "folderPicked", folder: "/workspace/projetos/novo" });
    },
    setState: () => {},
    getState: () => ({ screen }),
  });
  flow.start();

  // Estados depois da revisão: instalando, falha, recusa e pronto.
  if (["instalando", "falha", "recusa", "pronto", "pronto-fora"].includes(state)) {
    flow.next();
    if (state === "falha") flow.receive({ type: "generationError", message: "Não há espaço livre no disco." });
    if (state === "recusa") flow.receive({ type: "validationError", errors: { targetDirectory: ["Pasta não está vazia (3 itens). Escolha uma pasta vazia para o workspace."] } });
    if (state === "pronto" || state === "pronto-fora") {
      flow.receive({
        type: "installed",
        mode,
        folder: state === "pronto" ? (workspace.folder ?? "/workspace/oficina") : "/workspace/projetos/outra",
        hostAdapter: "claude",
        folderIsOpen: state === "pronto",
      });
    }
  }
  createRoot(document.getElementById("root")!).render(<WizardApp flow={flow} />);
}

void main();
