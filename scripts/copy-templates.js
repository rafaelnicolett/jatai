#!/usr/bin/env node
/**
 * copy-templates.js: materialização e validação do kit (prebuild)
 *
 * Desde a onda 5 (ADR-0018, "o output de build sai do git"), as duas edições
 * do kit não são versionadas: este script as materializa a partir de `kit/`
 * em `dist/kit/templates/` (greenfield) e `dist/kit/brownfield-templates/`
 * (brownfield), que o `.vsix` empacota e o gerador lê em runtime
 * (`kitRoot()`, `dist/kit/<edição>`). Depois confere o resultado.
 *
 * Histórico: até a F3.5 as duas pastas eram versionadas na raiz do pacote.
 *
 * Até o helyx-vscode 0.9.10, este script apagava as duas pastas (`rmSync`) e
 * as recopiava da raiz do workspace pai (`../../../`: `.github/agents`,
 * `.github/chatmodes`, `.github/skills`, `brownfield-templates/`), mais
 * `docs/` e `features/` de um repositório irmão que não existe neste
 * checkout. Fonte ausente virava `[skip]` com exit 0, e o pacote saía sem as
 * skills greenfield, sem os docs e sem as instruções do host (BUG-01, BUG-03,
 * D42).
 *
 * Desde a F0.2 da Jataí (ADR-0012) o build é hermético:
 *   - nada é lido fora deste pacote;
 *   - nada é copiado nem apagado;
 *   - o script só confere que cada item que o gerador espera existe aqui e
 *     termina com exit 1 se faltar algum.
 * O nome do arquivo e o script npm `copy-templates` continuam os mesmos para
 * não mexer em `build` e `package`.
 *
 * Desde a F3.5 (ADR-0018) as duas pastas são materializadas a partir da fonte
 * única `kit/` (`kit/kit.manifest.yaml`, `npm run build:kit`). Além dos itens
 * esperados, este script confere que elas estão em dia com o manifesto
 * (`scripts/kit.js`): editar `templates/` ou `brownfield-templates/` à mão
 * reprova aqui. E roda as regras de CI do kit (`scripts/kit-lint.js`): YAML
 * válido, JSON Schema de agente e skill e referências resolvidas por edição.
 */

const fs   = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const kit = require("./kit");
const { lintKit } = require("./kit-lint");

const PKG_ROOT        = path.resolve(__dirname, "..");
const GREENFIELD_ROOT = path.join(kit.OUT_ROOT, "templates");
const BROWNFIELD_ROOT = path.join(kit.OUT_ROOT, "brownfield-templates");
const BRAND           = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "src/data/brand.json"), "utf-8"));

// ── Kit greenfield esperado (relativo a templates/) ─────────────────────────
// Os mesmos itens que o antigo COPY_MAP trazia de fora, mais o ADR de
// referência (seed genérico) e o README da pasta de ADRs. Continuam de fora, como antes: as instruções
// do próprio repositório (o CLAUDE.md/copilot-instructions.md do cliente são
// GERADOS pelo ClaudeAdapter/CopilotAdapter) e docs/adr inteiro.
const GREENFIELD_KIT = [
  "agents",
  "chatmodes",
  "skills/registry.yaml",
  "skills/README.md",
  "docs/delivery-flow.md",
  "docs/hierarchy.md",
  "docs/routing-rules.md",
  "features/support",
  "docs/adr/0001-arquitetura-referencia-clean-hexagonal.md",
  "docs/adr/README.md",
  // Bundles que o gerador instala nos dois fluxos (npm run build:cli e build:mcp).
  `scripts/${BRAND.files.cli}`,
  `scripts/${BRAND.name}-mcp.cjs`,
];

/**
 * Skills do greenfield: uma pasta `skills/<id>/` com SKILL.md por id da seção
 * `skills:` de `templates/skills/registry.yaml`. É a mesma curadoria de antes,
 * só que o registry agora é lido daqui.
 */
function greenfieldSkillIds() {
  const registryPath = path.join(GREENFIELD_ROOT, "skills/registry.yaml");
  if (!fs.existsSync(registryPath)) return [];
  const registry = yaml.load(fs.readFileSync(registryPath, "utf-8"));
  return (registry.skills ?? []).map((s) => s.id);
}

