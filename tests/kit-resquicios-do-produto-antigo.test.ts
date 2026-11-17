import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Resquícios do produto antigo no kit (F2.3, segunda passada; onda 5b).
 *
 * O kit que a Jataí instala nos projetos das pessoas nasceu na plataforma
 * Helyx/Helix, com backend, portal e registry de templates. Ele chegou a
 * afirmar, num arquivo que vai para o repositório do usuário, que a extensão
 * envia eventos a um servidor. A Jataí não envia dado nenhum para fora (ADR-0015),
 * e uma afirmação dessas, falsa, é pior do que um erro de digitação.
 *
 * Este teste varre o kit (`kit/content`, `kit/variants`) e os textos gerados
 * (`src/generator/content`) atrás de uma lista pequena de padrões do produto
 * antigo. Os padrões ficam em texto claro de propósito: são termos genéricos do
 * produto antigo, não dado de cliente.
 *
 * Um uso legítimo do termo entra em `permitidos`, com o motivo, e uma entrada
 * que deixou de casar reprova, para a lista não sobrar.
 */

const PKG_ROOT = path.resolve(__dirname, "..");
const KIT_DIRS = ["kit/content", "kit/variants"];
const GERADOS_DIR = "src/generator/content";
const TEXTO = new Set([".md", ".yaml", ".yml", ".json", ".txt"]);

interface Rule {
  id: string;
  pattern: RegExp;
  /** O que o padrão acusa, para a mensagem de falha. */
  motivo: string;
  /** Vale também para os textos gerados em `src/generator/content` (o padrão não pode aparecer em comentário de código). */
  gerados?: boolean;
  /** Usos legítimos: caminho (ou prefixo de pasta, terminado em `/`) → o motivo. */
  permitidos?: Record<string, string>;
  /** A regra só vale para estes arquivos (caminho relativo ao pacote), quando o termo é legítimo no resto do kit. */
  somente?: string[];
}

const RULES: Rule[] = [
  { id: "backend-saas", pattern: /Backend SaaS/i, motivo: "o backend do produto antigo; a Jataí não tem backend", gerados: true },
  { id: "plugin-envia", pattern: /\bplugin\b[^\n]{0,60}\benvia/i, motivo: "afirma que o plugin envia dados", gerados: true },
  {
    id: "endpoint-de-ingestao",
    pattern: /POST\s+\/api\/v\d+\/|\(async POST\)|fire-and-forget|\/runs\/events|telemetria ingest/i,
    motivo: "o endpoint de ingestão de eventos do produto antigo",
    gerados: true,
  },
  {
    id: "portal-do-produto",
    pattern: /Portal (Web|Admin)\b/,
    motivo: "o portal do produto antigo",
    gerados: true,
    permitidos: { "kit/content/skills/openapi-governance/SKILL.md": 'exemplo genérico de C4 e de sequência (carrinho e cupom): "Portal Web" é um container fictício' },
  },
  {
    id: "adr-do-produto",
    pattern: /\bADR-(?!0000\b)\d{4}\b|\.\.\/docs\/adr\//,
    motivo: "número de ADR (ou link para ADR) que o projeto do usuário não tem",
    permitidos: { "kit/content/docs/adr/": "o próprio ADR de exemplo, que o kit instala" },
  },
  { id: "helix", pattern: /helix/i, motivo: "o nome antigo da plataforma", gerados: true },
  {
    id: "nome-antigo-do-kit",
    pattern: /AI-SDK|AI Software Delivery/,
    motivo: "o primeiro nome do kit, que o catálogo público não deve repetir (o arquivo ai-sdk.config.yaml, em minúsculas, é nome de arquivo legado do greenfield)",
    gerados: true,
  },
  {
    id: "bcs-do-produto-antigo",
    pattern: /template-registry|connector-management|TemplateCache|StackTemplate|ConnectorAction|ObservabilityPipeline|agent-orchestration|project-setup/,
    motivo: "contextos e agregados da plataforma antiga",
    gerados: true,
  },
  { id: "registry-de-templates", pattern: /code\/templates|\.helix\//i, motivo: "o registry de templates da plataforma antiga; a Jataí não tem registry", gerados: true },
  { id: "modo-online", pattern: /Modo Online|kb push|helyx-cloud|\bhlx_/i, motivo: "o Modo Online e as chaves de API do produto antigo", gerados: true },
  {
    // O produto chama a tela da extensão de Cockpit. "Dashboard" continua valendo como exemplo de tela do produto de quem usa
    // o kit (ux-designer, ux-prototyping) e como painel de observabilidade (OpenTelemetry), por isso só estes arquivos entram.
    id: "dashboard-da-tela",
    pattern: /dashboard/i,
    motivo: 'a tela da extensão se chama Cockpit, não "dashboard"',
    somente: [
      "kit/content/AGENTS.md",
      "kit/content/agents/discovery/assessor.agent.md",
      "kit/content/agents/discovery/domain-extractor.agent.md",
      "kit/content/agents/upstream/sprint-planner.agent.md",
      "kit/content/skills/workspace-tools/SKILL.md",
    ],
  },
  {
    id: "iniciativas-do-produto-antigo",
    pattern: /mod-state-service|mod-delivery-hierarchy|mod-missao|sprint-backlog-platform|agentic-flow\.md/,
    motivo: "iniciativa ou arquivo do workspace do produto antigo, que o projeto do usuário não tem",
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (TEXTO.has(path.extname(entry.name))) out.push(full);
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return out;
}

const rel = (file: string): string => path.relative(PKG_ROOT, file).split(path.sep).join("/");

const KIT_FILES = KIT_DIRS.flatMap((d) => walk(path.join(PKG_ROOT, d))).map(rel).sort();
const GERADOS = fs.readdirSync(path.join(PKG_ROOT, GERADOS_DIR)).filter((f) => f.endsWith(".ts")).map((f) => `${GERADOS_DIR}/${f}`).sort();

/** Linhas (1-based) de cada arquivo em que o padrão aparece. */
function hits(rule: Rule): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const files = rule.somente ?? (rule.gerados ? [...KIT_FILES, ...GERADOS] : KIT_FILES);
  for (const file of files) {
    const lines = fs.readFileSync(path.join(PKG_ROOT, file), "utf-8").split(/\r?\n/);
    const found = lines.flatMap((line, i) => (rule.pattern.test(line) ? [i + 1] : []));
    if (found.length > 0) out.set(file, found);
  }
  return out;
}

function isPermitted(rule: Rule, file: string): boolean {
  return Object.keys(rule.permitidos ?? {}).some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));
}

