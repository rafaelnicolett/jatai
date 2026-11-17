import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * A documentação pública (`docs/` e `demo/README.md`, F7.2 e F7.4) é conferida
 * como código: link que não resolve, âncora que não existe, documento fora do
 * índice, contato ou dado pessoal, conteúdo comercial e a voz da Jataí. O
 * `content-scan` do CI cobre o conteúdo proibido por termo; aqui ficam as
 * regras que dependem da estrutura dos documentos.
 *
 * `docs/agentes/` é gerado do kit (`npm run docs:agents`) e entra só nas
 * conferências que valem para texto gerado.
 */

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const DEMO_README = path.join(ROOT, "demo", "README.md");

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

const rel = (file: string): string => path.relative(ROOT, file).split(path.sep).join("/");
const all = [...markdownFiles(DOCS), DEMO_README];
const generated = all.filter((f) => rel(f).startsWith("docs/agentes/"));
const written = all.filter((f) => !rel(f).startsWith("docs/agentes/"));
const text = (file: string): string => fs.readFileSync(file, "utf-8");

/** O texto de um documento sem os blocos de código. */
function prose(file: string): string {
  return text(file).replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, "");
}

/** A âncora que o GitHub gera para um título. */
function slug(heading: string): string {
  return heading
    .replace(/[`*_]|\[|\]\([^)]*\)/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  for (const line of prose(file).split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (m) anchors.add(slug(m[1]!));
  }
  return anchors;
}

interface Link {
  target: string;
  line: number;
}

function linksOf(file: string): Link[] {
  const links: Link[] = [];
  prose(file)
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) links.push({ target: m[1]!, line: i + 1 });
    });
  return links;
}

describe("documentação pública — links", () => {
  it("há documentos para conferir", () => {
    expect(written.length).toBeGreaterThan(30);
    expect(generated.length).toBeGreaterThan(40);
  });

  it("todo link relativo aponta para um arquivo que existe, e toda âncora existe no destino", () => {
    const problems: string[] = [];
    for (const file of all) {
      for (const { target, line } of linksOf(file)) {
        if (/^(https?:|mailto:)/i.test(target)) continue;
        const [pathPart, anchor] = target.split("#");
        const destination = pathPart ? path.resolve(path.dirname(file), pathPart) : file;
        if (!fs.existsSync(destination)) {
          problems.push(`${rel(file)}:${line}: ${target} não existe`);
          continue;
        }
        if (anchor && destination.endsWith(".md") && !anchorsOf(destination).has(anchor)) {
          problems.push(`${rel(file)}:${line}: a âncora #${anchor} não existe em ${rel(destination)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("links externos só vão para endereços https", () => {
    for (const file of written) {
      for (const { target, line } of linksOf(file)) {
        if (/^http:/i.test(target)) throw new Error(`${rel(file)}:${line}: link http sem TLS (${target})`);
      }
    }
  });
});

describe("documentação pública — índices", () => {
  it("o docs/README.md aponta para todo documento escrito à mão (as ADRs ficam no índice delas)", () => {
    const index = text(path.join(DOCS, "README.md"));
    const links = new Set(linksOf(path.join(DOCS, "README.md")).map((l) => path.resolve(DOCS, l.target.split("#")[0]!)));
    const missing = written
      .filter((f) => rel(f) !== "docs/README.md" && rel(f) !== "demo/README.md")
      .filter((f) => !/^docs\/decisoes\/\d{4}-/.test(rel(f)))
      .filter((f) => !links.has(f))
      .map(rel);
    expect(missing).toEqual([]);
    expect(index).toContain("decisoes/README.md");
    expect(index).toContain("agentes/README.md");
  });

  it("o índice das decisões lista cada ADR da pasta, com o status que está no arquivo", () => {
    const dir = path.join(DOCS, "decisoes");
    const index = text(path.join(dir, "README.md"));
    const adrs = fs.readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort();
    expect(adrs.length).toBeGreaterThan(15);
    for (const file of adrs) {
      const id = file.slice(0, 4);
      const row = index.split("\n").find((l) => l.includes(`](${file})`));
      expect(row, `${file} no índice`).toBeDefined();
      const status = text(path.join(dir, file)).match(/^## Status\s+(\w+)/m)?.[1];
      expect(["proposta", "aceita", "substituída"], `${file}: status`).toContain(status);
      expect(row, `${id}: status do índice`).toMatch(new RegExp(`\\| ${status === "substituída" ? "substituída" : status}[^|]* \\|$`));
      expect(text(path.join(dir, file)).split("\n")[0], file).toMatch(new RegExp(`^# ADR-${id}: `));
    }
  });

  it("o catálogo de agentes tem índice e ficha de todo agente que ele lista", () => {
    const index = text(path.join(DOCS, "agentes", "README.md"));
    const files = fs.readdirSync(path.join(DOCS, "agentes"));
    for (const m of index.matchAll(/\]\(([a-z0-9-]+\.md)\)/g)) expect(files, m[1]).toContain(m[1]);
    expect(files).toContain("skills.md");
  });
});

