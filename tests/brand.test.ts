import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { BRAND, brandValueAt, renderBrandPlaceholders, type Brand } from "../src/data/brand.pure";

/**
 * Marca como dado (ADR-0013, F1.2): o acessor puro de `src/data/brand.json`.
 * O que o código e o kit leem tem que vir deste arquivo, com a forma certa.
 */

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/data/brand.json"), "utf-8")) as Brand;

/** Marca sintética, para provar que o renderizador não depende da marca em uso. */
const OUTRA: Brand = {
  ...BRAND,
  name: "outra",
  displayName: "Outrá",
  files: { config: "outra.config.yaml", cli: "outra-state.cjs", orchestratorAgent: "outra.agent.md", slashCommand: "outra.md" },
  cliName: "outra-state",
};

describe("BRAND — leitura tipada do brand.json", () => {
  it("é o próprio brand.json, campo por campo", () => {
    expect(BRAND).toEqual(raw);
  });

  it("está congelado em todos os níveis (ninguém troca a marca em runtime)", () => {
    expect(Object.isFrozen(BRAND)).toBe(true);
    expect(Object.isFrozen(BRAND.files)).toBe(true);
    expect(Object.isFrozen(BRAND.legacy.configFiles)).toBe(true);
  });

  it("nome ASCII minúsculo, sem espaço, para ids, comandos e arquivos", () => {
    expect(BRAND.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(BRAND.commandPrefix).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(BRAND.configSection).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(BRAND.participant.name).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("prefixo de env em maiúsculas e terminado em _", () => {
    expect(BRAND.envPrefix).toMatch(/^[A-Z][A-Z0-9]*_$/);
  });

  it("nomes de arquivo do workspace são só nomes (sem pasta)", () => {
    for (const file of Object.values(BRAND.files)) expect(file).not.toMatch(/[\\/]/);
  });

  it("a seção legacy existe com todas as listas (a F1.3 lê daqui o que é legado)", () => {
    expect(Object.keys(BRAND.legacy).sort()).toEqual(
      ["cliFiles", "configFiles", "displayNames", "envPrefixes", "gitignoreMarkers", "names", "orchestratorAgents", "participants", "slashCommands"].sort()
    );
    for (const list of Object.values(BRAND.legacy)) expect(Array.isArray(list)).toBe(true);
  });
});

describe("brandValueAt — caminho pontuado", () => {
  it("resolve campo de topo e aninhado", () => {
    expect(brandValueAt("displayName")).toBe(BRAND.displayName);
    expect(brandValueAt("files.config")).toBe(BRAND.files.config);
    expect(brandValueAt("participant.name")).toBe(BRAND.participant.name);
  });

  it("caminho inexistente, objeto ou lista dão undefined", () => {
    expect(brandValueAt("files.nada")).toBeUndefined();
    expect(brandValueAt("files")).toBeUndefined();
    expect(brandValueAt("legacy.configFiles")).toBeUndefined();
    expect(brandValueAt("constructor")).toBeUndefined();
    expect(brandValueAt("toString")).toBeUndefined();
  });
});

describe("renderBrandPlaceholders — {{brand.*}} do kit", () => {
  it("troca cada placeholder pelo valor da marca", () => {
    expect(renderBrandPlaceholders("node .github/scripts/{{brand.files.cli}} · @{{brand.participant.name}} · {{brand.displayName}}")).toBe(
      `node .github/scripts/${BRAND.files.cli} · @${BRAND.participant.name} · ${BRAND.displayName}`
    );
  });

  it("usa a marca recebida, não a marca em uso", () => {
    expect(renderBrandPlaceholders("leia `{{brand.files.config}}` no {{brand.displayName}}", OUTRA)).toBe("leia `outra.config.yaml` no Outrá");
  });

  it("texto sem placeholder sai idêntico, byte a byte", () => {
    const text = "---\nname: x\n---\n{{var}} {{ brand.name }} {brand.name} $(x)\r\n";
    expect(renderBrandPlaceholders(text)).toBe(text);
  });

  it("placeholder que não resolve fica como está (o brand-lint reprova o kit que o tiver)", () => {
    expect(renderBrandPlaceholders("{{brand.nada}} {{brand.files}} {{brand.name}}")).toBe(`{{brand.nada}} {{brand.files}} ${BRAND.name}`);
  });
});
