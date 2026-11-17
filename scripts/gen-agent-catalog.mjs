#!/usr/bin/env node
/**
 * gen-agent-catalog.mjs: gera o catálogo público de agentes e skills em `docs/agentes/` (F7.2)
 *
 * A fonte é o frontmatter dos agentes e das skills de `kit/`, o mesmo que o
 * `scripts/kit-lint.js` valida. O que cada edição do kit recebe vem do
 * `kit/kit.manifest.yaml` (o mesmo plano que o `scripts/kit.js` usa para
 * materializar as edições), então o catálogo diz o que a Jataí de fato instala.
 * O texto `{{brand.*}}` é resolvido com o `src/data/brand.json`, como o
 * instalador faz, antes de o YAML ser lido.
 *
 * O que sai (tudo com a marca `Gerado por scripts/gen-agent-catalog.mjs` na primeira linha):
 *   - `README.md`  índice por stream, com o que cada agente faz e em que edição entra;
 *   - `<id>.md`    uma ficha por agente: o que faz, quando entra, skills, o que recebe,
 *                  o que produz, o contrato de saída e as regras de proteção;
 *   - `skills.md`  as skills por família, com a edição e quem as usa.
 * Um agente que existe nas duas edições com conteúdo diferente (os de Operação e o
 * orquestrador) tem uma seção por edição na mesma ficha.
 *
 * A saída é determinística: sem horário e sem caminho da máquina, em ordem fixa.
 *
 * Uso:
 *   node scripts/gen-agent-catalog.mjs                 grava docs/agentes/ (npm run docs:agents)
 *   node scripts/gen-agent-catalog.mjs --check         não grava: sai com 1 se docs/agentes/ divergir do kit
 *                                                      (npm run docs:agents:check; roda no ci.yml e no ci-local.sh)
 *   node scripts/gen-agent-catalog.mjs --kit <pasta> --out <pasta> --brand <brand.json>
 *                                                      outra raiz de kit, de saída ou de marca (os testes usam)
 *
 * Saída: exit 0 = ok; 1 = divergência (--check) ou kit ilegível; 2 = uso errado.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as yaml from "js-yaml";

const require = createRequire(import.meta.url);
const kitTools = require("./kit.js");
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Primeira linha de todo arquivo gerado. Só arquivo com esta marca é apagado quando sobra. */
export const GENERATED_MARK = "<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->";

export class CatalogError extends Error {}

// ── Vocabulário do catálogo ─────────────────────────────────────────────────

/** Os grupos do índice, na ordem. `streams: [null]` é o agente sem `stream` no frontmatter: o orquestrador. */
const GROUPS = [
  { title: "Ponto de entrada", streams: [null], intro: "O agente que você chama. Ele valida os pré-requisitos de cada fase e roteia para os outros; nunca executa trabalho de fase." },
  { title: "Descoberta (`discovery`)", streams: ["foundation", "discovery"], intro: "Só lê. Nenhum agente desta etapa muda código, dependência ou configuração; o gate D1 fecha a etapa." },
  { title: "Planejamento (`planning`)", streams: ["planning"], intro: "Decide o que mudar, em que ordem e por quê; o gate D2 fecha a etapa." },
  { title: "Execução (`execution`)", streams: ["execution"], intro: "Muda o código em passos pequenos e reversíveis, com a rede de testes pronta; o gate D3 fecha a etapa." },
  { title: "Operação (`operation`)", streams: ["operation"], intro: "Mantém o que já está em produção." },
  { title: "Upstream, para projetos novos (`upstream`)", streams: ["upstream"], intro: "Define o que construir antes de qualquer código." },
  { title: "Downstream, para projetos novos (`downstream`)", streams: ["downstream"], intro: "Constrói e valida o que o Upstream definiu." },
  { title: "Guardiões (`guardian`)", streams: ["guardian"], intro: "Entram só nos gates e validam de ponta a ponta. Não executam fase." },
  { title: "Side-cars (`sidecar`)", streams: ["sidecar"], intro: "Entram sob demanda, chamados por outro agente." },
];

