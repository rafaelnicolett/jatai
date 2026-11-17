import { describe, it, expect } from "vitest";
import { WizardStateSchema } from "../src/types";

describe("WizardStateSchema", () => {
  it("accepts valid minimal state", () => {
    const result = WizardStateSchema.safeParse({
      projectName: "my-saas",
      hostAdapter: "copilot",
      backendStack: "python-api",
    });
    expect(result.success).toBe(true);
  });

  it("rejects projectName with uppercase", () => {
    const result = WizardStateSchema.safeParse({
      projectName: "My-Saas",
      hostAdapter: "copilot",
      backendStack: "python-api",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hostAdapter", () => {
    const result = WizardStateSchema.safeParse({
      projectName: "my-saas",
      hostAdapter: "openai",
      backendStack: "python-api",
    });
    expect(result.success).toBe(false);
  });

  it("accepts the three harnesses", () => {
    for (const host of ["copilot", "claude", "opencode"] as const) {
      const result = WizardStateSchema.safeParse({ projectName: "my-saas", hostAdapter: host, backendStack: "python-api" });
      expect(result.success, host).toBe(true);
    }
  });

  it("defaults frontendStack to none", () => {
    const result = WizardStateSchema.safeParse({
      projectName: "my-saas",
      hostAdapter: "claude",
      backendStack: "java-spring",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frontendStack).toBe("none");
    }
  });

  it("accepts all valid backend stacks", () => {
    const stacks = [
      "python-api",
      "java-spring",
      "dotnet-core",
      "python-agentic",
    ] as const;
    for (const stack of stacks) {
      const result = WizardStateSchema.safeParse({
        projectName: "proj",
        hostAdapter: "copilot",
        backendStack: stack,
      });
      expect(result.success, `Stack '${stack}' should be valid`).toBe(true);
    }
  });

  it("rejects projectName with spaces", () => {
    const result = WizardStateSchema.safeParse({
      projectName: "my project",
      hostAdapter: "copilot",
      backendStack: "python-api",
    });
    expect(result.success).toBe(false);
  });
});
