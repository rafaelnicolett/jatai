import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { WizardStateSchema } from "../src/types";

/**
 * Facade do gerador (F3.4, passo 6): o gerador não importa `vscode`, e a
 * única coisa que pedia ao host (a pasta aberta no editor) entra por porta.
 */

const SRC = path.resolve(__dirname, "../src");

/** Imports relativos e de pacote de um arquivo TS (estático, sem executar). */
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, "utf-8");
  const specs: string[] = [];
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/g)) specs.push(m[1]!);
  for (const m of text.matchAll(/(?:^|\n)\s*import\s+"([^"]+)"/g)) specs.push(m[1]!);
  return specs;
}

function resolveTs(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) if (fs.existsSync(candidate)) return candidate;
  return null; // .json e afins
}

describe("gerador sem vscode (F3.4)", () => {
  it("nenhum módulo alcançável a partir de src/generator/ importa 'vscode'", () => {
    const entries: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".ts")) entries.push(full);
      }
    };
    walk(path.join(SRC, "generator"));
    const seen = new Set<string>();
    const offenders: string[] = [];
    const queue = [...entries];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of importsOf(file)) {
        if (spec === "vscode") offenders.push(path.relative(SRC, file));
        if (!spec.startsWith(".")) continue;
        const next = resolveTs(file, spec);
        if (next !== null) queue.push(next);
      }
    }
    expect(offenders).toEqual([]);
    expect(seen.size).toBeGreaterThan(entries.length); // a varredura seguiu imports para fora de src/generator
  });
});

describe("StructureGenerator.resolveTargetDir — destino do greenfield", () => {
  const base = { projectName: "orbita", hostAdapter: "claude", backendStack: "python-api" } as const;

  it("a pasta escolhida no Wizard vale, normalizada e sem espaços nas pontas", () => {
    const state = WizardStateSchema.parse({ ...base, targetDirectory: `  ${path.join(os.tmpdir(), "a", "..", "destino")}  ` });
    const gen = new StructureGenerator(undefined, { openFolder: () => "/nao/usada" });
    expect(gen.resolveTargetDir(state)).toBe(path.join(os.tmpdir(), "destino"));
  });

  it("sem pasta escolhida, uma subpasta do projeto na pasta aberta no editor (porta openFolder)", () => {
    const state = WizardStateSchema.parse(base);
    const open = path.join(os.tmpdir(), "workspace-aberto");
    expect(new StructureGenerator(undefined, { openFolder: () => open }).resolveTargetDir(state)).toBe(path.join(open, "orbita"));
  });

  it("sem pasta escolhida e sem pasta aberta (porta ausente ou vazia), <home>/<projeto>", () => {
    const state = WizardStateSchema.parse(base);
    expect(new StructureGenerator().resolveTargetDir(state)).toBe(path.join(os.homedir(), "orbita"));
    expect(new StructureGenerator(undefined, { openFolder: () => undefined }).resolveTargetDir(state)).toBe(path.join(os.homedir(), "orbita"));
  });
});
