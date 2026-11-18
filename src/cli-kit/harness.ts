/**
 * harness.ts — `jatai harness list`.
 *
 * Lista o que cada adaptador instala, a partir do próprio `HarnessAdapter`
 * (a mesma fonte que o gerador usa). Não duplica layout em texto.
 */

import { findHarness } from "../generator/harness/harnesses";
import type { HarnessAdapter } from "../generator/harness/HarnessAdapter";
import type { CliIO } from "./io";

export const SUPPORTED_HARNESSES = ["copilot", "claude", "opencode"] as const;

const LABELS: Record<string, string> = {
  copilot: "GitHub Copilot",
  claude: "Claude Code",
  opencode: "OpenCode",
};

export interface HarnessDescription {
  readonly name: string;
  readonly label: string;
  readonly hostDir: string;
  readonly agents: string;
  readonly orchestrator: string;
  readonly skills: string;
  readonly instructions: string;
  readonly commands: string | null;
  readonly chatmodes: boolean;
  readonly mcp: readonly string[];
  readonly activity: "hooks" | "plugin" | "none";
  readonly hooks: string | null;
}

export function describeHarness(adapter: HarnessAdapter): HarnessDescription {
  return {
    name: adapter.name,
    label: LABELS[adapter.name] ?? adapter.name,
    hostDir: adapter.hostDir,
    agents: `${adapter.hostDir}/agents/`,
    orchestrator: `${adapter.hostDir}/agents/${adapter.orchestratorFile}`,
    skills: `${adapter.hostDir}/skills/`,
    instructions: adapter.instructionsFile,
    commands: adapter.slashCommandsDir,
    chatmodes: adapter.supportsChatmodes,
    mcp: adapter.mcpConfigs.map((file) => file.path),
    activity: adapter.activity,
    hooks: adapter.projectHooksFile,
  };
}

export function listHarnesses(): HarnessDescription[] {
  return SUPPORTED_HARNESSES.flatMap((id) => {
    const adapter = findHarness(id);
    return adapter ? [describeHarness(adapter)] : [];
  });
}

export function printHarnesses(io: CliIO, json: boolean): void {
  const list = listHarnesses();
  if (json) {
    io.stdout(`${JSON.stringify({ ok: true, harnesses: list }, null, 2)}\n`);
    return;
  }
  io.stdout("Harnesses suportados:\n");
  for (const h of list) {
    io.stdout(`\n${h.name} — ${h.label}\n`);
    io.stdout(`  agentes:     ${h.agents} (orquestrador: ${h.orchestrator})\n`);
    io.stdout(`  skills:      ${h.skills}\n`);
    io.stdout(`  instruções:  ${h.instructions}\n`);
    if (h.commands) io.stdout(`  comandos:    ${h.commands}\n`);
    if (h.chatmodes) io.stdout("  chatmodes:   sim\n");
    io.stdout(`  MCP:         ${h.mcp.join(", ")}\n`);
    io.stdout(`  atividade:   ${h.activity}${h.hooks ? ` (${h.hooks})` : ""}\n`);
  }
}
