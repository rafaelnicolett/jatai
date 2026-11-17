import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Os agentes de discovery são **prompts** — eles são o produto no brownfield.
 * Um path errado ou um escopo faltando aqui não quebra build nenhum: só faz o
 * agente gravar no lugar errado, em silêncio. Por isso valem teste.
 *
 * Fonte: brownfield-templates/ deste repositório, que é o kit canônico. Antes
 * o path era "../../../../brownfield-templates/...", fora do repositório, e
 * dava ENOENT num checkout limpo (D42).
 */
const AGENTS_DIR = path.resolve(__dirname, "../dist/kit/brownfield-templates/agents/discovery");

interface Frontmatter {
  id?: string;
  scope?: string;
  inputs?: string[];
  outputs?: string[];
  guard_rails?: string[];
}

function readAgent(file: string): { fm: Frontmatter; body: string } {
  const raw = fs.readFileSync(path.join(AGENTS_DIR, file), "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: frontmatter ausente`);
  return { fm: (yaml.load(match[1]!) ?? {}) as Frontmatter, body: match[2]! };
}

const REPO_SCOPED = [
  "tech-mapper",
  "arch-discoverer",
  "coding-archaeologist",
  "design-archaeologist",
  "quality-auditor",
  "security-auditor",
  "test-coverage-mapper",
  "debt-analyst",
];

const WORKSPACE_SCOPED = ["domain-extractor", "business-archeologist", "maturity-assessor", "dependency-mapper"];

describe("frontmatter dos agentes de discovery", () => {
  it("todos os agentes têm YAML válido", () => {
    for (const file of fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".agent.md"))) {
      expect(() => readAgent(file), `${file} tem frontmatter inválido`).not.toThrow();
    }
  });
});

describe("escopo declarado — quem roda por repo vs cross-repo", () => {
  it.each(REPO_SCOPED)("%s declara scope: repo", (id) => {
    expect(readAgent(`${id}.agent.md`).fm.scope).toBe("repo");
  });

  it.each(WORKSPACE_SCOPED)("%s declara scope: workspace", (id) => {
    expect(readAgent(`${id}.agent.md`).fm.scope).toBe("workspace");
  });

  it("todo sub-agente declara um escopo (só o coordenador fica sem)", () => {
    const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".agent.md") && f !== "assessor.agent.md");
    for (const file of files) {
      const { fm } = readAgent(file);
      expect(["repo", "workspace"], `${file}: scope ausente ou inválido`).toContain(fm.scope);
    }
  });
});

describe("outputs — artefatos por repo não podem colidir entre repositórios", () => {
  it.each(REPO_SCOPED)("%s grava sob assessment/repos/<repo-id>/", (id) => {
    const { fm } = readAgent(`${id}.agent.md`);
    const artifacts = (fm.outputs ?? []).filter((o) => o.includes("assessment/"));
    expect(artifacts.length, `${id} não declara outputs de assessment`).toBeGreaterThan(0);
    for (const out of artifacts) {
      expect(out, `${id}: '${out}' não está sob repos/<repo-id>/`).toContain("assessment/repos/<repo-id>/");
    }
  });

  it.each(WORKSPACE_SCOPED)("%s NÃO é reancorado por repo", (id) => {
    for (const out of readAgent(`${id}.agent.md`).fm.outputs ?? []) {
      expect(out, `${id}: '${out}' não deveria ser por repo`).not.toContain("assessment/repos/<repo-id>/");
    }
  });
});

describe("@domain-extractor — o único cross-repo", () => {
  const { fm, body } = readAgent("domain-extractor.agent.md");

  it("lê o inventário e os artefatos de TODOS os repos", () => {
    expect(fm.inputs).toContain(".github/artifacts/repos.yaml");
    expect(fm.inputs?.some((i) => i.includes("assessment/repos/*/"))).toBe(true);
  });

  it("produz o context-repos.yaml (mapa N:N)", () => {
    expect(fm.outputs).toContain(".github/artifacts/context-repos.yaml");
  });

  it("explica por que é cross-repo (contexto atravessa repositórios)", () => {
    expect(body).toMatch(/N:N/);
    expect(body).toMatch(/não respeita a\s+fronteira de reposit[óo]rio/i);
  });

  it("avisa da colisão com o Context Map do DDD", () => {
    expect(body).toMatch(/não confunda/i);
    expect(body).toContain("context-map.md");
  });

  it("grava sempre candidate — só o humano promove a accepted", () => {
    expect(body).toMatch(/status: candidate/);
    expect(body).toMatch(/só .?accepted.? vira agente de domínio/i);
  });
});

