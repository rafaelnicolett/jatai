/**
 * commands/initiatives.ts
 *
 * `helyx-state initiatives create|switch-active|bump-phase|upsert-wave-item`
 * — cobre `initiatives.yaml`, escrito manualmente hoje pelo Maestro
 * (greenfield e brownfield) e pelo `modernization-planner`. `upsert-wave-item`
 * é a operação mais frágil no fluxo atual (mapa-de-mapas editado à mão) —
 * ver `writers/initiatives-writer.ts` pro motor de patch estrutural.
 *
 * ROADMAP `mod-state-service`, item 3.1 (Wave 3, Strangler Fig): cada verbo
 * agora TENTA o State Service local primeiro (`tryStateServiceWrite` —
 * `POST` no endpoint equivalente de `StateServiceServer`, descoberta via
 * `server.json`, timeout curto). Se conectar e a chamada se completar, o
 * corpo da resposta é repassado tal como veio (`printEnvelope` — já é o
 * MESMO formato `{ok, ...}`/`{ok:false, error}` que este arquivo sempre
 * produziu). Se o State Service estiver indisponível (sem `server.json`,
 * timeout, conexão recusada — `tryStateServiceWrite` nunca lança, só
 * devolve `{ok:false}`), cai pro caminho de escrita DIRETA em YAML que já
 * existia antes desta mudança, inalterado — não é mais o caminho principal,
 * mas continua existindo e funcionando exatamente igual (fallback).
 *
 * Cada verbo virou `async` só por causa desse `await` inicial — a validação
 * de flags continua 100% síncrona (mesmo comportamento/mensagens de sempre).
 * O `try/catch` em volta da chamada `stateRepository.*Atomic` (só ELA, nunca
 * em volta de `printSuccess`/`printUsageError`/`printEnvelope`) existe
 * porque, agora que o corpo da função roda depois de um `await`, uma exceção
 * de fs/lock não-tratada não bulk mais sincronamente até o try/catch externo
 * de `helyx-state.ts` — precisa ser convertida em `printInternalError` aqui
 * mesmo, senão viraria uma promise rejeitada sem handler.
 */

import { parseArgs } from "node:util";
import { INITIATIVE_STATUSES, INITIATIVE_MODES, INITIATIVE_KINDS } from "../../data/initiatives-contract.pure";
import { printUsageError, printInternalError, printEnvelope, requireEnum, requireFlag, requirePathSegmentId, requireStatusReason } from "../lib/cli-io";
import { WORK_STATUSES } from "../../core/contracts/work-status.pure";
import { stateRepository } from "../lib/StateRepository";
import { validateOptionalEnum } from "../lib/validation";
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

function optionalEnum<T extends string>(field: string, value: string | undefined, allowed: readonly T[]): T | undefined {
  const result = validateOptionalEnum(field, value, allowed);
  if (!result.ok) {
    const { code, message, ...extra } = result.error;
    printUsageError(code, message, extra);
  }
  return result.value;
}

