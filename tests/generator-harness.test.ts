import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { findHarness, harnessFor } from "../src/generator/harness/harnesses";

/**
 * HarnessAdapter (F3.4, passo 4; ADR-0018): o que muda entre Claude Code e
 * Copilot mora no adapter, e o gerador só pergunta. O golden do gerador prova
 * a árvore; aqui fica o contrato de cada harness e a regra "sem condicional de
 * harness fora de src/generator/harness/".
 */

describe("HarnessAdapter — layout de cada harness", () => {
  it("Claude Code: .claude/, CLAUDE.md, sem chatmodes, com slash commands", () => {
    const h = findHarness("claude")!;
    expect({ name: h.name, hostDir: h.hostDir, instructionsFile: h.instructionsFile, kitInstructionsFile: h.kitInstructionsFile, supportsChatmodes: h.supportsChatmodes, slashCommandsDir: h.slashCommandsDir, projectHooksFile: h.projectHooksFile }).toEqual({
      name: "claude", hostDir: ".claude", instructionsFile: "CLAUDE.md", kitInstructionsFile: "claude-instructions.md", supportsChatmodes: false, slashCommandsDir: ".claude/commands", projectHooksFile: ".claude/settings.json",
    });
  });

  it("Copilot: .github/, copilot-instructions.md, com chatmodes, sem slash commands", () => {
    const h = findHarness("copilot")!;
    expect({ name: h.name, hostDir: h.hostDir, instructionsFile: h.instructionsFile, kitInstructionsFile: h.kitInstructionsFile, supportsChatmodes: h.supportsChatmodes, slashCommandsDir: h.slashCommandsDir, projectHooksFile: h.projectHooksFile }).toEqual({
      name: "copilot", hostDir: ".github", instructionsFile: ".github/copilot-instructions.md", kitInstructionsFile: "copilot-instructions.md", supportsChatmodes: true, slashCommandsDir: null, projectHooksFile: null,
    });
  });

  it("OpenCode: .opencode/, AGENTS.md, sem chatmodes, com commands/ e sem settings de hook", () => {
    const h = findHarness("opencode")!;
    expect({ name: h.name, hostDir: h.hostDir, instructionsFile: h.instructionsFile, kitInstructionsFile: h.kitInstructionsFile, supportsChatmodes: h.supportsChatmodes, slashCommandsDir: h.slashCommandsDir, projectHooksFile: h.projectHooksFile }).toEqual({
      name: "opencode", hostDir: ".opencode", instructionsFile: "AGENTS.md", kitInstructionsFile: "opencode-instructions.md", supportsChatmodes: false, slashCommandsDir: ".opencode/commands", projectHooksFile: null,
    });
  });

  it("findHarness é estrito (greenfield); harnessFor cai no Copilot para qualquer id que não seja claude ou opencode (brownfield e migrateKit)", () => {
    expect(findHarness("vscode")).toBeUndefined();
    expect(findHarness("constructor")).toBeUndefined();
    expect(harnessFor("claude").name).toBe("claude");
    expect(harnessFor("opencode").name).toBe("opencode");
    for (const id of ["copilot", "vscode", "", "Claude"]) expect(harnessFor(id).name, id).toBe("copilot");
  });
});

describe("HarnessAdapter — nenhuma condicional de harness fora dos adapters", () => {
  it("src/generator/ (fora de harness/) não compara id de harness com literal", () => {
    const root = path.resolve(__dirname, "../src/generator");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "harness") walk(full);
          continue;
        }
        if (!e.name.endsWith(".ts")) continue;
        fs.readFileSync(full, "utf-8").split("\n").forEach((line, i) => {
          if (/(===|!==)\s*"(claude|copilot|opencode)"|"(claude|copilot|opencode)"\s*(===|!==)/.test(line)) offenders.push(`${path.relative(root, full)}:${i + 1}`);
        });
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