const STREAM_LABELS = {
  foundation: "Descoberta (`foundation`)",
  discovery: "Descoberta (`discovery`)",
  planning: "Planejamento (`planning`)",
  execution: "Execução (`execution`)",
  operation: "Operação (`operation`)",
  upstream: "Upstream (`upstream`)",
  downstream: "Downstream (`downstream`)",
  guardian: "Guardião (`guardian`)",
  sidecar: "Side-car (`sidecar`)",
};

/** A edição que vem primeiro quando um agente tem uma seção por edição: a do projeto existente. */
const EDITION_ORDER = ["brownfield", "greenfield"];
const EDITION_LABELS = { brownfield: "projeto existente (brownfield)", greenfield: "projeto novo (greenfield)" };
const SCOPE_LABELS = { repo: "um repositório por vez (`repo`)", workspace: "o workspace inteiro (`workspace`)", context: "um contexto (`context`)" };
const BUDGET_LABELS = { low: "baixo", medium: "médio", high: "alto" };
const GATE_LABELS = { "gate.upstream_to_downstream": "G1, do Upstream para o Downstream", "gate.downstream_to_operation": "G2, do Downstream para a Operação" };

const SKILL_FAMILIES = [
  { prefix: "arch-", title: "Arquitetura (`arch-*`)" },
  { prefix: "lang-", title: "Linguagem e stack (`lang-*`)" },
  { prefix: "maturity-", title: "Maturidade do projeto (`maturity-*`)" },
];
const OTHER_SKILLS = "Método, qualidade e operação";

/** Skills que o assessment gera por repositório: não existem no kit, então não têm ficha. */
const RUNTIME_SKILL = /^(coding-guidelines|design-system)-|<[^>]+>/;

// ── Leitura do kit ──────────────────────────────────────────────────────────

const toPosix = (p) => p.split(path.sep).join("/");

/** Resolve `{{brand.a.b}}` como o instalador faz; o que não resolve fica como está. */
function renderBrand(text, brand) {
  return text.replace(/\{\{brand\.([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\}\}/g, (m, p) => {
    const v = p.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), brand);
    return typeof v === "string" ? v : m;
  });
}

function frontmatterOf(file, source, brand) {
  const raw = renderBrand(fs.readFileSync(file, "utf-8"), brand);
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new CatalogError(`${source}: sem frontmatter`);
  let fm;
  try {
    fm = yaml.load(match[1]);
  } catch (err) {
    throw new CatalogError(`${source}: frontmatter com YAML inválido (${String(err.message).split("\n")[0]})`);
  }
  if (!fm || typeof fm !== "object" || Array.isArray(fm)) throw new CatalogError(`${source}: frontmatter vazio ou que não é um mapa`);
  return fm;
}

const asList = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * Lê o kit: os agentes e as skills de cada edição, pelo plano do manifesto.
 * Devolve um registro por arquivo-fonte, com as edições que o recebem.
 */
