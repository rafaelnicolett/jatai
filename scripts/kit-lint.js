#!/usr/bin/env node
/**
 * kit-lint.js: regras de CI do kit de agentes (ADR-0018, F3.5)
 *
 * Valida cada edição do kit (o que `kit/kit.manifest.yaml` manda para
 * `templates/` e `brownfield-templates/`), com o arquivo renderizado como o
 * gerador instala (`{{brand.*}}` resolvido):
 *
 *   1. YAML válido no frontmatter de todo `*.agent.md` e `SKILL.md`;
 *   2. JSON Schema: `kit/schema/agent.schema.json` e `kit/schema/skill.schema.json`
 *      (`name` e `description` obrigatórios);
 *   3. `name` = `id` nos agentes de fase; `name` = pasta nas skills;
 *   4. referências resolvidas por edição: `uses_skills` aponta para skill
 *      empacotada na mesma edição; `receives_from`, `delivers_to`,
 *      `escalates_to` e `loop_with` apontam para agente da mesma edição.
 *
 * Roda dentro do `copy-templates.js` (passo "Kit (validação)" do build, do CI
 * e do ci:local) e sozinho: `node scripts/kit-lint.js`.
 *
 * O validador de JSON Schema é mínimo e sem dependência: aceita `type`,
 * `required`, `properties`, `additionalProperties` (booleano), `items`,
 * `enum`, `pattern`, `minLength` e as anotações (`$schema`, `$id`, `title`,
 * `description`). Palavra-chave fora disso reprova o próprio schema, para ele
 * nunca prometer uma regra que ninguém confere.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const kit = require("./kit");

const PKG_ROOT = path.resolve(__dirname, "..");
const SCHEMA_DIR = path.join(kit.KIT_ROOT, "schema");
const BRAND = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "src/data/brand.json"), "utf-8"));

// ── Referências que não são id de agente ─────────────────────────────────────
/** O orquestrador: nome do kit (`maestro`), da marca atual e das anteriores (ADR-0018). */
const ORCHESTRATOR_ALIASES = new Set(["maestro", BRAND.name, ...BRAND.legacy.names]);
/** Alvos que não são agente: o gate de fronteira de stream e a stack escolhida no Wizard. */
const PSEUDO_TARGETS = [/^gate\./, /^(backend|frontend)-stack$/];
/** Skills que o assessment gera por repositório (não existem no pacote). */
const RUNTIME_SKILL = [/^(coding-guidelines|design-system)-/];

/**
 * Referências quebradas conhecidas, cada uma com o motivo. Uma entrada que
 * deixa de acontecer reprova (entrada obsoleta), como no brand-lint. Corrigir
 * a referência é decisão de conteúdo (quem faz o papel no brownfield).
 *
 * Vazia desde a onda 5 (F3.5): as 16 da onda 4 foram corrigidas no kit, uma
 * causa por commit (`product`, `sprint-runner` e `reviewer` no brownfield;
 * `project-coding-guidelines` no greenfield).
 */
const KNOWN_BROKEN = {};

// ── JSON Schema mínimo ───────────────────────────────────────────────────────
const SUPPORTED = new Set(["$schema", "$id", "title", "description", "type", "required", "properties", "additionalProperties", "items", "enum", "pattern", "minLength"]);

function schemaProblems(schema, where = "#") {
  const out = [];
  for (const key of Object.keys(schema)) if (!SUPPORTED.has(key)) out.push(`${where}: palavra-chave não suportada: ${key}`);
  for (const [k, sub] of Object.entries(schema.properties ?? {})) out.push(...schemaProblems(sub, `${where}/properties/${k}`));
  if (schema.items) out.push(...schemaProblems(schema.items, `${where}/items`));
  return out;
}

