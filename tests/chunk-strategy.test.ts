import { describe, it, expect } from "vitest";
import { HelyxConfigSchema } from "../src/types";

describe("HelyxConfigSchema — assessment.chunk_strategy (CONFIG-001)", () => {
  it("parses config with chunk_strategy by_module", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "Proj", slug: "proj" },
      stacks: { backend: "python-api" },
      host_adapter: "copilot",
      assessment: { chunk_strategy: { strategy: "by_module" } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assessment?.chunk_strategy?.strategy).toBe("by_module");
    }
  });

  it("parses config with chunk_strategy by_size and max_files_per_chunk", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "Proj", slug: "proj" },
      stacks: { backend: "python-api" },
      host_adapter: "copilot",
      assessment: {
        chunk_strategy: { strategy: "by_size", max_files_per_chunk: 10 },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assessment?.chunk_strategy?.max_files_per_chunk).toBe(10);
    }
  });

  it("parses config without assessment field (backward compat)", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "Proj", slug: "proj" },
      stacks: { backend: "java-spring" },
      host_adapter: "claude",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assessment).toBeUndefined();
    }
  });

  it("rejects invalid chunk_strategy value", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "Proj", slug: "proj" },
      stacks: { backend: "python-api" },
      host_adapter: "copilot",
      assessment: { chunk_strategy: { strategy: "invalid-value" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative max_files_per_chunk", () => {
    const result = HelyxConfigSchema.safeParse({
      version: "1.0.0",
      project: { name: "Proj", slug: "proj" },
      stacks: { backend: "python-api" },
      host_adapter: "copilot",
      assessment: {
        chunk_strategy: { strategy: "by_size", max_files_per_chunk: -5 },
      },
    });
    expect(result.success).toBe(false);
  });
});
