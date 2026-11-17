import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { BRAND } from "../src/core/brand/brand.pure";
import { WizardStateSchema } from "../src/types";

/**
 * O que o kit diz sobre a estrutura do projeto e sobre o CLI tem de bater com o
 * que o gerador e o CLI fazem de verdade (F2.3, segunda passada; onda 5b).
 *
 * A skill `workspace-tools` descrevia a hierarquia da plataforma antiga
 * (`code/templates/`, `helix-template.yaml`) e dizia que as gates e os eventos
 * "ainda não têm comando dedicado". Aqui a hierarquia dela é conferida contra
 * as árvores do golden do gerador, e os verbos que ela lista, contra os que o
 * CLI do kit aceita.
 */

const PKG_ROOT = path.resolve(__dirname, "..");
const kit = createRequire(import.meta.url)("../scripts/kit.js") as { editions(): Array<{ name: string; plan: Map<string, string> }> };
const GOLDEN = path.join(PKG_ROOT, "tests/golden/__golden__/generator");
const CLI = path.join(PKG_ROOT, "kit/scripts", BRAND.files.cli);
const read = (rel: string): string => fs.readFileSync(path.join(PKG_ROOT, rel), "utf-8");

const WORKSPACE_TOOLS = read("kit/content/skills/workspace-tools/SKILL.md");

function section(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + from.length);
  expect(start, `seção "${from}" existe`).toBeGreaterThanOrEqual(0);
  return text.slice(start, end === -1 ? undefined : end);
}

/** Os caminhos da árvore do bloco de código da §1 (`├──`, `└──`), um por linha. */
function hierarchyPaths(): string[] {
  const block = /```\n([\s\S]*?)```/.exec(section(WORKSPACE_TOOLS, "## 1. Hierarquia", "## 2."))![1]!;
  const stack: string[] = [];
  const paths: string[] = [];
  for (const line of block.split("\n")) {
    const m = /^((?:│   |    )*)(?:├── |└── )(\S+)/.exec(line);
    if (!m) continue;
    const depth = m[1]!.length / 4;
    stack.length = depth;
    stack[depth] = m[2]!.replace(/\/$/, "");
    paths.push(stack.slice(0, depth + 1).join("/"));
  }
  return paths;
}

/** Todo caminho que algum caso greenfield do golden instala (sem o `projeto/` e sem o "/" dos diretórios). */
function installedByGreenfield(): Set<string> {
  const out = new Set<string>();
  for (const name of fs.readdirSync(GOLDEN).filter((n) => n.startsWith("greenfield"))) {
    const tree = JSON.parse(fs.readFileSync(path.join(GOLDEN, name, "tree.json"), "utf-8")) as { entries: Record<string, string> };
    for (const [key, value] of Object.entries(tree.entries)) {
      if (value === "absent" || !key.startsWith("projeto/")) continue;
      out.add(key.slice("projeto/".length).replace(/\/$/, ""));
    }
  }
  return out;
}

/** O CLI responde a um verbo desconhecido com a lista dos que existem ("Esperado: a, b, c."). */
function cliVerbs(artifact: string): string[] {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kit-verbs-"));
  try {
    execFileSync("node", [CLI, artifact, "verbo-que-nao-existe"], { cwd, env: { PATH: process.env.PATH ?? "", HOME: cwd }, encoding: "utf-8" });
    return [];
  } catch (err) {
    const { message } = JSON.parse(((err as { stdout?: string }).stdout ?? "{}").trim()).error as { message: string };
    return /Esperado: (.+)\.$/.exec(message)![1]!.split(", ").sort();
  }
}

/** Os verbos que a tabela "Os verbos do CLI" da §6 lista por artefato. */
function documentedVerbs(): Map<string, string[]> {
  const table = section(WORKSPACE_TOOLS, "Os verbos do CLI:", "### Os demais artefatos");
  const verbs = new Map<string, string[]>();
  for (const row of table.split("\n").filter((l) => /^\| `[a-z-]+` \|/.test(l))) {
    const [, artifact, names] = row.split("|").map((c) => c.trim());
    const list = [...names!.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!);
    verbs.set(artifact!.replace(/`/g, ""), [...(verbs.get(artifact!.replace(/`/g, "")) ?? []), ...list]);
  }
  return verbs;
}