function typeOf(v) {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

function validate(value, schema, where = "") {
  const out = [];
  const at = where || "(raiz)";
  if (schema.type) {
    const t = typeOf(value);
    const ok = schema.type === t || (schema.type === "number" && t === "integer");
    if (!ok) return [`${at}: esperava ${schema.type}, veio ${t}`];
  }
  if (schema.enum && !schema.enum.includes(value)) out.push(`${at}: ${JSON.stringify(value)} fora de ${JSON.stringify(schema.enum)}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) out.push(`${at}: menor que ${schema.minLength} caractere(s)`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${at}: não casa ${schema.pattern}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, i) => out.push(...validate(item, schema.items, `${where}[${i}]`)));
  if (typeOf(value) === "object") {
    for (const req of schema.required ?? []) if (!(req in value)) out.push(`${at}: falta ${req}`);
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k];
      if (sub) out.push(...validate(v, sub, where ? `${where}.${k}` : k));
      else if (schema.additionalProperties === false) out.push(`${at}: chave não prevista no schema: ${k}`);
    }
  }
  return out;
}

// ── Leitura do kit ───────────────────────────────────────────────────────────
function render(text) {
  return text.replace(/\{\{brand\.([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\}\}/g, (m, p) => {
    const v = p.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), BRAND);
    return typeof v === "string" ? v : m;
  });
}

function frontmatter(file) {
  const m = render(fs.readFileSync(file, "utf-8")).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { error: "sem frontmatter" };
  try {
    const fm = yaml.load(m[1]);
    return fm && typeof fm === "object" ? { fm } : { error: "frontmatter vazio" };
  } catch (err) {
    return { error: `YAML inválido: ${err.message.split("\n")[0]}` };
  }
}

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), "utf-8"));
}

function matchesRef(ref, ids) {
  if (ORCHESTRATOR_ALIASES.has(ref) || PSEUDO_TARGETS.some((r) => r.test(ref))) return true;
  if (ref.includes("*")) {
    const re = new RegExp(`^${ref.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
    return [...ids].some((id) => re.test(id));
  }
  return ids.has(ref);
}

/** Todos os problemas do kit (vazio = limpo). */
function lintKit() {
  const agentSchema = loadSchema("agent.schema.json");
  const skillSchema = loadSchema("skill.schema.json");
  const problems = [...schemaProblems(agentSchema, "agent.schema.json"), ...schemaProblems(skillSchema, "skill.schema.json")];
  const brokenSeen = new Set();

  for (const edition of kit.editions()) {
    problems.push(...edition.problems);
    const agents = [];
    const skills = new Set();
    for (const [rel, src] of edition.plan) {
      const isAgent = rel.endsWith(".agent.md");
      const isSkill = path.posix.basename(rel) === "SKILL.md";
      if (!isAgent && !isSkill) continue;
      const label = `${edition.name} ${rel}`;
      const { fm, error } = frontmatter(src);
      if (error) {
        problems.push(`${label}: ${error}`);
        continue;
      }
      problems.push(...validate(fm, isAgent ? agentSchema : skillSchema).map((p) => `${label}: ${p}`));
      if (isAgent) {
        if (typeof fm.id === "string" && fm.name !== fm.id) problems.push(`${label}: name (${fm.name}) diferente do id (${fm.id})`);
        agents.push({ rel, fm });
      } else {
        const id = path.posix.basename(path.posix.dirname(rel));
        if (fm.name !== id) problems.push(`${label}: name (${fm.name}) diferente da pasta (${id})`);
        skills.add(id);
      }
    }

    const ids = new Set(agents.map((a) => a.fm.id).filter((id) => typeof id === "string"));
    for (const { rel, fm } of agents) {
      const refs = [];
      for (const key of ["receives_from", "delivers_to", "escalates_to", "loop_with"]) {
        for (const ref of [].concat(fm[key] ?? [])) {
          const id = String(ref).replace(/^@/, "");
          if (!matchesRef(id, ids)) refs.push(`${key} → ${id}`);
        }
      }
      for (const skill of Array.isArray(fm.uses_skills) ? fm.uses_skills : []) {
        if (skill.includes("<") || RUNTIME_SKILL.some((r) => r.test(skill)) || skills.has(skill)) continue;
        refs.push(`uses_skills → ${skill}`);
      }
      for (const ref of refs) {
        const key = `${edition.name} ${rel} ${ref}`;
        if (KNOWN_BROKEN[key]) brokenSeen.add(key);
        else problems.push(`${key}: referência não resolvida nesta edição`);
      }
    }
  }
  for (const key of Object.keys(KNOWN_BROKEN)) {
    if (!brokenSeen.has(key)) problems.push(`KNOWN_BROKEN obsoleta (não acontece mais; tire de scripts/kit-lint.js): ${key}`);
  }
  return { problems, knownBroken: brokenSeen.size };
}

module.exports = { lintKit, validate, schemaProblems, KNOWN_BROKEN };

if (require.main === module) {
  const { problems, knownBroken } = lintKit();
  if (problems.length > 0) {
    console.error(`kit-lint: ${problems.length} problema(s)`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`kit-lint: frontmatter e referências do kit válidos (${knownBroken} referência(s) quebrada(s) conhecida(s), em KNOWN_BROKEN)`);
}
