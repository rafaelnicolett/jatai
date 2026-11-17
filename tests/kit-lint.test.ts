import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

/**
 * Regras de CI do kit (F3.5, ADR-0018): JSON Schema do frontmatter de agente
 * e skill e referências resolvidas por edição. Roda no build e no CI dentro
 * do copy-templates.js; aqui ficam o kit real e o validador.
 */

const require_ = createRequire(import.meta.url);
const lint = require_("../scripts/kit-lint.js") as {
  lintKit(): { problems: string[]; knownBroken: number };
  validate(value: unknown, schema: unknown, where?: string): string[];
  schemaProblems(schema: unknown, where?: string): string[];
  KNOWN_BROKEN: Record<string, string>;
};

const SCHEMA_DIR = path.resolve(__dirname, "../kit/schema");
const agentSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "agent.schema.json"), "utf-8")) as Record<string, unknown>;
const skillSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "skill.schema.json"), "utf-8")) as Record<string, unknown>;

describe("kit-lint — o kit real", () => {
  it("as duas edições passam: YAML, schema, name e referências (fora as conhecidas, cada uma com motivo)", () => {
    const { problems, knownBroken } = lint.lintKit();
    expect(problems).toEqual([]);
    expect(knownBroken).toBe(Object.keys(lint.KNOWN_BROKEN).length);
    for (const [key, reason] of Object.entries(lint.KNOWN_BROKEN)) expect(reason.length, key).toBeGreaterThan(3);
  });

  it("os schemas só usam palavras-chave que o validador confere", () => {
    expect(lint.schemaProblems(agentSchema)).toEqual([]);
    expect(lint.schemaProblems(skillSchema)).toEqual([]);
    expect(lint.schemaProblems({ type: "object", oneOf: [] })).toEqual(["#: palavra-chave não suportada: oneOf"]);
  });
});

describe("kit-lint — validador de JSON Schema", () => {
  const ok = { id: "tech-mapper", name: "tech-mapper", description: "Discovery: inventário preciso da stack em uso.", uses_skills: ["tech-stack-detection"], token_budget: "low" };

  it("agente válido não tem problema", () => {
    expect(lint.validate(ok, agentSchema)).toEqual([]);
  });

  it("acusa description ausente, curta, chave fora do schema, enum, padrão e tipo de item", () => {
    const { description: _d, ...semDescription } = ok;
    expect(lint.validate(semDescription, agentSchema)).toEqual(["(raiz): falta description"]);
    expect(lint.validate({ ...ok, description: "curta" }, agentSchema)).toEqual(["description: menor que 20 caractere(s)"]);
    expect(lint.validate({ ...ok, tools: ["Bash"] }, agentSchema)).toEqual(["(raiz): chave não prevista no schema: tools"]);
    expect(lint.validate({ ...ok, token_budget: "enorme" }, agentSchema)).toEqual(['token_budget: "enorme" fora de ["low","medium","high"]']);
    expect(lint.validate({ ...ok, id: "Tech Mapper" }, agentSchema)).toEqual(["id: não casa ^[a-z0-9][a-z0-9-]*$"]);
    expect(lint.validate({ ...ok, uses_skills: [{ "x": "y" }] }, agentSchema)).toEqual(["uses_skills[0]: esperava string, veio object"]);
  });

  it("skill: type skill, name no padrão de pasta e description obrigatórios", () => {
    expect(lint.validate({ id: "bdd-gherkin", name: "bdd-gherkin", type: "skill", description: "Padrão de BDD e Gherkin do kit." }, skillSchema)).toEqual([]);
    expect(lint.validate({ id: "bdd-gherkin", type: "agente", description: "Padrão de BDD e Gherkin do kit." }, skillSchema)).toEqual([
      "(raiz): falta name",
      'type: "agente" fora de ["skill"]',
    ]);
  });
});
