/**
 * ArtifactValidationProvider
 *
 * CodeLens provider that overlays checklist validation actions directly onto
 * artifact files (business-brief.md, prd.md, openapi.yaml, etc.).
 *
 * Per section header that matches a GuardRailItem, shows:
 *   ☐ Validar: "<label>"  → validar      — clickable to mark human-verified
 *   ✓ Validado por você  · desfazer       — clickable to unmark
 *
 * A top-of-file summary CodeLens handles items without a matching section.
 *
 * Writes to human_checklist in delivery-state.yaml (separate from the agent's
 * own checklist). Approval gate only passes when human_checklist is complete.
 *
 * Gatilho de refresh (roadmap `mod-state-service`, item 3.2): antes,
 * `vscode.workspace.createFileSystemWatcher` sobre `**\/*delivery-state.yaml`
 * disparava `_onDidChange` para QUALQUER escritor (o próprio clique do
 * CodeLens incluído — o handler nunca chamava `_onDidChange` diretamente,
 * dependia do watcher notar a própria escrita). Migrado para
 * `StateServiceSseClient` (`GET /events`, mesmo padrão do Cockpit) +
 * `refresh()` explícito chamado pelos comandos logo após escrever. Achado
 * documentado no relatório: os endpoints de escrita do State Service
 * (`POST /delivery-state/upsert-checklist` etc.) e a escrita direta via
 * `toggleGuardRail`/CLI NÃO publicam nada no `EventBus` hoje (só
 * o `RunsWatcher`, que não cobre `delivery-state.yaml`) —
 * então o SSE aqui é best-effort para o que vier a publicar no futuro; o
 * refresh do PRÓPRIO clique depende do `refresh()` explícito, não do SSE.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { PHASE_CONTRACTS } from "../data/phase-contracts";
import type { DeliveryStateAccess } from "../views/actions/deliveryStateAccess";
import { findPhaseHeaderIdx } from "../views/actions/yamlUpsert";
import { discoverStateService } from "../server/state-service-discovery";
import { StateServiceSseClient } from "../server/StateServiceSseClient";
import { BRAND } from "../data/brand.pure";

// ── Section → checklist item mappings per artifact file ──────────────────────

interface SectionMapping {
  pattern: RegExp;
  itemId: string;
}

interface ArtifactConfig {
  phaseId: string;
  sections: SectionMapping[];
}

const ARTIFACT_MAP: Record<string, ArtifactConfig> = {
  ".github/artifacts/business-brief.md": {
    phaseId: "business",
    sections: [
      { pattern: /^#+\s*(o\s+)?problema/i,                             itemId: "problem-section" },
      { pattern: /^#+\s*(p[úu]blico|persona)/i,                        itemId: "audience-defined" },
      { pattern: /^#+\s*(hip[óo]tese|proposta\s+de\s+valor|valor)/i,   itemId: "value-hypothesis" },
      { pattern: /^#+\s*(m[eé]tric|sucesso|kpi|okr)/i,                 itemId: "kpi-defined" },
      { pattern: /^#+\s*stakeholder/i,                                  itemId: "stakeholders" },
      { pattern: /^#+\s*risco/i,                                        itemId: "risks-listed" },
    ],
  },
  ".github/artifacts/prd.md": {
    phaseId: "product",
    sections: [
      { pattern: /^#+\s*(contexto|objetivo)/i,                          itemId: "prd-references-brief" },
      { pattern: /^#+\s*(feature|backlog|funcionalidade)/i,             itemId: "features-prioritized" },
      { pattern: /^#+\s*(crit[eé]rio|aceite|dod)/i,                    itemId: "acceptance-criteria" },
      { pattern: /^#+\s*(persona|p[úu]blico)/i,                        itemId: "personas-mapped" },
    ],
  },
  ".github/artifacts/feature-list.md": {
    phaseId: "product",
    sections: [
      { pattern: /^#+\s*(feature|features|funcionalidade)/i,            itemId: "features-prioritized" },
    ],
  },
  "docs/design/user-flows.md": {
    phaseId: "ux-design",
    sections: [
      { pattern: /^#+\s*(jornada|fluxo|flow|persona)/i,                 itemId: "all-personas" },
      { pattern: /^#+\s*(erro|falha|negativo|sad|excep)/i,              itemId: "happy-sad-paths" },
    ],
  },
  "docs/domain/bounded-contexts.md": {
    phaseId: "domain",
    sections: [
      { pattern: /^#+\s*(context|bc|bounded|core|supporting|generic)/i, itemId: "bc-exists" },
      { pattern: /^#+\s*(context.?map|relac|u\/d|acl|ohs)/i,           itemId: "context-map" },
    ],
  },
  "docs/domain/event-storming.md": {
    phaseId: "domain",
    sections: [
      { pattern: /^#+\s*(event|evento|big.?picture|domain)/i,           itemId: "event-storming" },
      { pattern: /^#+\s*(agregad|aggregate)/i,                          itemId: "aggregates" },
    ],
  },
  "docs/domain/ubiquitous-language.md": {
    phaseId: "domain",
    sections: [
      { pattern: /^#+\s*(gloss|termos?|ubiq|linguagem)/i,               itemId: "ubiquitous-lang" },
    ],
  },
  "api/openapi.yaml": {
    phaseId: "architecture",
    sections: [
      { pattern: /^paths:/,                                              itemId: "openapi-valid" },
    ],
  },
  ".github/artifacts/sprint-backlog.yaml": {
    phaseId: "sprint-plan",
    sections: [
      { pattern: /^(sprint|name|sprint_name):/,                         itemId: "backlog-exists" },
    ],
  },
};

// ── Minimal YAML parser for checklist sections ────────────────────────────────

function readChecklistsFromYaml(
  yamlPath: string,
  phaseId: string,
): { agent: Record<string, boolean>; human: Record<string, boolean> } {
  const result = { agent: {} as Record<string, boolean>, human: {} as Record<string, boolean> };
  if (!fs.existsSync(yamlPath)) return result;
  try {
    const lines = fs.readFileSync(yamlPath, "utf-8").split("\n");
    // Alias-aware (F3.1): acha o bloco sob qualquer chave da fase no catálogo
    // único (ex.: `sprint-planner` para `sprint-plan`). A versão anterior
    // anunciava aliases, mas os dois ramos do ternário buscavam só o id cru.
    const phaseIdx = findPhaseHeaderIdx(lines, -1, phaseId);

    if (phaseIdx === -1) return result;

    let section: "agent" | "human" | null = null;
    for (let i = phaseIdx + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^ {2}\S/.test(line) || /^[^\s]/.test(line)) break;
      if (/^ {4}checklist:\s*$/.test(line)) { section = "agent"; continue; }
      if (/^ {4}human_checklist:\s*$/.test(line)) { section = "human"; continue; }
      if (/^ {4}\S/.test(line)) { section = null; continue; }
      if (section) {
        const m = line.match(/^ {6}([\w-]+):\s*(true|false)/);
        if (m && m[1] && m[2]) result[section][m[1]] = m[2] === "true";
      }
    }
  } catch { /* best-effort */ }
  return result;
}