export async function runInitiativesCommand(verb: string, argv: string[]): Promise<void> {
  // F5.2: dentro do Claude Code, a pasta do projeto (CLAUDE_PROJECT_DIR); fora, a pasta de onde o CLI foi chamado.
  const root = cliWorkspaceRoot();

  if (verb === "create") {
    const { values } = parseArgs({
      args: argv,
      options: {
        id: { type: "string" },
        name: { type: "string" },
        status: { type: "string" },
        stream: { type: "string" },
        "current-phase": { type: "string" },
        mode: { type: "string" },
        type: { type: "string" },
        owner: { type: "string" },
        priority: { type: "string" },
        "created-at": { type: "string" },
        reason: { type: "string" },
        active: { type: "boolean" },
      },
    });
    // O id vira nome de pasta (initiatives/<id>/): um único segmento de caminho (A20)
    const id = requirePathSegmentId("id", asString(values.id));
    const status = optionalEnum("status", asString(values.status), INITIATIVE_STATUSES);
    const mode = optionalEnum("mode", asString(values.mode), INITIATIVE_MODES);
    const type = optionalEnum("type", asString(values.type), INITIATIVE_KINDS);
    // ADR-0022: `cancelled` exige --reason.
    const reason = requireStatusReason(status, asString(values.reason));

    const fields = {
      id,
      name: asString(values.name),
      status,
      stream: asString(values.stream),
      currentPhase: asString(values["current-phase"]),
      mode,
      type,
      owner: asString(values.owner),
      priority: asString(values.priority),
      createdAt: asString(values["created-at"]),
      reason,
      setActive: values.active === true,
    };

    const remote = await tryStateServiceWrite("/initiatives", { ...fields, active: fields.setActive });
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).upsertInitiative(fields);
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  if (verb === "switch-active") {
    const { values } = parseArgs({ args: argv, options: { id: { type: "string" } } });
    // `active:` vira o caminho do delivery-state da iniciativa ativa (A20)
    const id = requirePathSegmentId("id", asString(values.id));

    const remote = await tryStateServiceWrite(`/initiatives/${encodeURIComponent(id)}/switch-active`, {});
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).switchActiveInitiative({ id });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  if (verb === "bump-phase") {
    const { values } = parseArgs({ args: argv, options: { id: { type: "string" }, phase: { type: "string" } } });
    const id = requireFlag("id", asString(values.id));
    const phase = requireFlag("phase", asString(values.phase));

    const remote = await tryStateServiceWrite(`/initiatives/${encodeURIComponent(id)}/bump-phase`, { phase });
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).bumpInitiativePhase({ id, phase });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  if (verb === "upsert-wave-item") {
    const { values } = parseArgs({
      args: argv,
      options: {
        id: { type: "string" },
        wave: { type: "string" },
        item: { type: "string" },
        status: { type: "string" },
        repo: { type: "string" },
        "completed-at": { type: "string" },
        artifact: { type: "string", multiple: true },
        summary: { type: "string" },
        commit: { type: "string" },
        "known-bug": { type: "string", multiple: true },
        "merge-block": { type: "string" },
        "requires-approval": { type: "boolean" },
        reason: { type: "string" },
        hierarchy: { type: "string" },
      },
    });
    const id = requireFlag("id", asString(values.id));
    const wave = requireFlag("wave", asString(values.wave));
    const item = requireFlag("item", asString(values.item));
    // ADR-0022 §4: o item de onda usa o vocabulário de trabalho (antes: texto livre); blocked/failed/cancelled exigem --reason.
    const status = requireEnum("status", requireFlag("status", asString(values.status)), WORK_STATUSES);
    const reason = requireStatusReason(status, asString(values.reason));
    const artifacts = Array.isArray(values.artifact) ? values.artifact : undefined;
    const knownBugsPinned = Array.isArray(values["known-bug"]) ? values["known-bug"] : undefined;
    // ADR-0006/ADR-0007: default "wave" — retrocompat total, nenhum chamador
    // existente (agente/script) precisa passar --hierarchy pra continuar
    // escrevendo em wave_status exatamente como sempre escreveu.
    const hierarchy = optionalEnum("hierarchy", asString(values.hierarchy), ["legacy", "epic-feature-backlog-task"] as const);
    const group: "wave" | "epic" = hierarchy === "epic-feature-backlog-task" ? "epic" : "wave";

    const fields = {
      status,
      repo: asString(values.repo),
      completedAt: asString(values["completed-at"]),
      artifacts,
      summary: asString(values.summary),
      commit: asString(values.commit),
      knownBugsPinned,
      mergeBlock: asString(values["merge-block"]),
      reason,
      // Raro, opt-in: só marca o item como gate quando a flag é passada de verdade — ausente nunca sobrescreve pra false (ver docblock de `WaveItemUpsertFields.requiresApproval`).
      requiresApproval: values["requires-approval"] === true ? true : undefined,
    };

    const remote = await tryStateServiceWrite(
      `/initiatives/${encodeURIComponent(id)}/wave-items/${encodeURIComponent(wave)}/${encodeURIComponent(item)}`,
      { ...fields, group }
    );
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).upsertWaveItem({ id, wave, item, ...fields, group });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  if (verb === "get") {
    // G2: leitura local do YAML (a fonte da verdade, ADR-0017), no envelope de sempre.
    const { values } = parseArgs({ args: argv, options: { id: { type: "string" } } });
    const id = asString(values.id);
    let result: StateCommandResult;
    try {
      result = id === undefined ? commands(root).readInitiatives() : commands(root).readInitiative({ id });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  return printUsageError(
    "UNKNOWN_VERB",
    `verbo desconhecido para 'initiatives': '${verb}'. Esperado: create, switch-active, bump-phase, upsert-wave-item, get.`,
    { verb }
  );
}
