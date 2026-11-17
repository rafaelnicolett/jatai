import { describe, it, expect } from "vitest";
import { getWizardSchema } from "../src/wizard/wizard-schema";

describe("getWizardSchema", () => {
  it("returns non-empty schema", async () => {
    const schema = await getWizardSchema();
    expect(schema.length).toBeGreaterThan(0);
  });

  it("all required steps have required=true", async () => {
    const schema = await getWizardSchema();
    const requiredKeys = ["projectName", "hostAdapter", "backendStack"];
    for (const key of requiredKeys) {
      const step = schema.find((s) => s.key === key);
      expect(step, `Step for key '${key}' should exist`).toBeDefined();
      expect(step?.required, `Step '${key}' should be required`).toBe(true);
    }
  });

  it("card steps have options", async () => {
    const schema = await getWizardSchema();
    const cardSteps = schema.filter((s) => s.inputType === "cards");
    for (const step of cardSteps) {
      expect(
        step.options?.length,
        `Card step '${step.key}' should have options`
      ).toBeGreaterThan(0);
    }
  });

  it("step ids are sequential from 1", async () => {
    const schema = await getWizardSchema();
    schema.forEach((step, idx) => {
      expect(step.id).toBe(idx + 1);
    });
  });

  it("no duplicate keys", async () => {
    const schema = await getWizardSchema();
    const keys = schema.map((s) => s.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
