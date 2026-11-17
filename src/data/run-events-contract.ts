/**
 * run-events-contract.ts
 *
 * Canal de eventos do delivery (`.github/artifacts/runs/*.jsonl`).
 *
 * **Divisão de responsabilidade:**
 *   - `foundation-state.yaml` → **estado durável**: o que foi concluído e aprovado.
 *     É a fonte da verdade dos gates.
 *   - `runs/*.jsonl`          → **o que está acontecendo agora**: append-only,
 *     efêmero, sem gate. É o que dá liveness à tela.
 *
 * Um nunca substitui o outro. Se o `.jsonl` sumir, o estado do delivery continua
 * íntegro — só se perde o histórico de atividade.
 *
 * Formato **JSONL**: uma linha por evento. Append-only é o que permite o agente
 * escrever no meio do trabalho sem risco de corromper o arquivo (ao contrário de
 * reescrever um YAML inteiro).
 *
 * Tipos, parsing e derivação de atividade puros vivem em
 * `run-events-contract.pure.ts` (zero `fs`/`path`, seguro para o bundle do
 * webview) e são re-exportados abaixo por inteiro — todo consumidor existente
 * continua importando deste arquivo sem nenhuma mudança.
 */

import { type RunEvent } from "./run-events-contract.pure";
import type { OnDataIssue } from "./data-health";
import { runEventReader } from "../state/runs/RunEventReader";

export * from "./run-events-contract.pure";

/**
 * Lê os eventos do workspace, ordenados do mais antigo ao mais recente (no
 * máximo `limit`). Desde a F5.2 a leitura é incremental (H-GAP-18): cada
 * arquivo tem um cursor e só os bytes novos são lidos, com a mesma saída da
 * leitura completa (`src/state/runs/RunEventReader.ts`).
 */
export function loadRunEvents(workspaceRoot: string, limit = 200, onError?: OnDataIssue): RunEvent[] {
  return runEventReader.read(workspaceRoot, limit, onError);
}