describe("o kit não carrega resquícios do produto antigo", () => {
  it("varre o kit e os textos gerados (sanidade: há arquivos para varrer)", () => {
    expect(KIT_FILES.length).toBeGreaterThan(100);
    expect(GERADOS.length).toBeGreaterThan(5);
  });

  it.each(RULES)("REGRESSÃO: sem $id — $motivo", (rule) => {
    const novos = [...hits(rule)]
      .filter(([file]) => !isPermitted(rule, file))
      .map(([file, lines]) => `${file}:${lines.join(",")}`);
    expect(novos, `${rule.id}: ${rule.motivo}`).toEqual([]);
  });

  describe("o registro de atividade diz o que a Jataí faz de verdade (ADR-0015)", () => {
    const read = (file: string): string => fs.readFileSync(path.join(PKG_ROOT, file), "utf-8");
    const flow = read("kit/content/docs/delivery-flow.md");
    const secao = flow.slice(flow.indexOf("## Registro de atividade do delivery"));
    const chatmode = read("kit/variants/greenfield/chatmodes/maestro.chatmode.md");
    const chatSecao = chatmode.slice(chatmode.indexOf("## Registro de atividade"));

    it("o delivery-flow diz que os eventos ficam na máquina e fora do git, e que nada é enviado", () => {
      expect(secao.startsWith("## Registro de atividade do delivery")).toBe(true);
      expect(secao).toMatch(/\.github\/artifacts\/runs\/\*\.jsonl/);
      expect(secao).toMatch(/na sua máquina/);
      expect(secao).toMatch(/\.gitignore/);
      expect(secao).toMatch(/não envia nenhum deles para fora/);
    });

    it("o delivery-flow diz quem grava: o estado, os agentes pelo CLI, os hooks do Claude Code e o observador do Copilot", () => {
      expect(secao).toMatch(/Toda mudança feita pelo CLI/);
      expect(secao).toMatch(/runs append/);
      expect(secao).toMatch(/\.claude\/settings\.json/);
      expect(secao).toMatch(/observador de `\.github\/artifacts\/`/);
    });

    it("o chatmode greenfield manda registrar pelo CLI, sem escrever o .jsonl à mão e sem eventos de decisão humana", () => {
      expect(chatSecao.startsWith("## Registro de atividade")).toBe(true);
      expect(chatSecao).toMatch(/runs append/);
      expect(chatSecao).toMatch(/nunca escreva o `\.jsonl` à mão/);
      expect(chatSecao).toMatch(/\*\*Nunca\*\* registre `gate-approved`, `item-approved` nem `decision-made`/);
    });
  });

  describe("os agentes de operation do brownfield se explicam sozinhos", () => {
    const read = (file: string): string => fs.readFileSync(path.join(PKG_ROOT, file), "utf-8");

    it.each(["devops", "incident", "observability", "sustain"])("REGRESSÃO: %s explica por que Operation não é uma fase de iniciativa, sem apontar para um ADR", (name) => {
      const text = read(`kit/variants/brownfield/agents/operation/${name}.agent.md`);
      const heading = "## Por que Operation não é uma fase de iniciativa\n";
      const at = text.indexOf(heading);
      expect(at, "a seção existe, com o título sem número de ADR").toBeGreaterThanOrEqual(0);
      const razao = text.slice(at + heading.length).split(/\n## /)[0]!.trim();
      expect(razao.length, "a razão está escrita ali").toBeGreaterThan(120);
      expect(text).toMatch(/atualizado — é o que o painel de Operações lê, porque Operation é contínua e não uma fase de iniciativa/);
    });
  });

  it("cada uso permitido ainda existe (a lista não sobra)", () => {
    const sobra = RULES.flatMap((rule) =>
      Object.keys(rule.permitidos ?? {})
        .filter((p) => ![...hits(rule).keys()].some((file) => (p.endsWith("/") ? file.startsWith(p) : file === p)))
        .map((p) => `${rule.id}: ${p}`)
    );
    expect(sobra).toEqual([]);
  });
});