export function readKit({ kitRoot, brand }) {
  const manifest = kitTools.loadManifest(path.join(kitRoot, "kit.manifest.yaml"));
  const editions = Object.keys(manifest.editions);
  const agentBySource = new Map();
  const skillBySource = new Map();

  for (const edition of editions) {
    const plan = kitTools.planEdition(manifest, edition, kitRoot);
    if (plan.problems.length > 0) throw new CatalogError(`kit.manifest.yaml: ${plan.problems.join("; ")}`);
    for (const [dest, file] of plan.plan) {
      const isAgent = dest.endsWith(".agent.md");
      const isSkill = path.posix.basename(dest) === "SKILL.md";
      if (!isAgent && !isSkill) continue;
      const bucket = isAgent ? agentBySource : skillBySource;
      const source = toPosix(path.join("kit", path.relative(kitRoot, file)));
      let record = bucket.get(file);
      if (!record) {
        const fm = frontmatterOf(file, source, brand);
        record = { file, source, fm, editions: [] };
        if (isSkill) record.dir = path.posix.basename(path.posix.dirname(dest));
        bucket.set(file, record);
      }
      record.editions.push(edition);
    }
  }

  const agents = [...agentBySource.values()].map((r) => {
    const fm = r.fm;
    const id = clean(fm.id ?? fm.name);
    if (!id) throw new CatalogError(`${r.source}: o agente não tem id nem name`);
    const description = clean(fm.description);
    if (!description) throw new CatalogError(`${r.source}: o agente não tem description`);
    return {
      id,
      source: r.source,
      editions: r.editions,
      description,
      stream: fm.stream === undefined ? null : String(fm.stream),
      layer: fm.layer,
      phase: fm.phase,
      scope: fm.scope,
      receivesFrom: asList(fm.receives_from).map((x) => String(x).replace(/^@/, "")),
      deliversTo: asList(fm.delivers_to).map((x) => String(x).replace(/^@/, "")),
      escalatesTo: asList(fm.escalates_to).map((x) => String(x).replace(/^@/, "")),
      inputs: asList(fm.inputs),
      outputs: asList(fm.outputs),
      exitContract: asList(fm.exit_contract),
      guardRails: asList(fm.guard_rails),
      usesSkills: asList(fm.uses_skills).map(String),
      tokenBudget: fm.token_budget,
      invokeOn: asList(fm.invoke_on).map(String),
      loopWith: fm.loop_with === undefined ? undefined : String(fm.loop_with).replace(/^@/, ""),
      loopRounds: fm.loop_rounds,
      argumentHint: fm["argument-hint"],
    };
  });

  const skills = [...skillBySource.values()].map((r) => {
    const id = clean(r.fm.id ?? r.fm.name ?? r.dir);
    const description = clean(r.fm.description);
    if (!description) throw new CatalogError(`${r.source}: a skill não tem description`);
    return { id, source: r.source, editions: r.editions, description, applicableTo: asList(r.fm.applicable_to).map(String) };
  });

  return { editions, agents, skills };
}

// ── Montagem do modelo ──────────────────────────────────────────────────────