describe("@coding-archaeologist — uma skill por repositório", () => {
  const { fm, body } = readAgent("coding-archaeologist.agent.md");

  it("a skill é nomeada por repo (senão um padrão sobrescreve o outro)", () => {
    expect(fm.outputs?.some((o) => o.includes("skills/coding-guidelines-<repo-id>/"))).toBe(true);
  });

  it("não sobrou a skill única do modelo single-repo", () => {
    expect(body).not.toContain("skills/project-coding-guidelines");
  });

  it("explica o risco de uma skill só", () => {
    expect(body).toMatch(/sobrescreveria/i);
  });
});

describe("@assessor — coordenador multi-repo", () => {
  const { fm, body } = readAgent("assessor.agent.md");

  it("lê o inventário", () => {
    expect(fm.inputs).toContain(".github/artifacts/repos.yaml");
  });

  it("guard_rails cobrem os riscos do multi-repo", () => {
    const rails = (fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/read-only/i);
    expect(rails).toMatch(/clonar reposit[óo]rio à mão/i);
    expect(rails).toMatch(/misturar artefatos de repos diferentes/i);
  });

  it("ordena o Discovery repo por repo, com D1 por repositório", () => {
    expect(body).toMatch(/PARA CADA repo em repos\.yaml/);
    expect(body).toMatch(/Gate D1 do reposit[óo]rio/);
    expect(body).toMatch(/nunca trava os outros/i);
  });

  it("proíbe rodar o @domain-extractor dentro do loop", () => {
    expect(body).toMatch(/NÃO rode dentro do loop/i);
  });

  it("P1 — nunca tratar N=1 como caso especial", () => {
    expect(body).toMatch(/N=1/);
    expect(body).toMatch(/nunca.{0,20}trate esse caso como especial/is);
  });

  it("ensina onde gravar o estado por escopo", () => {
    expect(body).toMatch(/repos:\n  billing-api:\n    phases:/);
    expect(body).toMatch(/Nunca grave uma fase .?scope: repo.? no bloco/i);
  });

  it("exige agent-done antes de done (o gate HITL)", () => {
    expect(body).toContain("agent-done");
    expect(body).toMatch(/Nunca grave .?done.? direto/i);
  });

  it("manda gravar findings_summary para o dashboard não parsear markdown", () => {
    expect(body).toContain("findings_summary");
  });
});

