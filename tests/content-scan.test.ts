import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  normalizeTerm,
  hashTerm,
  tokenSequences,
  createMatcher,
  scanText,
  scanRepo,
  loadTerms,
} from "../scripts/content-scan.mjs";

/**
 * `scripts/content-scan.mjs` (F2.3) reprova conteúdo proibido sem guardar a
 * lista em texto claro: só o SHA-256 do termo normalizado. Aqui tudo usa termos
 * FICTÍCIOS ("Zorblax Lavanda", "quixotema"). Nenhum termo real aparece neste
 * arquivo nem em nenhum outro do repositório.
 */

const SCRIPT = path.resolve(__dirname, "../scripts/content-scan.mjs");

type Term = { id: string; category: string; sha256: string };
const TERMS: Term[] = [
  { id: "F01", category: "cliente", sha256: hashTerm("Zorblax Lavanda") },
  { id: "F02", category: "terceiro", sha256: hashTerm("quixotema") },
];

function idsIn(line: string): string[] {
  return createMatcher(TERMS)
    .scanLine(line)
    .map((t: Term) => t.id)
    .sort();
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "content-scan-"));
}

function write(root: string, rel: string, data: string | Buffer): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

describe("content-scan — normalização e hash", () => {
  it("grafias diferentes do mesmo termo viram a mesma forma e o mesmo hash", () => {
    const variants = ["Zorblax Lavanda", "zorblax-lavanda", "ZORBLAX_LAVANDA", "ZorblaxLavanda", "Zórblax Lavandá", "zorblax.lavanda"];
    expect(new Set(variants.map(normalizeTerm))).toEqual(new Set(["zorblaxlavanda"]));
    expect(new Set(variants.map(hashTerm)).size).toBe(1);
  });

  it("o hash é o SHA-256 hex da forma normalizada (o formato da lista)", () => {
    const expected = crypto.createHash("sha256").update("zorblaxlavanda", "utf8").digest("hex");
    expect(hashTerm("Zorblax Lavanda")).toBe(expected);
  });

  it("tokeniza por separador e também nas fronteiras de camelCase", () => {
    expect(tokenSequences("AcmeNFoguetes x")).toEqual([
      ["acmenfoguetes", "x"],
      ["acme", "n", "foguetes", "x"],
    ]);
    expect(tokenSequences("sem-camel aqui")).toEqual([["sem", "camel", "aqui"]]);
  });
});

