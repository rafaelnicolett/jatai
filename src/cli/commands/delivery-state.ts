/**
 * commands/delivery-state.ts
 *
 * `helyx-state delivery-state upsert-phase|upsert-checklist` — cobre o
 * artefato que mais causa divergência de status hoje: TODAS as 16 fases
 * genéricas + o Maestro escrevem `delivery-state.yaml` manualmente. Reusa
 * `yamlUpsert.ts` como está (mesmo motor de escrita que a UI já usa via
 * clique) — garante que o CLI e o clique-no-Cockpit produzem exatamente o
 * mesmo diff de arquivo.
 *
 * ROADMAP `mod-state-service`, item 3.1 (Wave 3, Strangler Fig): mesma regra
 * de `commands/initiatives.ts` — cada verbo tenta `POST` no State Service
 * primeiro (`tryStateServiceWrite`, timeout curto, nunca lança); se
 * indisponível, cai pro caminho de escrita DIRETA já existente. O escopo
 * (`--global`/`--initiative <id>`) continua resolvido e validado
 * LOCALMENTE antes de qualquer tentativa de rede (`resolveStatePath` —
 * mesma mensagem/exit code de sempre se `MISSING_SCOPE`), tanto pra manter
 * o `filePath` que o fallback precisa quanto pra dar o mesmo erro rápido de
 * sempre independente do State Service estar no ar. O corpo enviado ao
 * State Service carrega `global`/`initiativeId` crus (não o path absoluto
 * já resolvido) — o servidor resolve o escopo contra o PRÓPRIO root dele
 * (`resolveDeliveryStateScope`, mesma função pura).
 */

import { parseArgs } from "node:util";
import { DELIVERY_PHASE_STATUSES } from "../../data/delivery-state-contract.pure";
import { printUsageError, printInternalError, printEnvelope, requireEnum, requireFlag, requireBooleanFlag, requirePhaseId, requireStatusReason } from "../lib/cli-io";
import { stateRepository } from "../lib/StateRepository";
import { resolveDeliveryStateScope } from "../lib/delivery-state-scope";
import { tryStateServiceWrite } from "../lib/state-service-cli-client";
import { cliWorkspaceRoot } from "../../state/workspace-root";
import { StateCommands, type StateCommandResult } from "../../state/application/StateCommands";
import { appendRunEvent } from "../../state/runs/run-event-log";

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Fallback em YAML: o mesmo caso de uso que o State Service roda (F3.3). Sem `onWrite`, como antes. */
function commands(root: string): StateCommands {
  // F5.2: o fallback em YAML também grava o evento agent-activity, com harness "cli".
  return new StateCommands({ root, repository: stateRepository, recordEvent: appendRunEvent, harness: "cli" });
}

/** Imprime o resultado de um `StateCommands` no contrato do CLI: sucesso (exit 0) ou erro de uso (exit 1). */
function printCommandResult(result: StateCommandResult): never {
  if (result.ok) return printEnvelope(result.body);
  const { code, message, ...extra } = result.error;
  return printUsageError(code, message, extra);
}

function resolveStatePath(root: string, isGlobal: unknown, initiativeId: string | undefined): string {
  const result = resolveDeliveryStateScope(stateRepository, root, isGlobal, initiativeId);
  if (!result.ok) {
    const { code, message, ...extra } = result.error;
    printUsageError(code, message, extra);
  }
  return result.path;
}

export async function runDeliveryStateCommand(verb: string, argv: string[]): Promise<void> {
  // F5.2: dentro do Claude Code, a pasta do projeto (CLAUDE_PROJECT_DIR); fora, a pasta de onde o CLI foi chamado.
  const root = cliWorkspaceRoot();

  if (verb === "upsert-phase") {
    const { values } = parseArgs({
      args: argv,
      options: {
        global: { type: "boolean" },
        initiative: { type: "string" },
        phase: { type: "string" },
        status: { type: "string" },
        agent: { type: "string" },
        "completed-at": { type: "string" },
        artifact: { type: "string", multiple: true },
        reason: { type: "string" },
      },
    });
    // Valida o escopo antes da rede (MISSING_SCOPE rápido); o fallback resolve o path de novo, igual.
    resolveStatePath(root, values.global, asString(values.initiative));
    const phase = requirePhaseId("phase", asString(values.phase));
    const status = requireEnum("status", asString(values.status), DELIVERY_PHASE_STATUSES);
    // ADR-0022: blocked, failed e cancelled exigem --reason.
    const reason = requireStatusReason(status, asString(values.reason));
    const agent = asString(values.agent);
    const completedAt = asString(values["completed-at"]);
    const artifacts = Array.isArray(values.artifact) ? values.artifact : undefined;

    const remote = await tryStateServiceWrite("/delivery-state/upsert-phase", {
      global: values.global === true,
      initiativeId: asString(values.initiative),
      phase,
      status,
      reason,
      agent,
      completedAt,
      artifacts,
    });
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).upsertDeliveryPhase({
        global: values.global,
        initiativeId: asString(values.initiative),
        phase,
        status,
        reason,
        agent,
        completedAt,
        artifacts,
      });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  if (verb === "upsert-checklist") {
    const { values } = parseArgs({
      args: argv,
      options: {
        global: { type: "boolean" },
        initiative: { type: "string" },
        phase: { type: "string" },
        item: { type: "string" },
        checked: { type: "string" },
        section: { type: "string" },
      },
    });
    // Valida o escopo antes da rede (MISSING_SCOPE rápido); o fallback resolve o path de novo, igual.
    resolveStatePath(root, values.global, asString(values.initiative));
    const phase = requirePhaseId("phase", asString(values.phase));
    const item = requireFlag("item", asString(values.item));
    const checked = requireBooleanFlag("checked", asString(values.checked));
    const section = asString(values.section) ?? "human_checklist";

    const remote = await tryStateServiceWrite("/delivery-state/upsert-checklist", {
      global: values.global === true,
      initiativeId: asString(values.initiative),
      phase,
      item,
      checked,
      section,
    });
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).upsertDeliveryChecklistItem({
        global: values.global,
        initiativeId: asString(values.initiative),
        phase,
        item,
        checked,
        section,
      });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  if (verb === "get") {
    // G2: leitura local do YAML (a fonte da verdade, ADR-0017), no envelope de sempre.
    const { values } = parseArgs({
      args: argv,
      options: { global: { type: "boolean" }, initiative: { type: "string" }, phase: { type: "string" } },
    });
    let result: StateCommandResult;
    try {
      result = commands(root).readDeliveryState({ global: values.global, initiativeId: asString(values.initiative), phase: asString(values.phase) });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  return printUsageError(
    "UNKNOWN_VERB",
    `verbo desconhecido para 'delivery-state': '${verb}'. Esperado: upsert-phase, upsert-checklist, get.`,
    { verb }
  );
}
