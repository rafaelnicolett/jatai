import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "@data";
import { getBrownfieldSchema, getWizardSchema } from "../../src/wizard/wizard-schema";
import { toGoldenBrand } from "../../tests/golden/lib/brand";
import { COMMON_FACTS, FOLDER_COPY, HARNESS_FACTS, INSTALL_COPY, MODE_COPY, OPENING, REPOSITORIES_COPY, SCREEN_COPY } from "../src/apps/wizard/journeyCopy";

/**
 * A copy da jornada (F4.3): o que ela diz que o kit instala existe na árvore
 * que o gerador de fato escreve (golden do gerador), a voz segue o design
 * system v2, e nenhum texto cita o chat antigo (`@concierge`, `/concierge`,
 * `@maestro`): a entrada é o agente da marca e o chat da extensão é o guia
 * (ADR-0025).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "../../tests/golden/__golden__/generator");

/** Caminhos que o gerador escreveu num caso do golden, sem o prefixo do caso e sem o escape `.golden`. */
function written(caseId: string): Set<string> {
  const tree = JSON.parse(fs.readFileSync(path.join(GOLDEN, caseId, "tree.json"), "utf-8")) as { entries: Record<string, string> };
  const out = new Set<string>();
  for (const key of Object.keys(tree.entries)) {
    const rest = key.replace(/\.golden/g, "").split("/").slice(1).join("/");
    if (rest !== "") out.add(rest);
  }
  return out;
}

/** O caminho, na marca do golden (o golden foi gravado com a Helyx), existe no que foi escrito (pasta ou arquivo). */
const has = (tree: Set<string>, p: string): boolean => {
  const golden = toGoldenBrand(p);
  return tree.has(golden) || tree.has(`${golden.replace(/\/$/, "")}/`) || [...tree].some((entry) => entry.startsWith(golden.endsWith("/") ? golden : `${golden}/`));
};

describe.each([["brownfield"], ["greenfield"]] as const)("o que a jornada diz que o %s instala existe no que o gerador escreve", (mode) => {
  it.each([["claude"], ["copilot"]] as const)("harness %s", (host) => {
    const tree = written(`${mode}-${host}-padrao`);
    const facts = HARNESS_FACTS[host];
    expect(has(tree, facts.agents), facts.agents).toBe(true);
    expect(has(tree, facts.entryFile), facts.entryFile).toBe(true);
    expect(has(tree, facts.skills), facts.skills).toBe(true);
    for (const file of facts.instructions) expect(has(tree, file), file).toBe(true);
    expect(has(tree, facts.mcp), facts.mcp).toBe(true);
    for (const hook of facts.hooks ?? []) expect(has(tree, hook), hook).toBe(true);
    if (facts.hooks === null) expect(has(tree, ".claude/settings.json")).toBe(false);
    for (const common of [COMMON_FACTS.state, COMMON_FACTS.scripts]) expect(has(tree, common), common).toBe(true);
    if (mode === "brownfield") expect(has(tree, COMMON_FACTS.lock), COMMON_FACTS.lock).toBe(true);
  });

  it("as pastas do projeto novo e do workspace que a revisão cita", () => {
    const tree = written(`${mode}-claude-padrao`);
    const claimed = mode === "greenfield" ? ["code/", "api/", "infrastructure/", "pipelines/", "docs/", "features/"] : ["repos/", "docs/", BRAND.files.config];
    for (const p of claimed) {
      // o golden do projeto novo grava o config com o nome legado (BUG-10, aberto): só o brownfield o cita na revisão
      expect(has(tree, p), p).toBe(true);
    }
  });
});

/** Todo texto da jornada, sem o que é caminho. */
function allCopy(): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  [SCREEN_COPY, OPENING, MODE_COPY, REPOSITORIES_COPY, FOLDER_COPY, INSTALL_COPY, COMMON_FACTS, HARNESS_FACTS].forEach(walk);
  return out;
}

describe("a voz da jornada", () => {
  it("sem exclamação, sem pedido de desculpa e sem 'oops'", () => {
    for (const text of allCopy()) {
      expect(text, text).not.toContain("!");
      expect(text, text).not.toMatch(/desculp|oops|ops,|infelizmente/i);
    }
  });

  it("a marca é feminina: 'a Jataí', nunca 'o Jataí'", () => {
    const name = BRAND.displayName;
    for (const text of allCopy()) expect(text, text).not.toMatch(new RegExp(`\\b[Oo] ${name}`));
    expect(SCREEN_COPY.abertura.title).toBe(`Vamos preparar a ${name}`);
  });

  it("o botão de cada passo tem um verbo ou uma ação", () => {
    for (const [id, copy] of Object.entries(SCREEN_COPY)) expect(copy.next.length, id).toBeGreaterThan(0);
  });

  it("o agente de entrada e o guia do chat vêm da marca, nos textos que citam o chat", () => {
    expect(COMMON_FACTS.guideNote).toBe(`O chat da extensão, @${BRAND.guide.name}, mostra onde você está e leva ao agente ${BRAND.participant.name}.`);
    expect(HARNESS_FACTS.claude.entry).toBe(`o agente @${BRAND.participant.name}`);
    expect(HARNESS_FACTS.copilot.entryFile).toBe(`.github/agents/${BRAND.files.orchestratorAgent}`);
  });
});

describe("nenhum texto da jornada cita o chat antigo (ADR-0025)", () => {
  const FORBIDDEN = /concierge|maestro/i;

  it("a copy e as opções do schema do host (projeto novo e projeto existente)", async () => {
    for (const text of allCopy()) expect(text, text).not.toMatch(FORBIDDEN);
    for (const schema of [await getWizardSchema(), await getBrownfieldSchema()]) {
      for (const step of schema) {
        expect(`${step.title} ${step.description}`, step.key).not.toMatch(FORBIDDEN);
        for (const option of step.options ?? []) expect(`${option.label} ${option.description ?? ""} ${option.badge ?? ""}`, `${step.key}/${option.value}`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it("o código da jornada, do lado do webview e do lado do host", () => {
    const dirs = [path.join(HERE, "../src/apps/wizard"), path.join(HERE, "../../src/wizard")];
    for (const dir of dirs) {
      for (const file of fs.readdirSync(dir)) {
        if (!/\.(ts|tsx|css)$/.test(file)) continue;
        expect(fs.readFileSync(path.join(dir, file), "utf-8"), path.join(dir, file)).not.toMatch(FORBIDDEN);
      }
    }
  });
});
