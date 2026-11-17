/**
 * commands/runs.ts
 *
 * `<cli> runs append` — o verbo de eventos de atividade de agente (F5.2,
 * contrato agent-activity §4). Fecha a lacuna "run-events sem CLI"
 * (H-GAP-02): até aqui os agentes escreviam `runs/*.jsonl` à mão, sem
 * validação e sem lock.
 *
 * Quem chama: os hooks do kit no Claude Code (início e fim de subagente,
 * escrita de arquivo), e qualquer agente pelo terminal. Os nomes das flags
 * são os campos do contrato, em snake_case (`--event_type`, `--agent_id`,
 * `--phase_id`, `--initiative_id`, `--artifact_path`, `--harness`, mais
 * `--task_id`, `--repo_id`, `--actor`, `--message`, `--reason`, `--run_id` e
 * `--timestamp`). A grafia com hífen (`--event-type`...) também vale.
 *
 * Só tipos de agente: `gate-approved`, `item-approved` e `decision-made` são
 * recusados (`INVALID_ENUM`), porque decisão humana só entra pelo estado
 * (ADR-0024). Um caminho absoluto dentro do workspace vira relativo; fora
 * dele, `USAGE`. Mesmo caminho dos outros verbos de escrita: valida local,
 * tenta o State Service (`POST /runs/append`) e cai no append local sob lock.
 * Sucesso: `{ ok, path, event }`.
 */

import { parseArgs } from "node:util";
import { printUsageError, printInternalError, printEnvelope } from "../lib/cli-io";
import { stateRepository } from "../lib/StateRepository";
import { tryStateServiceWrite } from "../lib/state-service-cli-client";
import { cliWorkspaceRoot } from "../../state/workspace-root";
import { StateCommands, type AppendRunEventCommand, type StateCommandResult } from "../../state/application/StateCommands";
import { appendRunEvent } from "../../state/runs/run-event-log";

/** Campos do contrato aceitos como flag. Cada um vale em snake_case e com hífen. */
const FIELDS = [
  "event_type",
  "agent_id",
  "phase_id",
  "initiative_id",
  "task_id",
  "repo_id",
  "artifact_path",
  "harness",
  "actor",
  "message",
  "reason",
  "run_id",
  "timestamp",
] as const satisfies ReadonlyArray<keyof AppendRunEventCommand>;

function commands(root: string): StateCommands {
  return new StateCommands({ root, repository: stateRepository, recordEvent: appendRunEvent, harness: "cli" });
}

function printCommandResult(result: StateCommandResult): never {
  if (result.ok) return printEnvelope(result.body);
  const { code, message, ...extra } = result.error;
  return printUsageError(code, message, extra);
}

function readInput(argv: string[]): AppendRunEventCommand {
  const options = Object.fromEntries(
    FIELDS.flatMap((f) => [
      [f, { type: "string" as const }],
      [f.replace(/_/g, "-"), { type: "string" as const }],
    ])
  );
  const { values } = parseArgs({ args: argv, options });
  const input: AppendRunEventCommand = {};
  for (const f of FIELDS) {
    const value = values[f] ?? values[f.replace(/_/g, "-")];
    if (typeof value === "string") input[f] = value;
  }
  return input;
}

export async function runRunsCommand(verb: string, argv: string[]): Promise<void> {
  // F5.2: dentro do Claude Code, a pasta do projeto (CLAUDE_PROJECT_DIR); fora, a pasta de onde o CLI foi chamado.
  const root = cliWorkspaceRoot();

  if (verb === "append") {
    const input = readInput(argv);
    const local = commands(root).prepareRunEvent(input);
    if (!local.ok) return printCommandResult({ ok: false, error: local.error });

    // Vai ao State Service com o run_id, o horário, o harness e o caminho já resolvidos aqui,
    // para o servidor gravar o mesmo evento que o fallback gravaria.
    const resolved: AppendRunEventCommand = {
      ...input,
      run_id: local.value.run_id,
      timestamp: local.value.timestamp,
      ...(local.value.harness ? { harness: local.value.harness } : {}),
      ...(local.value.artifact_path ? { artifact_path: local.value.artifact_path } : {}),
    };
    const remote = await tryStateServiceWrite("/runs/append", resolved);
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).appendRunEvent(resolved);
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  return printUsageError("UNKNOWN_VERB", `verbo desconhecido para 'runs': '${verb}'. Esperado: append.`, { verb });
}
