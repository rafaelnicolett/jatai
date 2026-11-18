import * as path from "path";
import * as fs from "fs/promises";
import type { Dirent } from "fs";
import type { HarnessAdapter, GeneratedFile } from "./HarnessAdapter";
import type { WizardState } from "../../types";
import { BRAND } from "../../data/brand.pure";
import { helyxCommandContent } from "../../data/foundation-prompt";
import { isClientOwned } from "../../data/kit-version";
import { KIT_ORCHESTRATOR } from "./orchestrator";
import { KIT_AGENT_STREAMS, adaptOpenCodeAgent } from "../content/opencode-agent";
import { opencodeAgentsReadme } from "../content/opencode-instructions";
import { OPENCODE_MCP_CONFIG } from "../content/mcp-config";

/**
 * OpenCode 2.x — terceiro harness (epic-9 da mod-missao-open-source).
 *
 * O contrato está em
 * `.github/artifacts/planning/mod-missao-open-source/opencode/opencode-contract.md`.
 * As quatro regras que mandam no adaptador:
 * - o ID do agente é o caminho do arquivo: os agentes do kit são **achatados**
 *   em `.opencode/agents/<id>.md` (a LLM Wiki fica em `domain/<slug>.md`);
 * - frontmatter desconhecido vai para `request.body`: só `description`,
 *   `mode` e `permissions` sobrevivem;
 * - `model` em lista impede o agente de carregar: sai;
 * - o orquestrador é `primary` e os especialistas são `subagent`.
 *
 * O que é do cliente (`agents/domain/`, a LLM Wiki) nunca é tocado.
 */
export class OpenCodeAdapter implements HarnessAdapter {
  readonly name = "opencode";
  readonly hostDir = ".opencode";
  readonly instructionsFile = "AGENTS.md";
  readonly kitInstructionsFile = "opencode-instructions.md";
  readonly supportsChatmodes = false;
  readonly slashCommandsDir = ".opencode/commands";
  readonly projectHooksFile = null;
  readonly orchestratorFile = `${BRAND.name}.md`;
  readonly genericAgentsMd = false;
  readonly mcpConfigs = [OPENCODE_MCP_CONFIG];
  readonly activity = "plugin";

  agentDestination(kitRel: string): string {
    if (kitRel === KIT_ORCHESTRATOR) return this.orchestratorFile;
    return kitRel.replace(/\.agent\.md$/, ".md").split("/").pop()!;
  }

  async adaptAgents(agentsDir: string): Promise<void> {
    const files = await walkAgentFiles(agentsDir);
    for (const file of files) {
      const rel = path.relative(agentsDir, file).split(path.sep).join("/");
      // `agents/domain/` é a LLM Wiki: do cliente, nunca reescrita.
      if (isClientOwned(`agents/${rel}`)) continue;
      const raw = await fs.readFile(file, "utf-8");
      const { destination, content } = adaptOpenCodeAgent(rel, raw);
      const dest = path.join(agentsDir, destination);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content, "utf-8");
      await fs.unlink(file).catch(() => undefined);
    }
    // As pastas de stream ficam vazias depois do achatamento; se o time não
    // colocou nada nelas, saem. `domain/` e qualquer pasta com conteúdo ficam.
    for (const stream of KIT_AGENT_STREAMS) {
      try {
        await fs.rmdir(path.join(agentsDir, stream));
      } catch {
        /* não existe ou não está vazia */
      }
    }
  }

  generateAgentArtifacts(
    _targetDir: string,
    state: WizardState
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    files.push({
      relativePath: "AGENTS.md",
      content: opencodeAgentsReadme(state),
    });

    const stack = state.backendStack;
    files.push({
      relativePath: `.opencode/agents/backend-${stack}.md`,
      content: `---
description: "Backend ${stack} — agente de fase do projeto ${state.projectName}."
mode: subagent
---
# @backend-${stack}

Stack: **${stack}** · Project: ${state.projectName}
`,
    });

    files.push({
      relativePath: `.opencode/commands/${BRAND.files.slashCommand}`,
      content: helyxCommandContent("opencode"),
    });

    return Promise.resolve(files);
  }
}

/** Coleta recursiva de `*.agent.md` (não segue symlink, ignora `.bak`). */
async function walkAgentFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkAgentFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".agent.md")) out.push(full);
  }
  return out;
}
