import type { HarnessAdapter } from "./HarnessAdapter";
import { ClaudeAdapter } from "./ClaudeAdapter";
import { CopilotAdapter } from "./CopilotAdapter";
import { OpenCodeAdapter } from "./OpenCodeAdapter";

const CLAUDE = new ClaudeAdapter();
const COPILOT = new CopilotAdapter();
const OPENCODE = new OpenCodeAdapter();

/**
 * Harness pelo id exato (`claude` | `copilot` | `opencode`), ou `undefined`.
 * É a busca do greenfield: o Wizard só aceita os ids, e um id estranho é erro.
 */
export function findHarness(id: string): HarnessAdapter | undefined {
  if (id === CLAUDE.name) return CLAUDE;
  if (id === COPILOT.name) return COPILOT;
  if (id === OPENCODE.name) return OPENCODE;
  return undefined;
}

/**
 * Harness da instalação brownfield e do `migrateKit`: `claude` é o Claude
 * Code, `opencode` é o OpenCode, e qualquer outro valor (inclusive `vscode`
 * ou vazio) cai no Copilot, como sempre foi.
 */
export function harnessFor(hostAdapter: string): HarnessAdapter {
  if (hostAdapter === CLAUDE.name) return CLAUDE;
  if (hostAdapter === OPENCODE.name) return OPENCODE;
  return COPILOT;
}
