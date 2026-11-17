/**
 * activeLens.ts
 *
 * Qual das duas leituras do workspace as 3 abas mostram: "Descoberta"
 * (Foundation, workspace-wide, só existe pra brownfield) ou "Delivery" da
 * iniciativa ativa (Upstream/Downstream/Operation — greenfield sempre cai
 * aqui, já que nunca passa por Discovery). Puramente derivado — nunca
 * escreve em `initiatives.yaml` nem muda o contrato de `switchInitiative`.
 */

import type { HelyxConfig, ReposInventory } from "@shared/cockpit-protocol";

export type ActiveLens = { kind: "discovery" } | { kind: "delivery"; initiativeId?: string };

/**
 * "Este workspace passou por Discovery?" — não é só `config.project.mode`:
 * um workspace brownfield multi-repo pós-Foundation tem `config` no shape
 * escrito pelo `@assessor` (sem `project`/`mode`, ver `ConfigLoader`), então
 * `project.mode` nunca existe pra ele. `repos.yaml` com ao menos 1 repo é o
 * sinal de que o Foundation rodou de verdade, mesmo sem esse campo — sem
 * isto, um workspace com Foundation 100% concluída caía sempre na lente
 * Delivery (iniciativa ativa, geralmente vazia), escondendo o Discovery
 * inteiro atrás da lente errada por padrão.
 */
export function isBrownfieldWorkspace(config: HelyxConfig | null, reposInventory: ReposInventory | null): boolean {
  return config?.project.mode === "brownfield" || (reposInventory?.repos.length ?? 0) > 0;
}

export function resolveActiveLens(
  isBrownfield: boolean,
  discoveryLensSelected: boolean | undefined,
  activeInitiativeId: string | undefined
): ActiveLens {
  // Greenfield nunca teve Discovery — a pill "Descoberta" nem existe pra ele.
  if (!isBrownfield) return { kind: "delivery", initiativeId: activeInitiativeId };
  // Brownfield: Descoberta é o default (preserva o comportamento atual) até o usuário escolher uma iniciativa.
  if (discoveryLensSelected === false) return { kind: "delivery", initiativeId: activeInitiativeId };
  return { kind: "discovery" };
}