/** Agentes agrupados por id; cada um com as variantes (uma por arquivo-fonte), na ordem das edições. */
function groupAgents(agents, editions) {
  const byId = new Map();
  for (const a of agents) {
    if (!byId.has(a.id)) byId.set(a.id, []);
    byId.get(a.id).push(a);
  }
  const rank = (e) => Math.min(...e.map((x) => (EDITION_ORDER.includes(x) ? EDITION_ORDER.indexOf(x) : EDITION_ORDER.length + editions.indexOf(x))));
  return [...byId.entries()]
    .map(([id, variants]) => ({ id, variants: variants.sort((a, b) => rank(a.editions) - rank(b.editions) || a.source.localeCompare(b.source)) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function orchestratorAliases(brand) {
  return new Set(["maestro", brand.name, ...(brand.legacy?.names ?? [])]);
}

// ── Texto ───────────────────────────────────────────────────────────────────

/** `<` vira entidade: `coding-guidelines-<repo-id>` não pode ser lido como tag HTML. */
const escapeText = (text) => String(text).replace(/</g, "&lt;");
const escapeCell = (text) => escapeText(text).replace(/\|/g, "\\|");
const code = (text) => (String(text).includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``);
const itemText = (item) => (typeof item === "string" ? item : JSON.stringify(item));
const editionNames = (editions) => editions.map((e) => EDITION_LABELS[e] ?? e).join(" e ");
const editionCodes = (editions, all) => (editions.length === all.length && all.length > 1 ? "as duas" : editions.join(" e "));

/** A primeira frase de uma descrição, para os índices. */
function firstSentence(text) {
  const m = clean(text).match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : clean(text);
}

// ── Renderização ────────────────────────────────────────────────────────────

class Renderer {
  constructor({ groups, skills, editions, brand }) {
    this.groups = groups;
    this.skills = skills;
    this.editions = editions;
    this.brand = brand;
    this.aliases = orchestratorAliases(brand);
    this.agentIds = new Set(groups.map((g) => g.id));
    this.skillIds = new Set(skills.map((s) => s.id));
    this.orchestratorId = groups.find((g) => g.variants.every((v) => v.stream === null))?.id ?? null;
    this.usedBy = new Map();
    for (const g of groups) {
      for (const v of g.variants) for (const s of v.usesSkills) {
        if (!this.usedBy.has(s)) this.usedBy.set(s, new Set());
        this.usedBy.get(s).add(g.id);
      }
    }
  }

  /** Uma referência a agente: link para a ficha, o orquestrador com o nome da marca, ou só o texto. */
  agentRef(ref) {
    if (this.aliases.has(ref) && this.orchestratorId) return `[@${this.orchestratorId}](${this.orchestratorId}.md) (o orquestrador)`;
    if (this.agentIds.has(ref)) return `[@${ref}](${ref}.md)`;
    return code(ref);
  }

  agentRefs(list) {
    return [...new Set(list.map((r) => this.agentRef(r)))].join(", ");
  }

  skillRef(id) {
    if (this.skillIds.has(id)) return `[${code(id)}](skills.md#${id})`;
    return code(id);
  }

  skillLine(id) {
    if (this.skillIds.has(id)) {
      const skill = this.skills.find((s) => s.id === id);
      return `- ${this.skillRef(id)}: ${escapeText(firstSentence(skill.description))}`;
    }
    if (RUNTIME_SKILL.test(id)) return `- ${code(id)}: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.`;
    return `- ${code(id)}: não está entre as skills do kit.`;
  }

  /** O corpo de uma variante: a tabela de campos e as seções. `h` é o nível dos títulos. */
  variantBody(v, h) {
    const head = "#".repeat(h);
    const out = [];
    const rows = [];
    if (v.stream !== null) rows.push(["Stream", STREAM_LABELS[v.stream] ?? code(v.stream)]);
    if (v.layer) rows.push(["Camada", code(v.layer)]);
    if (v.phase) rows.push(["Fase", code(v.phase)]);
    if (v.scope) rows.push(["Escopo", SCOPE_LABELS[v.scope] ?? code(v.scope)]);
    if (v.tokenBudget) rows.push(["Orçamento de contexto", BUDGET_LABELS[v.tokenBudget] ?? code(v.tokenBudget)]);
    rows.push(["Edições do kit", editionNames(v.editions)]);
    rows.push(["Fonte", code(v.source)]);
    out.push("| Campo | Valor |", "|---|---|", ...rows.map(([k, val]) => `| ${k} | ${escapeCell(val)} |`), "");

    out.push(`${head} O que faz`, "", escapeText(v.description), "");
    if (v.argumentHint) out.push(`Como chamar: ${escapeText(clean(v.argumentHint))}`, "");

    out.push(`${head} Quando entra`, "");
    const when = [];
    if (v.invokeOn.length > 0) {
      when.push(`Entra nos gates: ${v.invokeOn.map((g) => (GATE_LABELS[g] ? `${code(g)} (${GATE_LABELS[g]})` : code(g))).join(", ")}.`);
      when.push("Valida de ponta a ponta e não executa fase.");
    }
    if (v.receivesFrom.length > 0) when.push(`Recebe o trabalho de: ${this.agentRefs(v.receivesFrom)}.`);
    if (v.deliversTo.length > 0) when.push(`Entrega para: ${this.agentRefs(v.deliversTo)}.`);
    if (v.escalatesTo.length > 0) when.push(`Escala para: ${this.agentRefs(v.escalatesTo)}.`);
    if (v.loopWith) when.push(`Trabalha em ciclo com ${this.agentRef(v.loopWith)}${v.loopRounds ? `, em ${v.loopRounds} rodadas` : ""}.`);
    if (when.length === 0 && v.stream === null) when.push("É o ponto de entrada: a conversa começa aqui, e ele roteia para o agente de cada etapa.");
    out.push(...(when.length > 0 ? when.map((w) => `- ${w}`) : ["- O frontmatter não declara de quem recebe nem para quem entrega."]), "");

    out.push(`${head} Skills`, "");
    out.push(...(v.usesSkills.length > 0 ? v.usesSkills.map((s) => this.skillLine(s)) : ["- Nenhuma. O agente não carrega skill."]), "");

    out.push(`${head} O que recebe`, "");
    out.push(...(v.inputs.length > 0 ? v.inputs.map((i) => `- ${code(itemText(i))}`) : ["- Nada declarado."]), "");

    out.push(`${head} O que produz`, "");
    out.push(...(v.outputs.length > 0 ? v.outputs.map((o) => `- ${code(itemText(o))}`) : ["- Nada declarado."]), "");

    if (v.exitContract.length > 0) out.push(`${head} Contrato de saída`, "", "O agente só passa adiante quando isto vale.", "", ...v.exitContract.map((c) => `- ${escapeText(itemText(c))}`), "");
    if (v.guardRails.length > 0) out.push(`${head} Regras de proteção`, "", ...v.guardRails.map((g) => `- ${escapeText(itemText(g))}`), "");
    return out;
  }

  agentPage(group) {
    const isOrchestrator = group.id === this.orchestratorId;
    const out = [GENERATED_MARK, "", `# @${group.id}${isOrchestrator ? " (o orquestrador)" : ""}`, ""];
    if (group.variants.length === 1) {
      out.push(`> ${escapeText(group.variants[0].description)}`, "", ...this.variantBody(group.variants[0], 2));
    } else {
      out.push(`Este agente tem conteúdo diferente em cada edição do kit. As seções abaixo mostram uma por uma.`, "");
      for (const v of group.variants) {
        out.push(`## Na edição: ${editionNames(v.editions)}`, "", ...this.variantBody(v, 3));
      }
    }
    out.push("---", "", "Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)", "");
    return out.join("\n");
  }

  index() {
    const totalAgents = this.groups.length;
    const out = [
      GENERATED_MARK,
      "",
      "# Catálogo de agentes e skills",
      "",
      `Os ${totalAgents} agentes e as ${this.skills.length} skills que o kit da ${this.brand.displayName} instala, lidos do frontmatter de \`kit/\`. Cada agente tem uma ficha com o que faz, quando entra, as skills que carrega, o que recebe e o que produz.`,
      "",
      "Você nunca chama um agente especialista direto: a conversa começa no orquestrador, que valida os pré-requisitos e roteia. As fichas existem para você saber o que esperar de cada um.",
      "",
      "As edições do kit:",
      "",
      ...this.editions.map((e) => `- **${e}**: ${EDITION_LABELS[e] ?? e}.`),
      "",
    ];
    const placed = new Set();
    const sections = [];
    for (const g of GROUPS) {
      const members = this.groups.filter((a) => a.variants.some((v) => g.streams.includes(v.stream)));
      members.forEach((m) => placed.add(m.id));
      if (members.length > 0) sections.push({ title: g.title, intro: g.intro, members });
    }
    const rest = this.groups.filter((a) => !placed.has(a.id));
    const restStreams = [...new Set(rest.flatMap((a) => a.variants.map((v) => v.stream)))].sort();
    for (const s of restStreams) sections.push({ title: `Outros (\`${s}\`)`, intro: "", members: rest.filter((a) => a.variants.some((v) => v.stream === s)) });

    for (const s of sections) {
      out.push(`## ${s.title}`, "");
      if (s.intro) out.push(s.intro, "");
      out.push("| Agente | O que faz | Edições |", "|---|---|---|");
      for (const a of s.members) {
        const editions = [...new Set(a.variants.flatMap((v) => v.editions))].sort((x, y) => this.editions.indexOf(x) - this.editions.indexOf(y));
        out.push(`| [@${a.id}](${a.id}.md) | ${escapeCell(firstSentence(a.variants[0].description))} | ${editionCodes(editions, this.editions)} |`);
      }
      out.push("");
    }
    out.push("## Skills", "", `As ${this.skills.length} skills estão em [skills.md](skills.md), por família, com a edição e os agentes que as usam. Uma skill só entra no contexto de um agente quando o frontmatter dele a declara em \`uses_skills\`.`, "");
    out.push("## Como este catálogo é gerado", "", "Os arquivos desta pasta saem de `npm run docs:agents`, a partir do frontmatter de `kit/` e do `kit/kit.manifest.yaml`. Não edite à mão: o `npm run docs:agents:check` roda no CI e reprova qualquer diferença entre a pasta e o kit. Para mudar o texto de um agente, mude o agente em `kit/` e gere de novo.", "");
    return out.join("\n");
  }

  skillsPage() {
    const families = new Map();
    for (const s of this.skills) {
      const family = SKILL_FAMILIES.find((f) => s.id.startsWith(f.prefix))?.title ?? OTHER_SKILLS;
      if (!families.has(family)) families.set(family, []);
      families.get(family).push(s);
    }
    const order = [...SKILL_FAMILIES.map((f) => f.title), OTHER_SKILLS].filter((t) => families.has(t));
    const out = [
      GENERATED_MARK,
      "",
      "# Skills do kit",
      "",
      `As ${this.skills.length} skills que o kit instala. Uma skill é um pacote de conhecimento que um agente só carrega quando o frontmatter dele a declara em \`uses_skills\`. Volta ao [índice dos agentes](README.md).`,
      "",
    ];
    for (const title of order) {
      out.push(`## ${title}`, "");
      for (const s of families.get(title).sort((a, b) => a.id.localeCompare(b.id))) {
        out.push(`### ${code(s.id)}`, "", escapeText(s.description), "");
        out.push(`- Edições do kit: ${editionNames(s.editions)}.`);
        const users = [...(this.usedBy.get(s.id) ?? [])].sort();
        out.push(`- Usada por: ${users.length > 0 ? users.map((u) => `[@${u}](${u}.md)`).join(", ") : "nenhum agente declara esta skill em `uses_skills`"}.`);
        if (s.applicableTo.length > 0) out.push(`- Indicada para: ${s.applicableTo.map((a) => code(a)).join(", ")}.`);
        out.push(`- Fonte: ${code(s.source)}`, "");
      }
    }
    return out.join("\n");
  }
}

/** Todos os arquivos do catálogo, como `caminho relativo → texto`, em ordem fixa. */
export function buildCatalog({ kitRoot = path.join(PKG_ROOT, "kit"), brand } = {}) {
  const resolvedBrand = brand ?? JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "src", "data", "brand.json"), "utf-8"));
  const { editions, agents, skills } = readKit({ kitRoot, brand: resolvedBrand });
  const groups = groupAgents(agents, editions);
  const renderer = new Renderer({ groups, skills: [...skills].sort((a, b) => a.id.localeCompare(b.id)), editions, brand: resolvedBrand });
  const files = new Map();
  files.set("README.md", renderer.index());
  files.set("skills.md", renderer.skillsPage());
  for (const g of groups) files.set(`${g.id}.md`, renderer.agentPage(g));
  return { files, agents: groups.length, skills: skills.length };
}

// ── Disco ───────────────────────────────────────────────────────────────────

const normalizeEol = (text) => text.replace(/\r\n/g, "\n");

/** Compara o que o kit gera com o que está em `outDir`: o que falta, o que mudou, o que sobra e o que não é gerado. */
export function diffCatalog(files, outDir) {
  const result = { missing: [], changed: [], extra: [], foreign: [] };
  for (const [name, text] of files) {
    const file = path.join(outDir, name);
    if (!fs.existsSync(file)) result.missing.push(name);
    else if (normalizeEol(fs.readFileSync(file, "utf-8")) !== text) result.changed.push(name);
  }
  if (fs.existsSync(outDir)) {
    for (const entry of fs.readdirSync(outDir).sort()) {
      if (files.has(entry)) continue;
      const full = path.join(outDir, entry);
      if (!fs.statSync(full).isFile()) {
        result.foreign.push(entry);
        continue;
      }
      const generated = fs.readFileSync(full, "utf-8").startsWith(GENERATED_MARK);
      (generated ? result.extra : result.foreign).push(entry);
    }
  }
  return result;
}

export function problemsOf(diff, outLabel) {
  return [
    ...diff.missing.map((n) => `${outLabel}/${n}: falta (o kit gera este arquivo)`),
    ...diff.changed.map((n) => `${outLabel}/${n}: está diferente do que o kit gera`),
    ...diff.extra.map((n) => `${outLabel}/${n}: sobra (nenhum agente do kit gera este arquivo)`),
    ...diff.foreign.map((n) => `${outLabel}/${n}: não é um arquivo gerado (a pasta é só do gerador)`),
  ];
}

/** Grava os arquivos e apaga os gerados que sobraram. Devolve quantos foram gravados, mantidos e removidos. */
export function writeCatalog(files, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const diff = diffCatalog(files, outDir);
  let written = 0;
  for (const name of [...diff.missing, ...diff.changed]) {
    fs.writeFileSync(path.join(outDir, name), files.get(name), "utf-8");
    written++;
  }
  for (const name of diff.extra) fs.rmSync(path.join(outDir, name));
  return { written, unchanged: files.size - written, removed: diff.extra.length, foreign: diff.foreign };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { check: false, kitRoot: path.join(PKG_ROOT, "kit"), outDir: path.join(PKG_ROOT, "docs", "agentes"), brandFile: path.join(PKG_ROOT, "src", "data", "brand.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--kit" && argv[i + 1]) opts.kitRoot = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i + 1]) opts.outDir = path.resolve(argv[++i]);
    else if (a === "--brand" && argv[i + 1]) opts.brandFile = path.resolve(argv[++i]);
    else return null;
  }
  return opts;
}

