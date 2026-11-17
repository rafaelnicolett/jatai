import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Toda skill declarada em `uses_skills` precisa ser realmente empacotada.
 *
 * Motivo: o `@arch-discoverer` declarava `arch-diagrams-drawio`, a skill existia
 * no kit, mas o `copy-templates.js` só copiava a `likec4`. O agente só descobriu
 * **em runtime**, no meio de um assessment — e justamente no formato de diagrama
 * que o usuário tinha escolhido.
 *
 * Declaração e realidade divergindo em silêncio é o padrão de falha deste
 * projeto. Este teste é a rede: se um agente pede skill que não é entregue, o
 * build quebra aqui, não na frente do cliente.
 */

// PKG_ROOT: a raiz deste pacote. Desde a F0.2 da Jataí (ADR-0012) o kit
// canônico (brownfield-templates/ e templates/) fica aqui dentro. Antes este
// teste lia a raiz do workspace pai (REPO_ROOT = "../../../": .github/agents,
// .github/skills/ e brownfield-templates/), o que o prendia ao layout do
// workspace e dava ENOENT num checkout limpo (D42).
const PKG_ROOT = path.resolve(__dirname, "..");
const AGENTS_ROOT = path.join(PKG_ROOT, "dist/kit/brownfield-templates/agents");
const COPY_SCRIPT = path.join(__dirname, "../scripts/copy-templates.js");

/** Skills que o copy-templates leva para o pacote brownfield. */
function packagedSkills(): Set<string> {
  const script = fs.readFileSync(COPY_SCRIPT, "utf-8");
  const brownfieldMap = script.slice(script.indexOf("BROWNFIELD_COPY_MAP"));
  const skills = new Set<string>();
  for (const m of brownfieldMap.matchAll(/"skills\/([a-z0-9-]+)"/g)) {
    skills.add(m[1]!);
  }
  return skills;
}

/** `uses_skills` declarados por cada agente. */
function declaredSkills(): Map<string, string[]> {
  const byAgent = new Map<string, string[]>();
  for (const dir of fs.readdirSync(AGENTS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of fs.readdirSync(path.join(AGENTS_ROOT, dir.name)).filter((f) => f.endsWith(".agent.md"))) {
      const raw = fs.readFileSync(path.join(AGENTS_ROOT, dir.name, file), "utf-8");
      const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
      if (!m) continue;
      const fm = (yaml.load(m[1]!) ?? {}) as { uses_skills?: unknown };
      const skills = Array.isArray(fm.uses_skills)
        ? fm.uses_skills.filter((s): s is string => typeof s === "string")
        : [];
      if (skills.length > 0) byAgent.set(`${dir.name}/${file}`, skills);
    }
  }
  return byAgent;
}

/**
 * Skills geradas em runtime pelo próprio assessment (uma por repositório), então
 * não existem no pacote — são criadas pelo @coding-archaeologist.
 */
// Skills geradas por repositório durante o assessment (uma por repo), então não
// existem no pacote: coding-guidelines-<repo> (@coding-archaeologist) e
// design-system-<repo> (@design-archaeologist).
const RUNTIME_GENERATED = /^(coding-guidelines|design-system)-/;

describe("uses_skills — declaração vs pacote", () => {
  const packaged = packagedSkills();
  const declared = declaredSkills();

  it("o copy-templates empacota skills (sanidade do parser)", () => {
    expect(packaged.size).toBeGreaterThan(20);
  });

  it("os agentes declaram uses_skills (sanidade do parser)", () => {
    expect(declared.size).toBeGreaterThan(8);
  });

  it("REGRESSÃO: arch-diagrams-drawio é empacotada (o @arch-discoverer a declara)", () => {
    expect(packaged.has("arch-diagrams-drawio")).toBe(true);
  });

  it("ambos os formatos de diagrama são entregues — o humano escolhe no Passo 0", () => {
    expect(packaged.has("arch-diagrams-drawio")).toBe(true);
    expect(packaged.has("arch-diagrams-likec4")).toBe(true);
  });

  it("toda skill declarada por um agente é empacotada ou gerada em runtime", () => {
    const missing: string[] = [];
    for (const [agent, skills] of declared) {
      for (const skill of skills) {
        // placeholders (<repo-id>) são resolvidos em runtime
        if (skill.includes("<") || RUNTIME_GENERATED.test(skill)) continue;
        if (!packaged.has(skill)) missing.push(`${agent} → ${skill}`);
      }
    }
    expect(missing, `skills declaradas mas NÃO empacotadas:\n  - ${missing.join("\n  - ")}`).toEqual([]);
  });
});

