/**
 * journey.ts — o modelo puro da jornada do Wizard (F4.3): as telas de cada
 * modo, o que impede de avançar, a revisão e as regras de teclado. Sem React
 * e sem mensagens ao host: o `WizardFlow` o usa e os testes o exercitam
 * direto. O schema do host (`src/wizard/wizard-schema.ts`) continua sendo a
 * fonte das opções de cada campo; a jornada decide como elas se agrupam.
 */

import type { WizardStep } from "@shared/wizard-protocol";
import { BRAND, validateProjectName } from "@data";
import { COMMON_FACTS, FOLDER_COPY, HARNESS_FACTS, REPOSITORIES_COPY } from "./journeyCopy";
import type { Mode, ScreenId } from "./journeyTypes";

export type { Mode, ScreenId };
export type WizardValues = Record<string, unknown>;

export interface JourneyScreen {
  id: ScreenId;
  /** Chaves do schema (os campos) que a tela coleta. */
  fields: readonly string[];
}

const OPENING: JourneyScreen[] = [
  { id: "abertura", fields: [] },
  { id: "modo", fields: [] },
  { id: "harness", fields: ["hostAdapter"] },
];

const GREENFIELD: readonly JourneyScreen[] = [
  ...OPENING,
  { id: "projeto", fields: ["projectName", "startupIdea"] },
  { id: "dominio", fields: ["domain"] },
  { id: "backend", fields: ["backendStack", "backendArchitecture"] },
  { id: "frontend", fields: ["frontendStack", "frontendArchitecture"] },
  { id: "infra", fields: ["database", "cloud", "cicd"] },
  { id: "local", fields: ["targetDirectory"] },
  { id: "revisao", fields: [] },
];

const BROWNFIELD: readonly JourneyScreen[] = [
  ...OPENING,
  { id: "pasta", fields: ["targetDirectory"] },
  { id: "repositorios", fields: [] },
  { id: "maturidade", fields: ["maturityFrameworks"] },
  { id: "revisao", fields: [] },
];

export function journeyFor(mode: Mode): readonly JourneyScreen[] {
  return mode === "brownfield" ? BROWNFIELD : GREENFIELD;
}

/** Índice da primeira tela depois da escolha do modo: onde o painel reabre depois de trocar de modo. */
export const FIRST_SCREEN_AFTER_MODE = 2;

export interface Workspace {
  /** Primeira pasta aberta no editor; `null` sem pasta. */
  folder: string | null;
  folderCount: number;
}

export interface JourneyContext {
  schema: readonly WizardStep[];
  workspace: Workspace;
}

const NO_WORKSPACE: Workspace = { folder: null, folderCount: 0 };
export const workspaceOf = (boot: { workspace?: Workspace }): Workspace => boot.workspace ?? NO_WORKSPACE;

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** Passo do schema de um campo. */
export function stepOf(schema: readonly WizardStep[], key: string): WizardStep | undefined {
  return schema.find((step) => step.key === key);
}

/**
 * O que falta nesta tela para a pessoa poder avançar, em uma frase; `null`
 * quando pode. É o motivo que o botão desabilitado diz (DS v2 §4.0) e o que a
 * região de status anuncia.
 */
export function screenIssue(screen: JourneyScreen, values: WizardValues, ctx: JourneyContext): string | null {
  switch (screen.id) {
    case "harness":
      return isEmpty(values.hostAdapter) ? "Escolha o harness para continuar." : null;
    case "projeto": {
      const name = text(values.projectName);
      if (name === "") return "Informe o nome do projeto.";
      const check = validateProjectName(name);
      if (!check.ok) return check.reason;
      return isEmpty(values.startupIdea) ? "Descreva o produto em uma ou duas frases." : null;
    }
    case "dominio":
      return isEmpty(values.domain) ? "Escolha o domínio para continuar." : null;
    case "backend":
      if (isEmpty(values.backendStack)) return "Escolha a stack do backend.";
      return isEmpty(values.backendArchitecture) ? "Escolha a arquitetura do backend." : null;
    case "frontend": {
      const stack = text(values.frontendStack);
      if (stack === "") return "Escolha o frontend, ou “Somente backend”.";
      return stack !== "none" && isEmpty(values.frontendArchitecture) ? "Escolha a arquitetura do frontend." : null;
    }
    case "local":
      return isEmpty(values.targetDirectory) && ctx.workspace.folder === null ? FOLDER_COPY.missingProject : null;
    case "pasta":
      return isEmpty(values.targetDirectory) ? FOLDER_COPY.missingWorkspace : null;
    default:
      return null;
  }
}

