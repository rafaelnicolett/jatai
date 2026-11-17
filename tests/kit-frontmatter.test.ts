import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { renderBrandPlaceholders } from "../src/data/brand.pure";

/**
 * A17 (F3.5, ADR-0018): o frontmatter do kit é lido pelos harnesses. O Claude
 * Code só registra subagente com `name` e `description`, e skill com YAML
 * válido; o Copilot usa a `description` para escolher o agente. Antes, 75 de
 * 77 agentes não tinham `description` e 8 `SKILL.md` tinham YAML inválido.
 *
 * Lê a fonte única (`kit/`), renderizada como o gerador instala.
 */

const KIT = path.resolve(__dirname, "../kit");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function frontmatter(file: string): { fm: Record<string, unknown> | null; error: string | null } {
  const text = renderBrandPlaceholders(fs.readFileSync(file, "utf-8"));
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { fm: null, error: "sem frontmatter" };
  try {
    const fm = yaml.load(m[1]!);
    return fm && typeof fm === "object" ? { fm: fm as Record<string, unknown>, error: null } : { fm: null, error: "frontmatter vazio" };
  } catch (err) {
    return { fm: null, error: (err as Error).message.split("\n")[0]! };
  }
}

const rel = (f: string): string => path.relative(KIT, f).split(path.sep).join("/");
const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

describe("REGRESSÃO: A17 — frontmatter do kit que os harnesses leem", () => {
  const files = walk(KIT);
  const agents = files.filter((f) => f.endsWith(".agent.md"));
  const skills = files.filter((f) => path.basename(f) === "SKILL.md");

  it("sanidade: o kit tem agentes e skills", () => {
    expect(agents.length).toBeGreaterThan(40);
    expect(skills.length).toBeGreaterThan(50);
  });

  it("todo agente tem YAML válido, name e description", () => {
    const problems = agents.flatMap((f) => {
      const { fm, error } = frontmatter(f);
      if (error) return [`${rel(f)}: ${error}`];
      return [
        ...(nonEmpty(fm!.name) ? [] : [`${rel(f)}: sem name`]),
        ...(nonEmpty(fm!.description) ? [] : [`${rel(f)}: sem description`]),
      ];
    });
    expect(problems).toEqual([]);
  });

  it("todo agente de fase tem name igual ao id (o nome que o harness registra)", () => {
    const problems = agents.flatMap((f) => {
      const { fm } = frontmatter(f);
      return fm && typeof fm.id === "string" && fm.name !== fm.id ? [`${rel(f)}: name ${String(fm.name)} ≠ id ${fm.id}`] : [];
    });
    expect(problems).toEqual([]);
  });

  // Achado da regra de CI do kit (F3.5): um item de lista com ": " sem aspas é
  // YAML válido, mas vira um mapa ({ "A11y": "sem violations críticas" }), e
  // quem lê o frontmatter como YAML recebe um objeto no lugar do texto.
  it("REGRESSÃO: as listas do frontmatter só têm texto (item com ': ' sem aspas vira mapa)", () => {
    const LISTS = ["exit_contract", "guard_rails", "applicable_to", "uses_skills", "receives_from", "delivers_to", "escalates_to"];
    const problems = [...agents, ...skills].flatMap((f) => {
      const { fm } = frontmatter(f);
      if (!fm) return [];
      return LISTS.flatMap((key) => (Array.isArray(fm[key]) ? (fm[key] as unknown[]) : []).flatMap((item, i) => (typeof item === "string" ? [] : [`${rel(f)}: ${key}[${i}] é ${JSON.stringify(item)}`])));
    });
    expect(problems).toEqual([]);
  });

  it("toda SKILL.md tem YAML válido, name igual à pasta e description", () => {
    const problems = skills.flatMap((f) => {
      const id = path.basename(path.dirname(f));
      const { fm, error } = frontmatter(f);
      if (error) return [`${rel(f)}: ${error}`];
      return [
        ...(fm!.name === id ? [] : [`${rel(f)}: name ${String(fm!.name)} ≠ ${id}`]),
        ...(nonEmpty(fm!.description) ? [] : [`${rel(f)}: sem description`]),
      ];
    });
    expect(problems).toEqual([]);
  });
});
