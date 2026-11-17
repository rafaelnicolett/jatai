import { describe, it, expect } from "vitest";
import { HelyxConfigSchema } from "../src/types";

describe("HelyxConfigSchema", () => {
  it("parses valid config", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "My SaaS", slug: "my-saas" },
      stacks: { backend: "python-api", frontend: "react-vite" },
      host_adapter: "copilot",
      templates: {
        resolved: {
          "python-api": {
            templateId: "helyx-template-python-api",
            version: "1.0.0",
            resolvedAt: "2026-04-28T00:00:00Z",
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses config without optional fields", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "Proj", slug: "proj" },
      stacks: { backend: "java-spring" },
      host_adapter: "claude",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stacks.frontend).toBeUndefined();
      expect(result.data.templates).toBeUndefined();
    }
  });

  it("rejects config missing required project fields", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "Proj" }, // missing slug
      stacks: { backend: "python-api" },
      host_adapter: "copilot",
    });
    expect(result.success).toBe(false);
  });
});