/** Erro em linha do campo do nome do projeto (H-BUG-20): só depois de a pessoa digitar. */
export function projectNameError(values: WizardValues): { reason: string; suggestion: string | null } | null {
  const name = text(values.projectName);
  if (name === "") return null;
  const check = validateProjectName(name);
  return check.ok ? null : { reason: check.reason, suggestion: check.suggestion };
}

/**
 * Texto do `validationError` do host para a pessoa: o motivo, sem o nome
 * interno do campo. O nome do projeto usa a regra em português; o genérico do
 * zod ("Invalid", "Required") vira frase.
 */
export function hostErrorText(key: string, message: string | undefined, values: WizardValues): string {
  if (key === "projectName") {
    const check = validateProjectName(text(values.projectName).trim());
    if (!check.ok) return check.reason;
  }
  const reason = (message ?? "").trim();
  if (reason === "" || reason === "Invalid") return "Valor inválido.";
  if (reason === "Required") return "Campo obrigatório.";
  return reason;
}

/** Tela que coleta o campo recusado pelo host; `-1` se nenhuma. */
export function screenIndexOfField(journey: readonly JourneyScreen[], key: string): number {
  return journey.findIndex((screen) => screen.fields.includes(key));
}

/** Escolhas de que a prévia depende (o manifest local sai delas): trocar qualquer uma a invalida (H-BUG-25). */
const PREVIEW_INPUTS = ["projectName", "backendStack", "frontendStack", "hostAdapter", "cloud"] as const;
export const previewSignature = (values: WizardValues): string => JSON.stringify(PREVIEW_INPUTS.map((key) => values[key] ?? null));
export const previewTemplateId = (templatePrefix: string, values: WizardValues): string => templatePrefix + (text(values.backendStack) || "python-api");

/**
 * Tela em que o painel reabre (GAP-20): a salva, se existe nesta jornada, e
 * nunca além da primeira tela com pendência. Sem tela salva: depois da escolha
 * do modo se o host já trocou de modo, senão a abertura.
 */
export function startScreen(journey: readonly JourneyScreen[], values: WizardValues, ctx: JourneyContext, saved: string | undefined, modeChosen: boolean): number {
  const savedIndex = saved === undefined ? -1 : journey.findIndex((screen) => screen.id === saved);
  const wanted = savedIndex >= 0 ? savedIndex : modeChosen ? FIRST_SCREEN_AFTER_MODE : 0;
  for (let i = 0; i < wanted; i++) {
    if (screenIssue(journey[i]!, values, ctx) !== null) return i;
  }
  return wanted;
}

// ── Revisão ────────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  copilot: "GitHub Copilot", claude: "Claude Code",
  "python-agentic": "Python Agentic", "python-api": "Python FastAPI", "java-spring": "Java Spring Boot", "dotnet-core": ".NET 8", "react-vite": "React + Vite", flutter: "Flutter",
  "android-compose": "Android Compose", "ios-swiftui": "iOS SwiftUI", none: "Nenhum",
  postgresql: "PostgreSQL", mysql: "MySQL / MariaDB", mongodb: "MongoDB", sqlite: "SQLite", gcp: "Google Cloud", aws: "AWS", azure: "Azure",
  "github-actions": "GitHub Actions", "gitlab-ci": "GitLab CI/CD", jenkins: "Jenkins",
  fintech: "FinTech", healthtech: "HealthTech", edtech: "EdTech", marketplace: "Marketplace", "developer-tools": "Dev Tools", "ai-native": "AI Native", ecommerce: "E-commerce", logistics: "Logística", other: "Outro",
  hexagonal: "Hexagonal", "vertical-slice": "Vertical Slice", layered: "Em camadas", "ddd-tactical": "DDD tático", "feature-based": "Por feature", "clean-frontend": "Clean", mvvm: "MVVM", mvc: "MVC",
  "dora-4keys": "DORA 4 Keys", "tech-radar": "Tech Radar", "spotify-health": "Spotify Squad Health", "dora-capabilities": "DORA 24 Capabilities", "owasp-samm": "OWASP SAMM", "owasp-asvs": "OWASP ASVS", "iso-25010": "ISO/IEC 25010", "space-devex": "SPACE DevEx", cmmi: "CMMI", bsimm: "BSIMM",
};

export const labelOf = (value: unknown): string => LABELS[String(value)] ?? String(value);

export interface ReviewRow {
  label: string;
  value: string;
}

export interface ReviewModel {
  rows: ReviewRow[];
  /** Pasta de destino, já resolvida, e como ela nasce. */
  destination: { path: string; note: string | null };
  /** O que será escrito, uma linha por grupo, com o caminho em código. */
  writes: Array<{ what: string; where: string }>;
  /** O que a Jataí não faz (as promessas da abertura que valem para este modo). */
  wont: string[];
}

