/**
 * host.ts — detecta o harness do workspace sem o VS Code.
 *
 * O `ConfigLoader` da extensão importa `vscode`; a CLI não pode. Esta versão
 * lê o `host_adapter` do config (quando existe) e, sem ele, procura o
 * orquestrador no disco, na mesma ordem do adaptador: OpenCode, Claude e
 * Copilot. O `host_adapter` declarado sempre vence.
 */

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { BRAND } from "../data/brand.pure";
import { findConfigPath } from "../data/kit-version";
import { claudeOrchestratorFilenames } from "../data/orchestrator-entry-prompt";
import type { HarnessAdapter } from "../generator/harness/HarnessAdapter";
import { findHarness } from "../generator/harness/harnesses";

export interface DetectedHost {
  readonly host: HarnessAdapter | undefined;
  /** De onde veio a decisão. */
  readonly source: "config" | "disk" | "none";
  /** O valor de `host_adapter`, mesmo quando inválido. */
  readonly declared?: string;
}

function declaredHost(root: string): string | undefined {
  const configPath = findConfigPath(root);
  if (configPath === null) return undefined;
  try {
    const raw = yaml.load(readFileSync(configPath, "utf-8")) as { host_adapter?: unknown } | null;
    return raw && typeof raw === "object" && typeof raw.host_adapter === "string" ? raw.host_adapter : undefined;
  } catch {
    return undefined;
  }
}

/** Candidatos de orquestrador por harness, em ordem de preferência. */
function orchestratorCandidates(): ReadonlyArray<readonly [string, readonly string[]]> {
  return [
    ["opencode", [`.opencode/agents/${BRAND.name}.md`, `.opencode/agents/${BRAND.files.orchestratorAgent}`]],
    ["claude", claudeOrchestratorFilenames().map((file) => `.claude/agents/${file}`)],
    ["copilot", [`.github/agents/${BRAND.files.orchestratorAgent}`]],
  ];
}

export function detectHost(root: string): DetectedHost {
  const declared = declaredHost(root);
  if (declared !== undefined) {
    return { host: findHarness(declared), source: "config", declared };
  }
  for (const [id, candidates] of orchestratorCandidates()) {
    for (const rel of candidates) {
      if (existsSync(path.join(root, ...rel.split("/")))) {
        return { host: findHarness(id), source: "disk" };
      }
    }
  }
  return { host: undefined, source: "none" };
}