describe("skills empacotadas existem no kit", () => {
  it("toda entrada do copy-templates aponta para uma pasta real com SKILL.md", () => {
    const script = fs.readFileSync(COPY_SCRIPT, "utf-8");
    const brownfieldMap = script.slice(script.indexOf("BROWNFIELD_COPY_MAP"));
    const broken: string[] = [];

    // As entradas agora apontam para o kit local ("skills/<id>" dentro de
    // brownfield-templates/), não mais para ".github/skills/<id>" do workspace.
    for (const m of brownfieldMap.matchAll(/"skills\/([a-z0-9-]+)"/g)) {
      const skillDir = path.join(PKG_ROOT, "dist/kit/brownfield-templates/skills", m[1]!);
      if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) broken.push(m[1]!);
    }
    expect(broken, `copy-templates aponta para skills inexistentes: ${broken.join(", ")}`).toEqual([]);
  });
});

/**
 * Greenfield: `templates/skills/` é curado a partir de `templates/skills/registry.yaml`
 * (ver `greenfieldSkillIds()` em copy-templates.js), não uma cópia cega de
 * todas as skills. Essa curadoria só funciona se toda skill que um agente
 * greenfield declara em `uses_skills` estiver de fato registrada — senão o
 * projeto do cliente nasce sem a skill, do mesmo jeito que o bug original do
 * `arch-diagrams-drawio` no brownfield.
 */
const GREENFIELD_AGENTS_ROOT = path.join(PKG_ROOT, "dist/kit/templates/agents");
const REGISTRY_PATH = path.join(PKG_ROOT, "dist/kit/templates/skills/registry.yaml");

function registrySkillIds(): Set<string> {
  const registry = yaml.load(fs.readFileSync(REGISTRY_PATH, "utf-8")) as { skills?: Array<{ id: string }> };
  return new Set((registry.skills ?? []).map((s) => s.id));
}

function declaredGreenfieldSkills(): Map<string, string[]> {
  const byAgent = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".agent.md")) continue;
      const raw = fs.readFileSync(full, "utf-8");
      const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
      if (!m) continue;
      const fm = (yaml.load(m[1]!) ?? {}) as { uses_skills?: unknown };
      const skills = Array.isArray(fm.uses_skills)
        ? fm.uses_skills.filter((s): s is string => typeof s === "string")
        : [];
      if (skills.length > 0) byAgent.set(path.relative(GREENFIELD_AGENTS_ROOT, full), skills);
    }
  };
  walk(GREENFIELD_AGENTS_ROOT);
  return byAgent;
}

// `project-coding-guidelines` era declarada em uses_skills por 9 agentes
// greenfield (backend-*, frontend-*, reviewer) sem nenhum produtor: era o nome
// antigo da skill de convenções por repositório, que no brownfield virou
// `coding-guidelines-<repo-id>` (do @coding-archaeologist). Desde a onda 5
// (F3.5) eles declaram `coding-guidelines`, que o greenfield empacota, e a
// exceção que ficava aqui saiu.

// O skipIf vem do helyx-vscode: lá o registry era procurado na raiz do
// workspace, onde nunca existiu (só no repo irmão ai-software-delivery-kit),
// e este describe era pulado. Aqui o registry faz parte do kit local, então
// o describe roda. O guard fica como estava, sem mudar nenhuma asserção.
describe.skipIf(!fs.existsSync(REGISTRY_PATH))("greenfield: uses_skills vs registry.yaml", () => {
  it("registry.yaml registra skills (sanidade do parser)", () => {
    expect(registrySkillIds().size).toBeGreaterThan(20);
  });

  // Corrigido na F3.5 (era @known-bug desde a F0.3): templates/agents/ trazia o
  // roster BROWNFIELD (discovery/, planning/, execution/: 20 agentes), e esses
  // agentes declaravam 32 skills que o registry greenfield não registra. O
  // manifesto do kit (kit/kit.manifest.yaml) não manda mais o roster para a
  // edição greenfield: ele é do brownfield, que empacota as skills dele.
  it("REGRESSÃO: nenhum agente de templates/agents declara skill que o registry.yaml greenfield não registra", () => {
    const registered = registrySkillIds();
    const declared = declaredGreenfieldSkills();
    const missing: string[] = [];
    for (const [agent, skills] of declared) {
      for (const skill of skills) {
        if (!registered.has(skill)) missing.push(`${agent} → ${skill}`);
      }
    }
    expect(missing.map((m) => m.split(path.sep).join("/")).sort(), "skills declaradas por agentes greenfield e não registradas").toEqual([]);
  });

  it("REGRESSÃO: o roster brownfield (discovery/, planning/, execution/) não está em templates/agents", () => {
    for (const stream of ["discovery", "planning", "execution"]) {
      expect(fs.existsSync(path.join(GREENFIELD_AGENTS_ROOT, stream)), stream).toBe(false);
    }
  });

  it("toda skill registrada aponta para uma pasta real com SKILL.md", () => {
    const broken: string[] = [];
    for (const id of registrySkillIds()) {
      if (!fs.existsSync(path.join(PKG_ROOT, "dist/kit/templates/skills", id, "SKILL.md"))) broken.push(id);
    }
    expect(broken, `registry.yaml registra skills inexistentes: ${broken.join(", ")}`).toEqual([]);
  });
});