export function main(argv) {
  const opts = parseArgs(argv);
  if (!opts) {
    console.error("uso: node scripts/gen-agent-catalog.mjs [--check] [--kit <pasta>] [--out <pasta>] [--brand <brand.json>]");
    return 2;
  }
  const shown = (p) => {
    const rel = path.relative(PKG_ROOT, p);
    return toPosix(rel.startsWith("..") || path.isAbsolute(rel) ? p : rel);
  };
  try {
    const brand = JSON.parse(fs.readFileSync(opts.brandFile, "utf-8"));
    const { files, agents, skills } = buildCatalog({ kitRoot: opts.kitRoot, brand });
    if (opts.check) {
      const problems = problemsOf(diffCatalog(files, opts.outDir), shown(opts.outDir));
      if (problems.length > 0) {
        console.error(`gen-agent-catalog: ${problems.length} diferença(s) entre o kit e ${shown(opts.outDir)}/`);
        for (const p of problems.slice(0, 30)) console.error(`  ✗ ${p}`);
        if (problems.length > 30) console.error(`  … e mais ${problems.length - 30}`);
        console.error("Rode: npm run docs:agents");
        return 1;
      }
      console.log(`resumo: ${shown(opts.outDir)}/ em dia com o kit (${agents} agentes, ${skills} skills, ${files.size} arquivos)`);
      return 0;
    }
    const result = writeCatalog(files, opts.outDir);
    console.log(`gen-agent-catalog: ${agents} agentes e ${skills} skills em ${shown(opts.outDir)}/ (${result.written} gravado(s), ${result.unchanged} sem mudança, ${result.removed} removido(s))`);
    for (const name of result.foreign) console.warn(`  aviso: ${shown(opts.outDir)}/${name} não é um arquivo gerado e foi deixado como está`);
    return 0;
  } catch (err) {
    console.error(`gen-agent-catalog: ${err instanceof CatalogError ? err.message : (err?.stack ?? err)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
