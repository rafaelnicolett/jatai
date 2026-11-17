/**
 * webview-safe.ts
 *
 * Único ponto de import permitido para o bundle do webview (`webview-ui/`).
 *
 * Reexporta só o que é 100% livre de `fs`/`path`/`vscode` — nenhum dos
 * arquivos abaixo faz I/O. Se algo aqui um dia importar algo que toca disco, o
 * `vite build` do webview falha alto e imediato (`Could not resolve "fs"`),
 * o que é o comportamento certo: melhor um build quebrado agora do que um bug
 * descoberto depois de empacotado num `.vsix`.
 */

export * from "../core/methodology/foundation-contracts";
export * from "../core/plans/foundation-plan";
export * from "../core/contracts/data-health";
export * from "./shortcuts-catalog";
export * from "../core/contracts/repos-contract.pure";
export * from "../core/contracts/foundation-state-contract.pure";
export * from "../core/contracts/context-repos-contract.pure";
export * from "../core/contracts/repo-graph-contract.pure";
export * from "../core/contracts/run-events-contract.pure";
export * from "../core/contracts/initiatives-contract.pure";
export * from "../core/methodology/phase-contracts";
export * from "../core/contracts/delivery-state-contract.pure";
export * from "../core/contracts/sprint-backlog-contract.pure";
export * from "../core/plans/delivery-plan";
export * from "../core/contracts/operations-contract.pure";
export * from "../core/brand/brand.pure";
export * from "../core/contracts/work-status.pure";
export * from "../core/plans/work-status-view";
// F4.2 (parte 2): o painel de decisão mostra o que falta para o gate fechar com a MESMA regra que o StateCommands aplica (ADR-0024).
export * from "../core/plans/gate-readiness";
// F5.2: o mapa da colmeia (F5.3) deriva o ColmeiaVM no webview, do snapshot e dos eventos.
export * from "../core/plans/colmeia";
export * from "../core/validation/project-name";
// F5.3: o painel da ilha (responsabilidade do agente, passo atual, checklist do gate).
export * from "../core/contracts/agent-directory.pure";
export * from "../core/plans/colmeia-detail";
export type { KitStatus } from "./kit-version";