// ── CodeLens provider ─────────────────────────────────────────────────────────

export class ArtifactValidationProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChange.event;

  private _sseClient: StateServiceSseClient | null = null;

  constructor(private readonly _cockpit: DeliveryStateAccess) {
    // Assina o State Service (item 3.2) no lugar do FileSystemWatcher — ver
    // nota no topo do arquivo sobre o achado de cobertura de evento.
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      this._sseClient = new StateServiceSseClient({
        discover: (): ReturnType<typeof discoverStateService> => discoverStateService({ root }),
        onEvent: (): void => this._onDidChange.fire(),
      });
      this._sseClient.start();
    }
  }

  /** Chamado pelos comandos logo depois de escrever `human_checklist` — refresh imediato do próprio clique, sem depender do SSE (ver achado no topo do arquivo). */
  refresh(): void {
    this._onDidChange.fire();
  }

  /** Para a assinatura SSE — chamado no `deactivate()` da extensão (via `context.subscriptions`). Idempotente. */
  dispose(): void {
    this._sseClient?.stop();
    this._sseClient = null;
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return [];

    const relPath = path.relative(root, document.uri.fsPath).replace(/\\/g, "/");
    const config = ARTIFACT_MAP[relPath];
    if (!config) return [];

    const contract = PHASE_CONTRACTS[config.phaseId];
    if (!contract) return [];

    const yamlPath = this._cockpit.getActiveDeliveryStatePath();
    if (!yamlPath) return [];

    const { agent: agentCL, human: humanCL } = readChecklistsFromYaml(yamlPath, config.phaseId);

    const lenses: vscode.CodeLens[] = [];
    const mappedItemIds = new Set<string>();

    const lines = document.getText().split("\n");

    // Per-section CodeLenses
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx] ?? "";
      for (const { pattern, itemId } of config.sections) {
        if (!pattern.test(line)) continue;

        const item = contract.guardRailChecklist.find(i => i.id === itemId);
        if (!item) continue;
        if (mappedItemIds.has(itemId)) continue; // first section match only
        mappedItemIds.add(itemId);

        const agentDone = agentCL[itemId] === true;
        const humanDone = humanCL[itemId] === true;
        const range = new vscode.Range(lineIdx, 0, lineIdx, 0);

        if (humanDone) {
          lenses.push(new vscode.CodeLens(range, {
            title: `$(pass-filled) ${BRAND.displayName.toUpperCase()} · VALIDADO${agentDone ? "  ◉ agente" : ""}  ─  ${item.label}  ·  desfazer`,
            command: `${BRAND.commandPrefix}.validateArtifactSection`,
            arguments: [config.phaseId, itemId, false],
            tooltip: "Clique para remover sua validação deste critério",
          }));
        } else {
          const tag = item.mandatory ? "  ★ OBRIGATÓRIO" : "  (opcional)";
          const agentTag = agentDone ? "  ◉ agente" : "";
          lenses.push(new vscode.CodeLens(range, {
            title: `$(circle-outline) ${BRAND.displayName.toUpperCase()} · VALIDAR${tag}  ─  ${item.label}${agentTag}`,
            command: `${BRAND.commandPrefix}.validateArtifactSection`,
            arguments: [config.phaseId, itemId, true],
            tooltip: item.hint
              ? `${item.hint}\n\nClique para marcar como validado por você`
              : "Clique para marcar como validado por você",
          }));
        }
        break; // next line
      }
    }

    // Top-of-file summary for items without a section mapping
    const unmapped = contract.guardRailChecklist.filter(i => !mappedItemIds.has(i.id));
    if (unmapped.length > 0) {
      const unverified = unmapped.filter(i => !humanCL[i.id]);
      if (unverified.length > 0) {
        lenses.unshift(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `$(info) ${BRAND.displayName.toUpperCase()} · ${unverified.length} critério${unverified.length > 1 ? "s" : ""} sem seção para validar  ─  clique para abrir checklist`,
          command: `${BRAND.commandPrefix}.validateRemainingItems`,
          arguments: [config.phaseId, unmapped.map(i => i.id)],
          tooltip: "Abre checklist com os critérios que não têm seção mapeada neste arquivo",
        }));
      }
    }

    return lenses;
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerArtifactValidation(
  context: vscode.ExtensionContext,
  cockpit: DeliveryStateAccess,
): void {
  const provider = new ArtifactValidationProvider(cockpit);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: "markdown" }, { language: "yaml" }],
      provider,
    ),

    // Para a assinatura SSE do provider (item 3.2) — `registerCodeLensProvider`
    // não dispara isto sozinho, o provider não é o Disposable retornado ali.
    { dispose: () => provider.dispose() },

    // Toggle a single item directly from a section CodeLens click
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.validateArtifactSection`,
      async (phaseId: string, itemId: string, checked: boolean) => {
        await cockpit.toggleChecklistFromChat(phaseId, itemId, checked);
        // Refresh explícito do próprio clique — o SSE não cobre escrita de
        // checklist hoje (ver achado no topo do arquivo), então não dá pra
        // depender só dele para o caso mais comum (o operador clicando aqui).
        provider.refresh();
      },
    ),

    // QuickPick for unmapped items (top-of-file summary)
    vscode.commands.registerCommand(
      `${BRAND.commandPrefix}.validateRemainingItems`,
      async (phaseId: string, itemIds: string[]) => {
        const contract = PHASE_CONTRACTS[phaseId];
        if (!contract) return;

        const yamlPath = cockpit.getActiveDeliveryStatePath();
        const { human: humanCL } = yamlPath
          ? readChecklistsFromYaml(yamlPath, phaseId)
          : { human: {} as Record<string, boolean> };

        const picks = itemIds.map(id => {
          const item = contract.guardRailChecklist.find(i => i.id === id);
          if (!item) return null;
          return {
            id,
            label: `${humanCL[id] ? "✓" : "☐"}  ${item.label}`,
            description: item.mandatory ? "★ obrigatório" : "opcional",
            detail: item.hint,
            picked: humanCL[id] === true,
          };
        }).filter((p): p is NonNullable<typeof p> => p !== null);

        const selected = await vscode.window.showQuickPick(picks, {
          title: `${BRAND.displayName} · Validar critérios — fase ${phaseId}`,
          canPickMany: true,
          placeHolder: "Selecione os critérios que você validou (Enter para confirmar)",
          matchOnDescription: true,
          matchOnDetail: true,
        });

        if (selected === undefined) return; // cancelled — don't change anything

        const selectedIds = new Set(selected.map(s => s.id));
        for (const id of itemIds) {
          await cockpit.toggleChecklistFromChat(phaseId, id, selectedIds.has(id));
        }
        provider.refresh();
      },
    ),
  );
}
