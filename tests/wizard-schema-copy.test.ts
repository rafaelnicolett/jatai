import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getBrownfieldSchema, getWizardSchema } from "../src/wizard/wizard-schema";
import { BRAND } from "../src/data/brand.pure";

/**
 * O texto do schema do Wizard (F4.3): em português, e sem o chat antigo da
 * extensão. O Wizard descrevia o host como "Chat mode @concierge", "Slash
 * commands /concierge" e "Chat mode @maestro", e nada disso existe mais: o chat
 * da extensão é o guia e a entrada da metodologia é o agente da marca nos dois
 * harnesses, com o MCP e (no Claude Code) os hooks que o kit instala sozinho
 * (ADR-0025).
 */

const FORBIDDEN = /concierge|maestro/i;

describe("texto do schema do Wizard", () => {
  it("REGRESSÃO: nenhum passo nem opção, nos dois schemas, cita @concierge, /concierge nem @maestro", async () => {
    for (const schema of [await getWizardSchema(), await getBrownfieldSchema()]) {
      for (const step of schema) {
        expect(`${step.title} ${step.description}`, step.key).not.toMatch(FORBIDDEN);
        for (const option of step.options ?? []) {
          expect(`${option.label} ${option.description ?? ""} ${option.badge ?? ""}`, `${step.key}/${option.value}`).not.toMatch(FORBIDDEN);
        }
      }
    }
  });

  it("o código do host do Wizard também não cita o chat antigo", () => {
    const dir = path.join(__dirname, "../src/wizard");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      expect(fs.readFileSync(path.join(dir, file), "utf-8"), file).not.toMatch(FORBIDDEN);
    }
  });

  it("nos dois schemas, o harness diz que a entrada é o agente da marca, e as opções do harness são os dois", async () => {
    const greenfield = (await getWizardSchema()).find((s) => s.key === "hostAdapter")!;
    const brownfield = (await getBrownfieldSchema()).find((s) => s.key === "hostAdapter")!;
    expect(greenfield.options?.map((o) => o.value)).toEqual(["copilot", "claude"]);
    expect(brownfield.options?.map((o) => o.value)).toEqual(["copilot", "claude"]);
    expect(brownfield.description).toContain(`o agente ${BRAND.participant.name}`);
    expect(brownfield.description).toContain(".claude/agents/");
  });

  it("toda opção de escolha tem texto de apoio em português (sem os termos em inglês do texto antigo)", async () => {
    for (const schema of [await getWizardSchema(), await getBrownfieldSchema()]) {
      for (const step of schema) {
        for (const option of step.options ?? []) {
          expect(option.description ?? "", `${step.key}/${option.value}`).not.toBe("");
          expect(option.description ?? "", `${step.key}/${option.value}`).not.toMatch(/\b(Requer|Recomendado|Recommended|Padrão para)\b/);
        }
      }
    }
  });
});