describe("content-scan — casamento por linha", () => {
  it.each([
    ["o cliente Zorblax Lavanda pediu", ["F01"]],
    ["repo zorblax-lavanda-api", ["F01"]],
    ["class ZorblaxLavandaService {}", ["F01"]],
    ["zorblax_lavanda e zorblaxlavanda", ["F01"]],
    ["ZÓRBLAX LAVANDA, com acento", ["F01"]],
    ["fonte: https://quixotema.example.com/x", ["F02"]],
    ["Quixotema e Zorblax Lavanda na mesma linha", ["F01", "F02"]],
  ])("acha: %s", (line, ids) => {
    expect(idsIn(line)).toEqual(ids);
  });

  it.each([
    "superquixotemas (termo dentro de um token maior não casa)",
    "só zorblax, sem o resto",
    "lavanda zorblax (ordem trocada)",
    "zorblax\nlavanda",
  ])("não acha: %s", (line) => {
    expect(scanText(line, createMatcher(TERMS))).toEqual([]);
  });

  it("devolve a linha 1-based de cada achado", () => {
    const text = "linha limpa\n\nzorblax lavanda aqui\r\noutra linha\nquixotema";
    const hits = scanText(text, createMatcher(TERMS)).map((h: { line: number; term: Term }) => [h.line, h.term.id]);
    expect(hits).toEqual([
      [3, "F01"],
      [5, "F02"],
    ]);
  });

  it("termo com mais de 4 tokens nunca casa (limite documentado) e o --hash recusa", () => {
    const long = "um dois tres quatro cinco";
    const matcher = createMatcher([{ id: "X", category: "cliente", sha256: hashTerm(long) }]);
    expect(scanText(long, matcher)).toEqual([]);
    const res = spawnSync(process.execPath, [SCRIPT, "--hash", long], { encoding: "utf8" });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("de 1 a 4 tokens");
  });

  it("--hash imprime o mesmo hash que hashTerm", () => {
    const res = spawnSync(process.execPath, [SCRIPT, "--hash", "Zorblax Lavanda"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe(hashTerm("Zorblax Lavanda"));
  });
});

describe("content-scan — varredura de pasta", () => {
  function fixtureTree(): string {
    const root = tmpDir();
    write(root, "ok.md", "nada aqui\n");
    write(root, "docs/nota.md", "a\nb\nprojeto zorblax-lavanda\n");
    write(root, "quixotema-notas.md", "conteúdo limpo\n");
    write(root, "node_modules/pkg/index.js", "zorblax lavanda\n");
    write(root, "img.bin", Buffer.concat([Buffer.from([0x89, 0x00, 0x01]), Buffer.from("zorblax lavanda")]));
    return root;
  }

  it("acha no conteúdo e no path; pula binário e node_modules", () => {
    const { scanned, skipped, hits } = scanRepo(fixtureTree(), TERMS);
    const found = hits.map((h: { file: string; line: number; term: Term }) => `${h.file}:${h.line}:${h.term.id}`).sort();
    expect(found).toEqual(["docs/nota.md:3:F01", "quixotema-notas.md:0:F02"]);
    expect(scanned).toBe(3);
    expect(skipped).toBe(1);
  });

  it("CLI: exit 1 com path:linha e categoria, sem nunca imprimir o termo", () => {
    const root = fixtureTree();
    const terms = path.join(tmpDir(), "terms.json");
    fs.writeFileSync(terms, JSON.stringify({ terms: TERMS }));
    const res = spawnSync(process.execPath, [SCRIPT, "--root", root, "--terms", terms], { encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("docs/nota.md:3 · cliente (F01)");
    expect(res.stdout).toContain("quixotema-notas.md (no path) · terceiro (F02)");
    expect(res.stdout).toMatch(/^resumo: 2 ocorrência\(s\)/m);
    const printed = res.stdout.split("\n").filter((l) => !l.includes("quixotema-notas.md"));
    expect(printed.join("\n").toLowerCase()).not.toMatch(/zorblax|lavanda|quixotema/);
  });

  it("CLI: exit 0 numa pasta limpa", () => {
    const root = tmpDir();
    write(root, "a.md", "tudo certo\n");
    const terms = path.join(tmpDir(), "terms.json");
    fs.writeFileSync(terms, JSON.stringify({ terms: TERMS }));
    const res = spawnSync(process.execPath, [SCRIPT, "--root", root, "--terms", terms], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/^resumo: nenhum conteúdo proibido/m);
  });
});

describe("content-scan — lista de termos", () => {
  it("a lista real é válida, cobre as 3 categorias e só guarda id, categoria e sha256", () => {
    const terms = loadTerms();
    expect(new Set(terms.map((t: Term) => t.category))).toEqual(new Set(["cliente", "terceiro", "comercial-interno"]));
    const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../scripts/content-scan-terms.json"), "utf8"));
    for (const t of raw.terms) expect(Object.keys(t).sort()).toEqual(["category", "id", "sha256"]);
    const fictitious = new Set(TERMS.map((t) => t.sha256));
    expect(terms.some((t: Term) => fictitious.has(t.sha256))).toBe(false);
  });

  it.each([
    ["sha256 inválido", { terms: [{ id: "A", category: "cliente", sha256: "abc" }] }, /sha256 inválido/],
    ["categoria inválida", { terms: [{ id: "A", category: "outra", sha256: "a".repeat(64) }] }, /categoria inválida/],
    [
      "id repetido",
      {
        terms: [
          { id: "A", category: "cliente", sha256: "a".repeat(64) },
          { id: "A", category: "cliente", sha256: "b".repeat(64) },
        ],
      },
      /id repetido/,
    ],
    ["sem terms", {}, /falta o array/],
  ])("recusa lista com %s", (_name, doc, message) => {
    const file = path.join(tmpDir(), "terms.json");
    fs.writeFileSync(file, JSON.stringify(doc));
    expect(() => loadTerms(file)).toThrow(message);
  });
});
