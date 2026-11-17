import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { renderBrandPlaceholders } from "../src/data/brand.pure";

/**
 * Blocos F (execução) e G (modernização).
 *
 * O guard_rail `conform` é o item mais importante daqui: sem ele escrito, o
 * modelo refatora "de passagem" — ele tem viés forte de melhorar código, ainda
 * mais com o assessment gritando que aquilo é ruim. O resultado seria metade do
 * repositório migrado sem ninguém saber qual regra vale onde.
 */
// Kit local (fonte canônica dentro do repo). Antes: "../../../../brownfield-templates",
// fora do repositório, que dava ENOENT num checkout limpo (D42).
const AGENTS_ROOT = path.resolve(__dirname, "../dist/kit/brownfield-templates/agents");
const DOC_ROOT = path.resolve(__dirname, "../dist/kit/brownfield-templates");

interface Frontmatter {
  scope?: string;
  inputs?: string[];
  outputs?: string[];
  guard_rails?: string[];
  uses_skills?: string[];
  exit_contract?: string[];
}

// O kit escreve a marca como `{{brand.*}}` e o gerador renderiza ao instalar
// (ADR-0013): o que o host lê, e o que este teste valida, é o arquivo renderizado.
function readAgent(rel: string): { fm: Frontmatter; body: string } {
  const raw = renderBrandPlaceholders(fs.readFileSync(path.join(AGENTS_ROOT, rel), "utf-8"));
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${rel}: frontmatter ausente`);
  return { fm: (yaml.load(m[1]!) ?? {}) as Frontmatter, body: m[2]! };
}

const EXECUTORS = [
  "execution/feature-adder.agent.md",
  "execution/refactor-agent.agent.md",
  "execution/migration-agent.agent.md",
  "execution/test-backfill-agent.agent.md",
];

/**
 * Varre TODOS os agentes, de todos os streams.
 *
 * Frontmatter inválido não quebra nada — o agente é lido por LLM, que tolera.
 * Por isso três arquivos ficaram anos com YAML quebrado sem ninguém notar
 * (`- "a", "b"` não é sequência; `chave: valor` dentro de item não quotado vira
 * mapping). Este teste é a rede que faltava.
 */
describe("frontmatter de TODOS os agentes é YAML válido", () => {
  const allAgents = fs
    .readdirSync(AGENTS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      fs
        .readdirSync(path.join(AGENTS_ROOT, d.name))
        .filter((f) => f.endsWith(".agent.md"))
        .map((f) => `${d.name}/${f}`)
    );

  it("encontra os agentes nos três streams", () => {
    expect(allAgents.length).toBeGreaterThanOrEqual(19);
  });

  it.each(allAgents)("%s", (rel) => {
    expect(() => readAgent(rel)).not.toThrow();
  });

  it.each(allAgents)("%s: listas são strings, não objetos acidentais", (rel) => {
    const { fm } = readAgent(rel);
    for (const field of ["guard_rails", "inputs", "outputs", "exit_contract"] as const) {
      for (const item of fm[field] ?? []) {
        // `- NUNCA fazer X: usando Y` vira {NUNCA fazer X: "usando Y"} em vez de string
        expect(typeof item, `${rel}: ${field} tem item não-string — provável ': ' sem aspas`).toBe("string");
      }
    }
  });
});

describe("Item 24 — guard_rail CONFORM em todo agente de execução", () => {
  it.each(EXECUTORS)("%s escreve no padrão descoberto do repo", (rel) => {
    const rails = (readAgent(rel).fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/CONFORM/);
    expect(rails).toMatch(/padrão descoberto do repo/i);
  });

  it.each(EXECUTORS)("%s não refatora por conta própria — sugere modernization", (rel) => {
    const rails = (readAgent(rel).fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/NÃO refatore/i);
    expect(rails).toMatch(/iniciativa modernization/i);
  });

  it.each(EXECUTORS)("%s carrega a skill do repositório ALVO", (rel) => {
    const skills = (readAgent(rel).fm.uses_skills ?? []).join(" | ");
    expect(skills).toMatch(/coding-guidelines-<repo-id>/);
  });

  it.each(EXECUTORS)("%s atua em um repositório por vez", (rel) => {
    const { fm } = readAgent(rel);
    expect(fm.scope).toBe("repo");
    expect((fm.guard_rails ?? []).join(" | ")).toMatch(/nunca edite fora dele/i);
  });
});

describe("Item 25 — a stack é por repositório, não do projeto", () => {
  const { body } = readAgent("discovery/assessor.agent.md");

  it("o Skill Linking grava stack/arch_current no repos.yaml", () => {
    expect(body).toMatch(/grave a stack de cada repositório em `repos\.yaml`/i);
  });

  it("declara que não existe 'a stack do projeto'", () => {
    expect(body).toMatch(/Não existe "a stack do projeto"/i);
  });

  it("as skills são declaradas por repo no ai-sdk.config.yaml", () => {
    expect(body).toMatch(/repos:\n\s+billing-api:\n\s+skills:/);
  });
});

describe("Bloco G — modernização: alvo é decisão, débito é fato", () => {
  const { fm, body } = readAgent("planning/modernization-planner.agent.md");

  it("arch_target vive na iniciativa, nunca no repos.yaml", () => {
    const rails = (fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/arch_target vive na INICIATIVA, nunca em repos\.yaml/i);
    expect(body).toMatch(/o alvo mora AQUI/i);
  });

  it("exige driven_by — refatorar sem achado é gosto pessoal", () => {
    expect((fm.guard_rails ?? []).join(" | ")).toMatch(/Nunca propor modernização sem driven_by/i);
    expect(body).toMatch(/gosto pessoal/i);
  });

  it("responde 'débito comparado a quê?' — aos juros, não a um ideal", () => {
    expect(body).toMatch(/débito comparado a\s*quê/i);
    expect(body).toMatch(/aos juros que ele cobra/i);
  });

  it("o grafo decide a ordem: folhas primeiro, ciclos antes", () => {
    expect(fm.inputs).toContain(".github/artifacts/assessment/repo-graph.yaml");
    expect((fm.guard_rails ?? []).join(" | ")).toMatch(/Nunca modernizar repo dentro de um ciclo/i);
    expect(body).toMatch(/Repos-folha primeiro/i);
  });

  it("explica por que o alvo não pode morar no repos.yaml", () => {
    expect(body).toMatch(/migrar "de passagem"/i);
    expect(body).toMatch(/Frankenstein/i);
  });

  it("o lock é por scope, nunca global", () => {
    expect(body).toMatch(/O lock é \*\*pelo `scope`\*\*, não global/);
    expect(body).toMatch(/travar tudo seria brutal/i);
  });
});

describe("AGENTS.md — as regras que todo agente lê", () => {
  const doc = fs.readFileSync(path.join(DOC_ROOT, "AGENTS.md"), "utf-8");

  it("D1 é por repositório, com rollup global derivado", () => {
    expect(doc).toMatch(/D1 é por repositório/i);
    expect(doc).toMatch(/nunca trava os outros/i);
  });

  it("declara o conform e o porquê (viés de 'melhorar' código)", () => {
    expect(doc).toMatch(/## Execução multi-repo/);
    expect(doc).toMatch(/não refatore.*registre o achado/is);
    expect(doc).toMatch(/documenta a dívida e depois a reproduz/i);
  });

  it("declara a composição executor = contexto × skill do repo × stack", () => {
    expect(doc).toMatch(/executor = @<contexto>/);
    expect(doc).toMatch(/coding-guidelines-<repo-alvo>/);
  });

  it("um PR por repositório; D3 espera todos", () => {
    expect(doc).toMatch(/Um PR por repositório/i);
    expect(doc).toMatch(/D3 espera todos/i);
    expect(doc).toMatch(/contrato antes do consumidor/i);
  });

  it("a revisão do PR (humana, no gate D3) usa a rubrica do repositório", () => {
    expect(doc).toMatch(/não se revisa um Spring MVC\s+legado com rubrica hexagonal/i);
  });

  it("lock de modernização por scope", () => {
    expect(doc).toMatch(/### Lock de modernização/);
    expect(doc).toMatch(/nunca global/i);
    expect(doc).toMatch(/trava SOMENTE estes repos/i);
  });
});
