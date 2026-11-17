import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import JSZip from "jszip";

/**
 * A16a / L12 / D27 (F6.2, mod-missao-open-source) — zip-slip na extração do
 * template (`StructureGenerator._generateInto`, caminho zip).
 *
 * O gerador gravava `path.join(dir, entrada)` sem checar se o destino ficava
 * dentro do projeto. O `../` com `/` só não escapava porque o JSZip 3.10.1
 * resolve o nome ao carregar; o JSZip não toca em `\`, em caminho absoluto
 * nem em letra de drive, e no Windows `..\..\x` é traversal de verdade. Aqui o
 * gerador passa a validar cada entrada por conta própria: entrada insegura
 * faz a geração falhar, com rollback (nada gravado, nem dentro nem fora).
 *
 * O zip entra pela porta `TemplateSource` do construtor (F2.1): uma fonte
 * falsa devolve o zip do caso, sem registry e sem rede.
 */

import { StructureGenerator } from "../src/generator/StructureGenerator";
import { zipEntryDestination } from "../src/generator/zip-entry-path";
import type { WizardState } from "../src/types";
import type { ResolvedTemplateManifest, TemplateSource } from "../src/adapters/templates/TemplateSource";

const ctl = { zip: null as Buffer | null };

/** Fonte de template do caso: devolve o zip de `ctl`, sem rede. */
class FakeTemplateSource implements TemplateSource {
  async getManifest(): Promise<ResolvedTemplateManifest | null> {
    return null;
  }
  async getZip(): Promise<Buffer | null> {
    if (ctl.zip === null) throw new Error("fonte de template indisponível (teste: sem zip)");
    return ctl.zip;
  }
}

async function zipWith(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("README.md.tmpl", "# {{project_name}}\n");
  for (const [name, text] of Object.entries(entries)) zip.file(name, text);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Lista recursivamente tudo sob `root`, em paths relativos com `/`. */
async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    out.push(entry.isDirectory() ? `${rel}/` : rel);
    if (entry.isDirectory()) out.push(...(await walk(full)).map((p) => `${rel}/${p}`));
  }
  return out;
}

describe("zipEntryDestination — destino de entrada do zip (A16a)", () => {
  const root = path.resolve(os.tmpdir(), "raiz-zip");

  it.each([
    ["../fora.txt"],
    ["a/../../fora.txt"],
    ["a/./b.txt"],
    ["..\\fora.txt"],
    ["/etc/fora.txt"],
    ["C:/fora.txt"],
    ["c:fora.txt"],
    ["a/\0b.txt"],
    [""],
    ["a/.."],
  ])("recusa %j sem depender do JSZip", (entrada) => {
    expect(zipEntryDestination(root, entrada)).toBeNull();
  });

  it.each([
    ["README.md", ["README.md"]],
    ["src/app/main.py", ["src", "app", "main.py"]],
    ["..config/x.txt", ["..config", "x.txt"]],
    [".github/workflows/ci.yml", [".github", "workflows", "ci.yml"]],
  ])("aceita %j dentro da raiz", (entrada, partes) => {
    expect(zipEntryDestination(root, entrada)).toBe(path.join(root, ...partes));
  });
});

describe("StructureGenerator — zip-slip na extração do template (A16a)", () => {
  let sandbox: string;
  let targetDir: string;

  const state = (): WizardState => ({
    projectName: "orbita",
    hostAdapter: "claude",
    backendStack: "python-api",
    backendArchitecture: "hexagonal",
    frontendStack: "none",
    database: "postgresql",
    cloud: "none",
    cicd: "github-actions",
    deliveryMode: "full-cycle",
    targetDirectory: targetDir,
  });

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "zip-slip-"));
    // tmp do gerador = <sandbox>/workspace/.helyx-tmp-<ms>; `..\..\x` a partir
    // dele cai em <sandbox>/x, ainda dentro do sandbox do teste.
    targetDir = path.join(sandbox, "workspace", "projeto");
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
  });

  afterEach(async () => {
    ctl.zip = null;
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it.each([
    ["traversal com contrabarra (Windows)", "..\\..\\fora-zip-slip.txt"],
    ["traversal misto", "src\\..\\..\\..\\fora-zip-slip.txt"],
    ["caminho absoluto POSIX", "/fora-zip-slip.txt"],
    ["letra de drive", "C:/fora-zip-slip.txt"],
    ["'..' que nasce do corte do sufixo .tmpl", "src/...tmpl"],
    ["'.' que nasce do corte do sufixo .tmpl", "src/..tmpl"],
  ])("REGRESSÃO: entrada insegura (%s) faz a geração falhar com rollback, sem gravar nada", async (_caso, entrada) => {
    ctl.zip = await zipWith({ [entrada]: "zip-slip {{project_name}}\n" });

    await expect(new StructureGenerator(new FakeTemplateSource()).generate(state())).rejects.toThrow(/unsafe path in template zip/i);

    expect(await walk(sandbox)).toEqual(["workspace/"]);
  });

  it("zip só com entradas relativas continua gerando o projeto", async () => {
    ctl.zip = await zipWith({ "src/app/main.py.tmpl": "print('{{project_name}}')\n" });

    const isLocal = await new StructureGenerator(new FakeTemplateSource()).generate(state());

    expect(isLocal).toBe(false);
    expect(await fs.readFile(path.join(targetDir, "README.md"), "utf-8")).toBe("# orbita\n");
    expect(await fs.readFile(path.join(targetDir, "src/app/main.py"), "utf-8")).toBe("print('orbita')\n");
  });
});