describe("workspace-tools descreve o que o greenfield gera", () => {
  const installed = installedByGreenfield();

  it("sanidade: o golden traz os casos greenfield e as pastas de código", () => {
    expect(installed.has("code/services")).toBe(true);
    expect(installed.has("code/apps")).toBe(true);
  });

  it.each(hierarchyPaths())("REGRESSÃO: %s da hierarquia da §1 existe num projeto greenfield gerado", (p) => {
    const candidates = p.startsWith("<host-dir>") ? [p.replace("<host-dir>", ".github"), p.replace("<host-dir>", ".claude")] : [p];
    for (const candidate of candidates) {
      expect(installed.has(candidate), `${candidate} não existe em nenhum caso greenfield do golden`).toBe(true);
    }
  });

  it("não descreve registry, manifesto de template nem pasta de templates (a Jataí não tem)", () => {
    expect(WORKSPACE_TOOLS).not.toMatch(/helix|code\/templates|manifesto declarativo|SOMENTE o manifesto/i);
  });
});

describe("workspace-tools lista os verbos reais do CLI de estado", () => {
  it.each(["initiatives", "delivery-state", "gates", "runs"])("REGRESSÃO: os verbos de %s na tabela são exatamente os que o CLI aceita", (artifact) => {
    expect((documentedVerbs().get(artifact) ?? []).sort()).toEqual(cliVerbs(artifact));
  });

  it("deixa claro que gates approve é só de quem decide (humano) e que agente não o roda", () => {
    const row = WORKSPACE_TOOLS.split("\n").find((l) => /^\| `gates` \| `approve` \|/.test(l));
    expect(row, "linha de gates approve na tabela").toBeDefined();
    expect(row).toMatch(/só de quem decide \(humano\)/);
    expect(row).toMatch(/agente não roda este verbo/);
  });

  it("não diz mais que os eventos e as gates não têm comando", () => {
    expect(WORKSPACE_TOOLS).not.toMatch(/runs\/\*\.jsonl`?,?\s+gates\)\s*\n?\s*Ainda não têm|ainda não têm um comando/i);
    expect(section(WORKSPACE_TOOLS, "### Os demais artefatos", "## 7.")).not.toMatch(/runs\/\*\.jsonl/);
  });
});

describe("o guia de BDD (features/support/README.md) é do projeto, não da plataforma antiga", () => {
  const guide = read("kit/content/features/support/README.md");

  it("traz um runner para cada stack que o Wizard oferece", () => {
    const stacks = [...WizardStateSchema.shape.backendStack.options, ...WizardStateSchema.shape.frontendStack.removeDefault().options.filter((s) => s !== "none")];
    const semRunner = stacks.filter((stack) => !new RegExp(`\\| [^|\\n]*\`${stack}\`[^|\\n]* \\|`).test(guide));
    expect(semRunner).toEqual([]);
  });

  it("explica como organizar features/ e os steps, e os princípios dos step definitions", () => {
    expect(guide).toMatch(/features\/\n├── <bounded-context>\//);
    expect(guide).toMatch(/features\/support\/steps\//);
    expect(guide).toMatch(/## Princípios obrigatórios/);
    expect(guide).toMatch(/## Tags de seleção para CI/);
  });
});

describe("docs/adr/ que o greenfield instala", () => {
  const greenfield = kit.editions().find((e) => e.name === "greenfield")!;
  const adrFiles = [...greenfield.plan.keys()].filter((k) => k.startsWith("docs/adr/")).sort();
  const adr0001 = read("kit/content/docs/adr/0001-arquitetura-referencia-clean-hexagonal.md");
  const adrReadme = read("kit/content/docs/adr/README.md");

  it("instala o README e o ADR-0001, e nenhuma decisão da plataforma antiga", () => {
    expect(adrFiles).toEqual(["docs/adr/0001-arquitetura-referencia-clean-hexagonal.md", "docs/adr/README.md"]);
  });

  it("REGRESSÃO: o link do README do backend gerado aponta para um ADR que a edição instala", () => {
    const link = /docs\/adr\/(\d{4}-[a-z0-9-]+\.md)/.exec(read("src/generator/content/backend.ts"));
    expect(link, "o README do backend aponta para um ADR").not.toBeNull();
    expect(greenfield.plan.has(`docs/adr/${link![1]}`)).toBe(true);
  });

  it("o índice do README lista cada ADR da pasta, e cada link dele existe", () => {
    const linked = [...adrReadme.matchAll(/\[\d{4}\]\(([^)]+\.md)\)/g)].map((m) => `docs/adr/${m[1]}`).sort();
    const adrs = adrFiles.filter((f) => !f.endsWith("README.md"));
    expect(linked).toEqual(adrs);
  });

  it("o README explica o formato do ADR e que o @architecture registra aqui", () => {
    expect(adrReadme).toMatch(/## Formato/);
    expect(adrReadme).toMatch(/\*\*Status:\*\* proposed \| accepted \| deprecated \| superseded-by/);
    expect(adrReadme).toMatch(/`@architecture` registra aqui/);
  });

  it("o ADR-0001 segue o formato do README e traz a arquitetura de cada stack do Wizard", () => {
    expect(adr0001).toMatch(/^# ADR-0001 — /);
    for (const heading of ["**Status:**", "## Contexto", "## Decisão", "## Consequências"]) expect(adr0001).toContain(heading);
    const stacks = [...WizardStateSchema.shape.backendStack.options, ...WizardStateSchema.shape.frontendStack.removeDefault().options.filter((s) => s !== "none")];
    expect(stacks.filter((stack) => !adr0001.includes(`| \`${stack}\` |`))).toEqual([]);
  });
});

describe("routing-rules.md só cita skills que cada agente de fato usa", () => {
  const greenfield = kit.editions().find((e) => e.name === "greenfield")!;
  const table = section(read("kit/content/docs/routing-rules.md"), "## 7. Agente-fase", "## 8.");
  const rows = table.split("\n").filter((l) => /^\| `@[a-z-]+` \|/.test(l)).map((l) => {
    const [, agent, skills] = l.split("|").map((c) => c.trim());
    return { agent: agent!.replace(/[`@]/g, ""), skills: [...skills!.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!) };
  });

  /** `uses_skills` do agente na edição greenfield (o frontmatter renderizado, com a marca trocada por um valor qualquer). */
  function usesSkills(agent: string): string[] {
    const rel = [...greenfield.plan.keys()].find((k) => k.endsWith(`/${agent}.agent.md`));
    expect(rel, `o agente ${agent} existe na edição greenfield`).toBeDefined();
    const text = fs.readFileSync(greenfield.plan.get(rel!)!, "utf-8").replace(/\{\{[^}]+\}\}/g, "x");
    const fm = yaml.load(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)![1]!) as { uses_skills?: string[] };
    return fm.uses_skills ?? [];
  }

  it("a tabela tem linhas para ler", () => {
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it.each(rows.map((r) => [r.agent, r] as const))("REGRESSÃO: as skills de @%s na tabela existem e estão no uses_skills dele", (_agent, row) => {
    const declared = usesSkills(row.agent);
    for (const skill of row.skills) {
      expect(greenfield.plan.has(`skills/${skill}/SKILL.md`), `a skill ${skill} existe na edição greenfield`).toBe(true);
      expect(declared, `@${row.agent} declara ${skill}`).toContain(skill);
    }
  });
});

describe("skills/README.md lista só skills que a edição instala e não promete outras", () => {
  const greenfield = kit.editions().find((e) => e.name === "greenfield")!;
  const readme = read("kit/content/skills/README.md");

  it("REGRESSÃO: toda skill linkada no catálogo existe na edição greenfield", () => {
    const linked = [...readme.matchAll(/\]\(([a-z0-9-]+)\/SKILL\.md\)/g)].map((m) => m[1]!);
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((id) => !greenfield.plan.has(`skills/${id}/SKILL.md`))).toEqual([]);
  });

  it("REGRESSÃO: não tem uma seção de skills a criar (a lista antiga prometia skills que não existem)", () => {
    expect(readme).not.toMatch(/^## A criar/m);
  });

  it("os links de doc do README apontam para docs que o greenfield instala", () => {
    const docs = [...readme.matchAll(/\]\(\.\.\/\.\.\/(docs\/[a-z0-9-]+\.md)\)/g)].map((m) => m[1]!);
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.filter((d) => !greenfield.plan.has(d))).toEqual([]);
  });
});