describe("LLM Wiki — o Discovery instala capacidade, não só documentos", () => {
  const { fm, body } = readAgent("assessor.agent.md");

  it("declara os agentes de domínio como output", () => {
    expect(fm.outputs?.some((o) => o.includes("agents/domain/<slug>.agent.md"))).toBe(true);
  });

  it("o exit_contract exige a Wiki sintetizada", () => {
    const contract = (fm.exit_contract ?? []).join(" | ");
    expect(contract).toMatch(/LLM Wiki sintetizada/i);
    expect(contract).toMatch(/registry\.yaml atualizado/i);
  });

  it("tem um passo de síntese (sem ele o Discovery termina em documentos)", () => {
    expect(body).toMatch(/## Passo 3b — Síntese da LLM Wiki/);
  });

  it("gera 1 agente por contexto ACCEPTED — nunca por repositório", () => {
    expect(body).toMatch(/Um agente por contexto, nunca por reposit[óo]rio/i);
    expect(body).toMatch(/duplicaria a regra/i);
  });

  it("o agente de domínio declara lives_in (N:N com os repos)", () => {
    expect(body).toMatch(/lives_in:/);
  });

  it("o agente carrega a skill de coding-guidelines de cada repo onde atua", () => {
    expect(body).toMatch(/uses_skills:[\s\S]{0,120}coding-guidelines-/);
  });

  it("guard_rail do agente gerado: conform, não refatorar por conta própria", () => {
    expect(body).toMatch(/NUNCA refatore a arquitetura/i);
    expect(body).toMatch(/sugira iniciativa modernization/i);
  });

  it("guard_rail do agente gerado: atuar só nos paths do contexto", () => {
    expect(body).toMatch(/Atue SOMENTE nos paths declarados em lives_in/i);
  });
});

describe("@design-archaeologist — o arqueólogo de UI que faltava", () => {
  const { fm, body } = readAgent("design-archaeologist.agent.md");

  it("gera a skill design-system por repo — o conform de UI", () => {
    expect(fm.outputs?.some((o) => o.includes("skills/design-system-<repo-id>/"))).toBe(true);
    expect(fm.outputs?.some((o) => o.includes("design/design-system.md"))).toBe(true);
  });

  it("extrai tokens do declarativo — sem AST, sem rodar o app", () => {
    const inputs = (fm.inputs ?? []).join(" | ");
    expect(inputs).toMatch(/tailwind\.config/);
    expect(inputs).toMatch(/tokens\./);
  });

  it("não inventa design system que o repo não tem — a inconsistência é o achado", () => {
    const rails = (fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/INCONSIST[ÊE]NCIA é o achado/i);
    expect(rails).toMatch(/Nunca invente/i);
  });

  it("declara a limitação: lê tokens, não renderiza a tela", () => {
    const rails = (fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/DECLARADO/);
    expect(body).toMatch(/não renderiza a tela/i);
  });

  it("só roda em repo com frontend", () => {
    expect((fm.guard_rails ?? []).join(" | ")).toMatch(/detectou frontend/i);
  });

  it("quantifica débito de design que o @debt-analyst incorpora", () => {
    expect((fm.exit_contract ?? []).join(" | ")).toMatch(/D[ée]bito de design.*@debt-analyst/i);
  });

  it("não propõe redesign — é arqueologia, não Planning", () => {
    expect((fm.guard_rails ?? []).join(" | ")).toMatch(/Não propor redesign/i);
  });
});

describe("conform de UI — o executor escreve no visual do repo", () => {
  it.each(["feature-adder", "migration-agent", "refactor-agent"])(
    "%s carrega design-system-<repo-id>",
    (agent) => {
      const raw = fs.readFileSync(path.join(AGENTS_DIR, "..", "execution", `${agent}.agent.md`), "utf-8");
      expect(raw).toMatch(/design-system-<repo-id>/);
    }
  );
});

describe("@dependency-mapper — o grafo entre repositórios", () => {
  const { fm, body } = readAgent("dependency-mapper.agent.md");

  it("produz o repo-graph.yaml e a leitura humana", () => {
    expect(fm.outputs).toContain(".github/artifacts/assessment/repo-graph.yaml");
    expect(fm.outputs).toContain(".github/artifacts/assessment/repo-graph.md");
  });

  it("lê manifestos, não AST — os sinais são declarativos", () => {
    const inputs = (fm.inputs ?? []).join(" | ");
    expect(inputs).toMatch(/pom\.xml/);
    expect(inputs).toMatch(/package\.json/);
    expect(inputs).toMatch(/openapi/);
  });

  it("exige evidence — grafo de achismo é pior que grafo nenhum", () => {
    const rails = (fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/NUNCA registre aresta sem evidence/i);
    expect(rails).toMatch(/NUNCA infira acoplamento por semelhança de nome/i);
  });

  it("não invade o território do @arch-discoverer (acoplamento intra-repo)", () => {
    expect((fm.guard_rails ?? []).join(" | ")).toMatch(/Não mapear acoplamento DENTRO de um repo/i);
    expect(body).toMatch(/Não confunda com o que já existe/i);
  });

  it("cobre os 5 tipos de acoplamento", () => {
    for (const kind of ["lib", "http", "event", "db", "contract"]) {
      expect(body, `kind '${kind}' não documentado`).toMatch(new RegExp(`\`?${kind}\`? —`));
    }
  });

  it("trata banco compartilhado como risco crítico", () => {
    expect(body).toMatch(/pior.{0,20}acoplamento/i);
    expect((fm.exit_contract ?? []).join(" | ")).toMatch(/kind: db.*risco crítico/i);
  });

  it("identifica ciclos e repos-folha (o que o Planning precisa)", () => {
    const contract = (fm.exit_contract ?? []).join(" | ");
    expect(contract).toMatch(/Ciclos entre repositórios/i);
    expect(contract).toMatch(/folha/i);
  });

  it("é read-only e não propõe modernização", () => {
    const rails = (fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/Read-only/i);
    expect(rails).toMatch(/Não propor modernização/i);
  });
});

describe("@assessor — integra o grafo no fluxo", () => {
  const { body } = readAgent("assessor.agent.md");

  it("roda o @dependency-mapper depois do D1 de todos os repos", () => {
    expect(body).toMatch(/## Passo 2b — @dependency-mapper \[CROSS-REPO\]/);
    expect(body).toMatch(/NÃO rode dentro do loop/i);
  });

  it("pula o grafo quando só há 1 repositório", () => {
    expect(body).toMatch(/Pule este passo se o inventário tiver só 1 repositório/i);
  });

  it("o @domain-extractor usa o grafo como insumo", () => {
    expect(body).toMatch(/Leia o `repo-graph\.yaml`.{0,80}antes de inferir contextos/is);
  });
});

describe("Gate de Bounded Contexts — promove candidate → accepted", () => {
  const { fm, body } = readAgent("assessor.agent.md");

  it("o exit_contract exige aprovação humana dos contextos", () => {
    expect((fm.exit_contract ?? []).join(" | ")).toMatch(/status: accepted em context-repos\.yaml/i);
  });

  it("o gate promove no context-repos.yaml", () => {
    expect(body).toMatch(/status: accepted/);
    expect(body).toMatch(/o humano aprovou neste gate/i);
  });

  it("rejected é preservado para auditoria", () => {
    expect(body).toMatch(/status: rejected/);
    expect(body).toMatch(/NÃO apague/i);
  });
});
