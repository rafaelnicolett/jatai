import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { BRAND, renderBrandPlaceholders } from "../src/data/brand.pure";

/**
 * Guard rails e insumos do Discovery — achados do primeiro teste real.
 */
// Kit local (fonte canônica dentro do repo). Antes: "../../../../brownfield-templates",
// fora do repositório, que dava ENOENT num checkout limpo (D42).
const AGENTS = path.resolve(__dirname, "../dist/kit/brownfield-templates/agents/discovery");
const TEMPLATES = path.resolve(__dirname, "../dist/kit/brownfield-templates");

function readAgent(file: string): { fm: Record<string, string[]>; body: string } {
  const raw = renderBrandPlaceholders(fs.readFileSync(path.join(AGENTS, file), "utf-8"));
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
  return { fm: (yaml.load(m[1]!) ?? {}) as Record<string, string[]>, body: m[2]! };
}

const ALL = fs.readdirSync(AGENTS).filter((f) => f.endsWith(".agent.md"));

describe("read-only estrito — o guard_rail que vazou no teste real", () => {
  /**
   * O agente rodou `mvn` e criou target/ dentro do repo do cliente. Ao pé da
   * letra ele não desobedeceu: "não modifica código" — e build não é código.
   * O guard_rail estava errado, não o agente.
   */
  it.each(ALL)("%s proíbe escrever QUALQUER coisa em repos/", (file) => {
    const rails = (readAgent(file).fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/READ-ONLY ESTRITO/);
    expect(rails).toMatch(/nunca escreva NADA em repos\//i);
  });

  it("fecha explicitamente a brecha do build (target/, dist/, cache)", () => {
    const rails = (readAgent("assessor.agent.md").fm.guard_rails ?? []).join(" | ");
    expect(rails).toMatch(/build/i);
    expect(rails).toMatch(/target\//);
    expect(rails).toMatch(/scratchpad/i);
  });

  it("nenhum agente mantém a versão fraca ('não modifica código')", () => {
    for (const file of ALL) {
      const rails = (readAgent(file).fm.guard_rails ?? []).join(" | ");
      const weak = /^Read-only(\s|$)|Read-only — (não modific|nunca modific)/m.test(rails);
      expect(weak, `${file} ainda tem guard_rail read-only fraco`).toBe(false);
    }
  });
});

describe("histórico do git — explica o porquê, não decide a arquitetura", () => {
  const { body } = readAgent("assessor.agent.md");

  it("declara que a arquitetura é do estado atual (a branch em ref)", () => {
    expect(body).toMatch(/arquitetura, a stack e o débito são do estado ATUAL/i);
  });

  it("permite churn/hotspot — é temporal e invisível num snapshot", () => {
    expect(body).toMatch(/Churn × complexidade = hotspot/i);
  });

  it("proíbe reportar débito de código já removido", () => {
    expect(body).toMatch(/NUNCA use o histórico para/i);
    expect(body).toMatch(/débito de código que já foi removido/i);
  });

  it("exige que todo finding exista no pinned_sha", () => {
    expect(body).toMatch(/Todo finding precisa existir no\s+.?pinned_sha/is);
  });

  it("manda perguntar a branch em vez de assumir main", () => {
    expect(body).toMatch(/Sobre o `ref`: pergunte, não assuma/i);
    expect(body).toMatch(/branch de migração em curso/i);
  });
});

describe("instruções de IA do cliente — a convenção que o time já declarou", () => {
  const { fm, body } = readAgent("coding-archaeologist.agent.md");

  it("lê copilot-instructions, CLAUDE.md, AGENTS.md e .cursorrules do repo", () => {
    const inputs = (fm.inputs ?? []).join(" | ");
    for (const f of ["copilot-instructions.md", ".github/instructions/**", "CLAUDE.md", "AGENTS.md", ".cursorrules"]) {
      expect(inputs, `não lê ${f} do repo do cliente`).toContain(f);
    }
  });

  it("trata como declaração, não como verdade — o código vence", () => {
    expect(body).toMatch(/\*\*o código\s+vence\*\*/i);
    expect(body).toMatch(/Declarado e NÃO cumprido/);
  });

  it("a divergência entre instrução e código é um achado", () => {
    expect(body).toMatch(/sinalize a divergência como débito/i);
  });

  it("@tech-mapper também lê as instruções (revelam stack declarada)", () => {
    const inputs = (readAgent("tech-mapper.agent.md").fm.inputs ?? []).join(" | ");
    expect(inputs).toMatch(/copilot-instructions\.md/);
    expect(inputs).toMatch(/CLAUDE\.md/);
  });
});

describe("docs/input — material do cliente que o código não conta", () => {
  it("@business-archeologist lê a pasta", () => {
    expect((readAgent("business-archeologist.agent.md").fm.inputs ?? []).join(" | ")).toContain("docs/input/**");
  });

  it("@domain-extractor lê a pasta (glossário em linguagem de negócio)", () => {
    expect((readAgent("domain-extractor.agent.md").fm.inputs ?? []).join(" | ")).toContain("docs/input/**");
  });
});

// O kit escreve a marca como `{{brand.*}}` e o gerador a renderiza ao instalar
// (ADR-0013): o produto se apresenta pelo nome do brand.json no arquivo renderizado.
describe("nome do produto — a marca do brand.json, não AI-SDK", () => {
  const clientFacing = ["claude-instructions.md", "copilot-instructions.md", "AGENTS.md"];

  it.each(clientFacing)("%s não vaza o nome interno do repo", (file) => {
    const raw = fs.readFileSync(path.join(TEMPLATES, file), "utf-8");
    expect(raw).not.toMatch(/AI-SDK/);
    expect(raw).not.toMatch(/AI Software Delivery Kit/);
  });

  it.each(clientFacing)("%s apresenta o produto pelo nome da marca", (file) => {
    expect(renderBrandPlaceholders(fs.readFileSync(path.join(TEMPLATES, file), "utf-8"))).toContain(BRAND.displayName);
  });

  it("os prompts dos sub-agentes não citam AI-SDK", () => {
    for (const file of ALL) {
      const raw = fs.readFileSync(path.join(AGENTS, file), "utf-8");
      expect(raw, `${file} cita AI-SDK`).not.toMatch(/AI-SDK/);
    }
  });
});