describe("documentação pública — o que não pode aparecer", () => {
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  // O único endereço aceito é o de exemplo do guia de voz (identidade-visual.md): não é de ninguém.
  const exemplos = new Set(["nome@empresa.com.br"]);
  const telefone = /(?<![\w-])(\+\d{2}\s?)?\(?\d{2}\)?\s?9?\d{4}-\d{4}(?![\w-])/;

  it("nenhum documento cita e-mail ou telefone", () => {
    for (const file of all) {
      // `@scope/pacote` e decorators não têm um domínio depois do arroba; e-mail tem.
      const achados = (prose(file).match(email) ?? []).map((e) => e.replace(/[.,;:]+$/, "")).filter((e) => !exemplos.has(e));
      expect(achados, `${rel(file)}: e-mail`).toEqual([]);
      expect(telefone.test(text(file)), `${rel(file)}: telefone`).toBe(false);
    }
  });

  it("nenhum documento escrito à mão cita conteúdo comercial, repositório privado ou o produto anterior pelo nome", () => {
    const proibido = /studio helyx|enterprise|oferta comercial|proposta comercial|landing page|helyx-vscode|helyx-landing|helyx-cloud|jatai-landing|api\.helyx|helyx\.build|pré-venda|preço de/i;
    for (const file of written) {
      const found = text(file).match(proibido);
      expect(found?.[0], `${rel(file)}`).toBeUndefined();
    }
  });

  it("o catálogo gerado não cita repositório privado nem contato", () => {
    for (const file of generated) {
      expect(text(file).match(/helyx-vscode|helyx-landing|helyx-cloud|jatai-landing/i)?.[0], rel(file)).toBeUndefined();
    }
  });
});

describe("documentação pública — a voz da Jataí", () => {
  // O que a Jataí escreve à mão: a metodologia, os guias, a arquitetura e os dois índices.
  const voz = written.filter((f) => !/^docs\/(decisoes|identidade-visual)/.test(rel(f)));

  it("sem emoji, sem ponto de exclamação e sem 'o usuário' fora dos blocos de código", () => {
    for (const file of voz) {
      const body = prose(file);
      expect(body.match(/\p{Extended_Pictographic}/u)?.[0], `${rel(file)}: emoji`).toBeUndefined();
      expect(body.match(/[^\n]*!(?!\[)[^\n]*/)?.[0], `${rel(file)}: exclamação`).toBeUndefined();
      expect(body.match(/\b(o|do|ao|pelo|no) usu[aá]rio\b/i)?.[0], `${rel(file)}: "usuário"`).toBeUndefined();
    }
  });

  it("todo bloco de código declara a linguagem", () => {
    for (const file of written) {
      const fences = [...text(file).matchAll(/^(```+)([^\n]*)$/gm)];
      // Os blocos alternam abertura e fechamento: só a abertura leva a linguagem.
      fences.forEach((m, i) => {
        if (i % 2 === 0) expect(m[2]!.trim(), `${rel(file)}: bloco sem linguagem`).not.toBe("");
      });
      expect(fences.length % 2, `${rel(file)}: bloco sem fechar`).toBe(0);
    }
  });

  it("o Mermaid não leva crase nem aspas soltas dentro do bloco", () => {
    for (const file of written) {
      for (const m of text(file).matchAll(/^```mermaid\n([\s\S]*?)^```/gm)) {
        const block = m[1]!;
        expect(block, `${rel(file)}: crase no Mermaid`).not.toContain("`");
        expect(block.split("\n")[0]!.trim(), `${rel(file)}: tipo de diagrama`).toMatch(/^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram)\b/);
        expect((block.match(/"/g) ?? []).length % 2, `${rel(file)}: aspas desbalanceadas`).toBe(0);
      }
    }
  });
});
