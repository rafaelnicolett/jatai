/**
 * commands/gates.ts
 *
 * `<cli> gates get|approve` — G2 (H-GAP-02), contrato novo e aditivo
 * (ADR-0024, proposta). Antes, D2 e D3 só existiam editando o YAML à mão, e
 * não havia `gate_d3` no código.
 *
 * - D1 é por repositório: `repos.<repo>.gate_d1` em
 *   `assessment/foundation-state.yaml` (`--repo`).
 * - D2 e D3 são por iniciativa: `gate_d2`/`gate_d3` em `initiatives.yaml`
 *   (`--initiative`).
 *
 * `get` lê o YAML local. `approve` registra a aprovação humana
 * (`status: approved`, `approved_at`, `human_approved_at` e `by`, mais `--note`
 * opcional): tenta o State Service primeiro (`POST /gates/approve`) e cai no
 * fallback em YAML sob lock, como os outros verbos de escrita. Os dois
 * caminhos rodam o mesmo `StateCommands`.
 *
 * Decisões do titular na ADR-0024 (2026-11-15):
 * - quem aprova é o `user.name` do git do workspace, só o nome; `--by` é só
 *   sobrescrita explícita. Sem `user.name`, o CLI recusa com erro de uso
 *   pedindo `--by`, antes de ir à rede;
 * - D1 só aprova com as fases do Foundation do repo concluídas, e D2 com
 *   `roadmap_gate` e `risk_matrix_gate` aprovados (`GATE_NOT_CLOSED`, com a
 *   lista do que falta em `open`);
 * - não existe tool MCP de aprovação: gate é decisão humana, no Cockpit ou
 *   aqui, no terminal.
 */

import { parseArgs } from "node:util";
import { printUsageError, printInternalError, printEnvelope } from "../lib/cli-io";
import { stateRepository } from "../lib/StateRepository";
import { tryStateServiceWrite } from "../lib/state-service-cli-client";
import { cliWorkspaceRoot } from "../../state/workspace-root";
import { APPROVER_REQUIRED_ERROR, StateCommands, type StateCommandResult } from "../../state/application/StateCommands";
import { gitUserName } from "../../state/identity/git-user-name";
import { appendRunEvent } from "../../state/runs/run-event-log";

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function commands(root: string): StateCommands {
  return new StateCommands({ root, repository: stateRepository, approverName: gitUserName, recordEvent: appendRunEvent, harness: "cli" });
}

function printCommandResult(result: StateCommandResult): never {
  if (result.ok) return printEnvelope(result.body);
  const { code, message, ...extra } = result.error;
  return printUsageError(code, message, extra);
}

export async function runGatesCommand(verb: string, argv: string[]): Promise<void> {
  // F5.2: dentro do Claude Code, a pasta do projeto (CLAUDE_PROJECT_DIR); fora, a pasta de onde o CLI foi chamado.
  const root = cliWorkspaceRoot();

  if (verb === "get") {
    const { values } = parseArgs({
      args: argv,
      options: { gate: { type: "string" }, initiative: { type: "string" }, repo: { type: "string" } },
    });
    let result: StateCommandResult;
    try {
      result = commands(root).readGate({ gate: asString(values.gate), initiativeId: asString(values.initiative), repoId: asString(values.repo) });
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  if (verb === "approve") {
    const { values } = parseArgs({
      args: argv,
      options: {
        gate: { type: "string" },
        initiative: { type: "string" },
        repo: { type: "string" },
        "approved-at": { type: "string" },
        by: { type: "string" },
        note: { type: "string" },
      },
    });
    const input = {
      gate: asString(values.gate),
      initiativeId: asString(values.initiative),
      repoId: asString(values.repo),
      at: asString(values["approved-at"]),
      by: asString(values.by),
      note: asString(values.note),
    };

    // Validação local antes da rede: o mesmo erro rápido com ou sem State Service.
    const local = commands(root).readGate(input);
    if (!local.ok) return printCommandResult(local);

    // Quem aprova (ADR-0024): o --by explícito ou o user.name do git do workspace, resolvido aqui,
    // antes da rede, para o State Service gravar o mesmo nome que o fallback gravaria.
    const by = input.by?.trim() || (await gitUserName(root));
    if (!by) return printCommandResult({ ok: false, error: APPROVER_REQUIRED_ERROR });
    input.by = by;

    const remote = await tryStateServiceWrite("/gates/approve", input);
    if (remote.ok && remote.body) return printEnvelope(remote.body);

    let result: StateCommandResult;
    try {
      result = await commands(root).approveGate(input);
    } catch (err) {
      return printInternalError(err);
    }
    return printCommandResult(result);
  }

  return printUsageError("UNKNOWN_VERB", `verbo desconhecido para 'gates': '${verb}'. Esperado: get, approve.`, { verb });
}