// ── Kit brownfield esperado (relativo a brownfield-templates/) ──────────────
// O nome da constante e o formato "skills/<id>" são mantidos de propósito:
// tests/skills-declared-vs-packaged.test.ts lê este arquivo como texto e
// extrai daqui a lista de skills empacotadas.
const BROWNFIELD_COPY_MAP = [
  // brownfield agents + chatmodes + instructions
  "agents",
  "chatmodes",
  "copilot-instructions.md",
  "claude-instructions.md",
  "AGENTS.md",

  // Skills brownfield-specific (Discovery + Planning + Execution)
  "skills/tech-stack-detection",
  "skills/arch-pattern-detection",
  "skills/domain-extraction-from-code",
  "skills/code-quality-audit",
  "skills/tech-debt-mapping",
  "skills/legacy-modernization-patterns",
  "skills/characterization-testing",
  "skills/safe-refactoring-recipes",
  "skills/version-migration-playbook",

  // Skills greenfield reutilizadas
  "skills/codebase-enrichment",
  "skills/domain-driven-design",
  "skills/coding-guidelines",
  // UI/UX — consumidas pelo @design-archaeologist (brownfield) e pelos executores
  "skills/ui-ux-design-system",
  "skills/ux-prototyping",
  "skills/bdd-gherkin",
  "skills/qa-strategy",
  "skills/integration-testing",
  "skills/security-best-practices",
  "skills/security-cve-checker",
  "skills/commit-assistant",
  "skills/workflow-memory",
  "skills/task-manager",
  "skills/docs-writer",

  // Skills de diagrama (draw.io e LikeC4 — carregadas conforme diagram_format escolhido no wizard).
  // As DUAS precisam ir: o @arch-discoverer declara ambas em uses_skills e o
  // formato é escolhido pelo humano no Passo 0. Faltar uma trava o assessment
  // exatamente no formato que o usuário escolheu.
  "skills/arch-diagrams-drawio",
  "skills/arch-diagrams-likec4",

  // Skills arquiteturais (carregadas conforme arch-discoverer recomendar)
  "skills/arch-hexagonal",
  "skills/arch-layered",
  "skills/arch-ddd-tactical",
  "skills/arch-mvvm",
  "skills/arch-mvc",
  "skills/arch-vertical-slice",
  "skills/arch-feature-based",
  "skills/arch-clean-frontend",

  // Maturity frameworks (consumidas por @maturity-assessor, opt-in via wizard)
  "skills/maturity-dora-4keys",
  "skills/maturity-dora-capabilities",
  "skills/maturity-owasp-samm",
  "skills/maturity-owasp-asvs",
  "skills/maturity-cmmi",
  "skills/maturity-iso-25010",
  "skills/maturity-space-devex",
  "skills/maturity-bsimm",
  "skills/maturity-spotify-health",
  "skills/maturity-tech-radar",
];

// ── Validação ───────────────────────────────────────────────────────────────
function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

/** Registra em `problems` se `rel` não existir em `root` ou estiver vazio. */
function expectItem(root, rel, problems) {
  const label = `${path.basename(root)}/${rel}`;
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    problems.push(`${label}: ausente`);
    return;
  }
  const empty = fs.statSync(full).isDirectory() ? countFiles(full) === 0 : fs.statSync(full).size === 0;
  if (empty) problems.push(`${label}: vazio`);
}

/**
 * `skills/` precisa ter exatamente as skills esperadas. Antes a pasta era
 * recriada a partir da lista, então nenhuma skill fora dela chegava ao
 * pacote. Agora a pasta é a fonte, e uma skill que sobra seria empacotada sem
 * constar da lista, que é o que os testes de `uses_skills` leem.
 */
function expectSkills(root, ids, problems) {
  for (const id of ids) expectItem(root, path.join("skills", id, "SKILL.md"), problems);
  const skillsDir = path.join(root, "skills");
  if (!fs.existsSync(skillsDir)) return;
  const expected = new Set(ids);
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !expected.has(entry.name)) {
      problems.push(`${path.basename(root)}/skills/${entry.name}: pasta fora da lista esperada`);
    }
  }
}

function validateKit() {
  const problems = [];

  // ADR-0018: as edições saem de kit/ a cada build, em dist/kit/ (fora do git).
  try {
    kit.writeAll();
  } catch (err) {
    problems.push(`materialização do kit: ${err.message}`);
  }

  for (const rel of GREENFIELD_KIT) expectItem(GREENFIELD_ROOT, rel, problems);
  const greenfieldSkills = greenfieldSkillIds();
  if (greenfieldSkills.length === 0) problems.push("templates/skills/registry.yaml: nenhuma skill registrada");
  expectSkills(GREENFIELD_ROOT, greenfieldSkills, problems);

  const brownfieldSkills = [];
  for (const rel of BROWNFIELD_COPY_MAP) {
    if (rel.startsWith("skills/")) brownfieldSkills.push(rel.slice("skills/".length));
    else expectItem(BROWNFIELD_ROOT, rel, problems);
  }
  expectSkills(BROWNFIELD_ROOT, brownfieldSkills, problems);

  // F3.5: as edições materializadas batem com a fonte única (kit/ + kit.manifest.yaml).
  problems.push(...kit.checkAll().map((p) => `drift do kit: ${p} (edite kit/ e rode npm run build:kit)`));
  // F3.5: frontmatter de agente e skill (JSON Schema) e referências por edição.
  problems.push(...lintKit().problems.map((p) => `kit-lint: ${p}`));

  return { problems, greenfieldSkills: greenfieldSkills.length, brownfieldSkills: brownfieldSkills.length };
}

if (require.main === module) {
  const { problems, greenfieldSkills, brownfieldSkills } = validateKit();
  if (problems.length > 0) {
    console.error(`✖ copy-templates: kit incompleto (${problems.length} problema(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const files = (dir) => (fs.existsSync(dir) ? countFiles(dir) : 0);
  console.log(`✅ copy-templates: kit materializado de kit/ em dist/kit/ e válido`);
  console.log(`   templates/            ${files(GREENFIELD_ROOT)} arquivos, ${greenfieldSkills} skills`);
  console.log(`   brownfield-templates/ ${files(BROWNFIELD_ROOT)} arquivos, ${brownfieldSkills} skills`);
}

module.exports = { validateKit, GREENFIELD_KIT, BROWNFIELD_COPY_MAP };
