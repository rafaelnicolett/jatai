import type { HarnessAdapter } from "./HarnessAdapter";
import { ClaudeAdapter } from "./ClaudeAdapter";
import { CopilotAdapter } from "./CopilotAdapter";

const CLAUDE = new ClaudeAdapter();
const COPILOT = new CopilotAdapter();

/**
 * Harness pelo id exato (`claude` | `copilot`), ou `undefined`. É a busca do
 * greenfield: o Wizard só aceita os dois ids, e um id estranho é erro.
 */
export function findHarness(id: string): HarnessAdapter | undefined {
  if (id === CLAUDE.name) return CLAUDE;
  if (id === COPILOT.name) return COPILOT;
  return undefined;
}

/**
 * Harness da instalação brownfield e do `migrateKit`: `claude` é o Claude
 * Code, e qualquer outro valor (inclusive `vscode` ou vazio) cai no Copilot,
 * como sempre foi.
 */
export function harnessFor(hostAdapter: string): HarnessAdapter {
  return hostAdapter === CLAUDE.name ? CLAUDE : COPILOT;
}