/** Junta a pasta e o nome com o separador que a pasta já usa (`/` ou `\`). */
export function joinPath(base: string, name: string): string {
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base.endsWith(sep) ? `${base}${name}` : `${base}${sep}${name}`;
}

/** Onde o projeto novo nasce: a pasta escolhida, senão uma subpasta da pasta aberta (como o gerador resolve). */
export function greenfieldDestination(values: WizardValues, workspace: Workspace): { path: string; note: string | null } {
  const chosen = text(values.targetDirectory).trim();
  if (chosen !== "") return { path: chosen, note: "A pasta que você escolheu." };
  const name = text(values.projectName) || "projeto";
  if (workspace.folder !== null) return { path: joinPath(workspace.folder, name), note: "Uma pasta nova dentro da pasta aberta." };
  return { path: "", note: null };
}

export function reviewModel(mode: Mode, values: WizardValues, workspace: Workspace): ReviewModel {
  const host = (text(values.hostAdapter) || "copilot") as "claude" | "copilot";
  const facts = HARNESS_FACTS[host];
  const common = [
    { what: "Agentes, com o de entrada", where: facts.entryFile },
    { what: "Skills", where: facts.skills },
    { what: "Instruções", where: facts.instructions.join(" e ") },
    { what: "Servidor MCP", where: facts.mcp },
    ...(facts.hooks ? [{ what: "Hooks do Claude Code", where: facts.hooks.join(" e ") }] : []),
    { what: "Estado e scripts", where: `${COMMON_FACTS.state} e ${COMMON_FACTS.scripts}` },
  ];
  const wont = ["Enviar dados para fora do seu computador.", "Escrever qualquer arquivo antes de você confirmar."];
  if (mode === "brownfield") {
    const maturity = Array.isArray(values.maturityFrameworks) ? (values.maturityFrameworks as string[]) : [];
    return {
      rows: [
        { label: "Modo", value: "Projeto existente" },
        { label: "Harness", value: facts.label },
        { label: "Frameworks de maturidade", value: (maturity.length > 0 ? maturity : ["dora-4keys"]).map(labelOf).join(", ") },
      ],
      destination: { path: text(values.targetDirectory).trim(), note: "O workspace, que precisa estar vazio." },
      writes: [...common, { what: "Configuração do workspace", where: BRAND.files.config }, { what: "Repositórios (entram depois)", where: "repos/" }],
      wont: ["Alterar os repositórios que você já tem.", ...wont],
    };
  }
  const frontend = text(values.frontendStack);
  const rows: ReviewRow[] = [
    { label: "Modo", value: "Projeto novo" },
    { label: "Harness", value: facts.label },
    { label: "Projeto", value: text(values.projectName) },
    { label: "Domínio", value: labelOf(values.domain) },
    { label: "Backend", value: `${labelOf(values.backendStack)} · ${labelOf(values.backendArchitecture)}` },
    { label: "Frontend", value: frontend === "none" || frontend === "" ? "Somente backend" : `${labelOf(frontend)} · ${labelOf(values.frontendArchitecture)}` },
    { label: "Banco, nuvem e pipeline", value: [values.database, values.cloud, values.cicd].map(labelOf).join(" · ") },
  ];
  return {
    rows,
    destination: greenfieldDestination(values, workspace),
    writes: [...common, { what: "Código, API e infraestrutura", where: "code/, api/, infrastructure/ e pipelines/" }, { what: "Documentação e cenários", where: "docs/ e features/" }],
    wont,
  };
}

export const REPOSITORIES_LINES = [REPOSITORIES_COPY.ask, REPOSITORIES_COPY.where, REPOSITORIES_COPY.alone] as const;

// ── Teclado ───────────────────────────────────────────────────────────────

/** Para onde as setas levam num grupo de opções de escolha única (com volta ao outro extremo, Home e End). */
export function nextRadioIndex(count: number, current: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export type KeyIntent = "next" | "back" | null;
export type KeyTarget = "text" | "textarea" | "radio" | "button" | "other";

/**
 * O que Enter e Esc fazem na jornada: Enter avança (no campo de texto e no
 * grupo de opções; num botão, vale o do botão; na área de texto só com Ctrl ou
 * Cmd, porque Enter ali é quebra de linha) e Esc volta. Alt/Ctrl/Meta em Esc
 * não contam.
 */
export function keyIntent(event: { key: string; target: KeyTarget; ctrlKey?: boolean; metaKey?: boolean }): KeyIntent {
  if (event.key === "Escape") return "back";
  if (event.key !== "Enter") return null;
  if (event.target === "button") return null;
  if (event.target === "textarea") return event.ctrlKey || event.metaKey ? "next" : null;
  return "next";
}
