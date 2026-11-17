/**
 * hostChat.ts
 *
 * "Como falar com o host de chat (Copilot/Claude) e com a telemetria de
 * sincronização" — extraído verbatim de métodos privados que viviam em
 * `CockpitController` (`_getHostAdapter`, `_openChatWithPrompt`,
 * `_getActiveSyncContext`; o `_getPortalUrl` saiu com o portal na F2.1,
 * ADR-0015). Comportamento preservado
 * ao pé da letra; a única mudança é receber `configLoader` como parâmetro em
 * vez de ler `this._configLoader` — o que permite `CockpitController` e
 * `CockpitNextController` chamarem exatamente a mesma lógica.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { ConfigLoader } from "../../adapters/config/ConfigLoader";
import { parseInitiativesYaml, readActiveInitiativeId } from "../../data/initiatives-contract.pure";
import { BRAND } from "../../data/brand.pure";
import { findConfigPath } from "../../data/kit-version";
import { mentionsEntry, withoutEntryMention } from "../../adapters/chat/orchestrator";
import { openInClaudeCode, toClaudeCodePrompt } from "../../adapters/chat/claudeCode";
import { openInOpenCode, toOpenCodePrompt } from "../../adapters/chat/openCode";
import type { HostAdapter } from "../../types";

export { toClaudeCodePrompt };

/** Host do workspace (config em qualquer formato, senão o disco); default `"copilot"`. Ver `ConfigLoader.hostAdapter`. */
export async function getHostAdapter(configLoader: ConfigLoader): Promise<HostAdapter> {
  return configLoader.hostAdapter();
}

/**
 * Abre o chat do host configurado (Copilot, Claude Code ou OpenCode) com o
 * prompt dado. Claude Code: adapta `@jatai` → `/jatai` e copia para a área de
 * transferência. OpenCode: idem, sem view para focar.
 */
export async function openChatWithPrompt(rawPrompt: string, isPartialQuery: boolean, configLoader: ConfigLoader): Promise<void> {
  const host = await getHostAdapter(configLoader);

  if (host === "claude") {
    await openInClaudeCode(toClaudeCodePrompt(rawPrompt));
    return;
  }
  if (host === "opencode") {
    await openInOpenCode(toOpenCodePrompt(rawPrompt));
    return;
  }

  // Copilot (default). Pedido de trabalho (com a menção ao ponto de entrada)
  // vai para o agente orquestrador, não para o guia de chat (ADR-0025).
  const options = mentionsEntry(rawPrompt)
    ? { query: withoutEntryMention(rawPrompt), isPartialQuery, mode: BRAND.participant.name }
    : { query: rawPrompt, isPartialQuery };
  await vscode.commands
    .executeCommand("workbench.action.chat.open", options)
    .then(undefined, () =>
      vscode.commands.executeCommand("workbench.action.chat.open", options)
    );
}

export interface ActiveSyncContext {
  initiativeId: string;
  initiativeName: string;
  projectSlug: string;
}

/**
 * Lê o id/nome da iniciativa ativa e o slug do projeto, para os eventos de
 * telemetria da Fase 1 (`TelemetrySink`). Best-effort — nunca lança, devolve
 * defaults seguros se os arquivos estiverem ausentes.
 */
export function getActiveSyncContext(workspaceRoot: string | undefined): ActiveSyncContext {
  let initiativeId = "default";
  let initiativeName = "";
  let projectSlug = "";

  if (!workspaceRoot) return { initiativeId, initiativeName, projectSlug };

  try {
    const initYaml = path.join(workspaceRoot, ".github/artifacts/initiatives.yaml");
    if (fs.existsSync(initYaml)) {
      const raw = fs.readFileSync(initYaml, "utf-8");
      const activeId = readActiveInitiativeId(raw);
      if (activeId) {
        initiativeId = activeId;
        // O nome vem do parser do contrato, pelo id exato: a regex antiga casava
        // outra iniciativa cujo id começava igual (`loja` / `loja-2`). Sem `name:`
        // o parser repete o id; aqui isso fica vazio, como era.
        const active = parseInitiativesYaml(raw).state?.initiatives.find((i) => i.id === activeId);
        if (active?.name && active.name !== active.id) initiativeName = active.name.trim();
      }
    }
  } catch { /* silencioso — best-effort */ }

  try {
    // O config da marca primeiro, depois os de marcas anteriores (o greenfield antigo era `ai-sdk.config.yaml`).
    const configYaml = findConfigPath(workspaceRoot);
    if (configYaml !== null) {
      const raw = fs.readFileSync(configYaml, "utf-8");
      const slugM = raw.match(/^\s*slug:\s*(\S+)/m);
      if (slugM?.[1]) projectSlug = slugM[1];
    }
  } catch { /* silencioso — best-effort */ }

  return { initiativeId, initiativeName, projectSlug };
}
