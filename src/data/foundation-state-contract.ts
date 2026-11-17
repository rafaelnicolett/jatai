/**
 * foundation-state-contract.ts
 *
 * Tracker de progresso do Discovery (`foundation-state.yaml`).
 *
 * **Path canônico** — é onde o `@assessor` grava e onde o Cockpit lê/escreve o
 * `human_checklist`. Divergir esse path faz agente e dashboard perderem um ao
 * outro **silenciosamente** (foi exatamente o que acontecia: o agente gravava em
 * `assessment/`, o Cockpit lia da raiz de `artifacts/`).
 *
 * **Estrutura multi-repo** — **one repo é multi repo com N=1**:
 *
 *   repos.<id>.phases   → fases técnicas, uma execução por repositório
 *   phases              → fases cross-repo (domínio, negócio) — não cabem em um repo
 *
 * **Gate D1 é por repo, sempre.** Um `legacy-erp` de 45min não pode travar os
 * outros 19 que ficaram prontos em 5min. O D1 global é **derivado** (nunca
 * armazenado) do rollup: todos os repos aprovados + domínio aprovado.
 *
 * **Ciclo de uma fase**: `pending → in-progress → agent-done → done`.
 * `agent-done` é o coração do HITL — o sub-agente terminou e aguarda aprovação
 * humana. Colapsá-lo em `pending` esconde o gate (o Cockpit o exibe como
 * *review*).
 *
 * Tipos, parsing e queries puras vivem em `foundation-state-contract.pure.ts`
 * (zero `fs`/`path`, seguro para o bundle do webview) e são re-exportados
 * abaixo por inteiro — todo consumidor existente continua importando deste
 * arquivo sem nenhuma mudança.
 */

import * as fs from "fs";
import * as path from "path";
import { FOUNDATION_STATE_PATH, FOUNDATION_STATE_REL, parseFoundationState, type FoundationState } from "./foundation-state-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./foundation-state-contract.pure";

/** Lê o tracker. `null` = Foundation ainda não começou. */
export function loadFoundationState(workspaceRoot: string, onError?: OnDataIssue): FoundationState | null {
  const filePath = path.join(workspaceRoot, ...FOUNDATION_STATE_PATH);
  if (!fs.existsSync(filePath)) return null;
  try {
    const state = parseFoundationState(fs.readFileSync(filePath, "utf-8"));
    if (state === null) {
      onError?.({ source: "foundation-state", message: `${FOUNDATION_STATE_REL}: não foi possível recuperar nenhum dado do arquivo` });
    }
    return state;
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao ler ${FOUNDATION_STATE_REL}:`, err);
    onError?.({ source: "foundation-state", message: `falha ao ler ${FOUNDATION_STATE_REL}: ${(err as Error).message}` });
    return null;
  }
}
