/**
 * gate-readiness.ts — a regra de fechamento de D1 e D2 (ADR-0024, decisão 3
 * do titular, 2026-11-15), no espírito do D3 da ADR-0022.
 *
 * - **D1** de um repositório só aprova com as fases do Foundation daquele
 *   repositório concluídas (`done`). São as mesmas fases que o plano do
 *   Foundation mostra para o repo: as de escopo `repo`, sem a de design quando
 *   o `@tech-mapper` já disse que o repo não tem frontend (`has_frontend:
 *   false`). `agent-done` ainda não é concluída: espera a aprovação humana.
 * - **D2** de uma iniciativa só aprova com `roadmap_gate` e
 *   `risk_matrix_gate` aprovados.
 *
 * Fora disso, quem aprova recebe a lista do que falta (`open`). Puro: o
 * `StateCommands` lê os arquivos e só pergunta aqui.
 */
import { FOUNDATION_CONTRACTS } from "../methodology/foundation-contracts";
import { phasesForRepo, type FoundationState } from "../contracts/foundation-state-contract.pure";
import type { Initiative, PlanningGateStatus } from "../contracts/initiatives-contract.pure";
import type { RepoEntry } from "../contracts/repos-contract.pure";

/** Uma pendência que impede o gate: a fase (D1) ou o gate de Planning (D2), com o status atual. */
export interface GateRequirement {
  key: string;
  /** Status gravado; `missing` quando nada foi registrado ainda. */
  status: string;
}

export interface GateReadiness {
  closed: boolean;
  open: GateRequirement[];
}

/** Status de uma pendência que ainda não tem registro no arquivo. */
export const MISSING_REQUIREMENT = "missing";

/** Fases do Foundation que contam para o D1 de um repositório, na ordem do plano. */
export function d1RequiredPhases(repo?: Pick<RepoEntry, "has_frontend">): string[] {
  return FOUNDATION_CONTRACTS.filter((c) => c.scope === "repo")
    .filter((c) => !(c.appliesWhen === "frontend" && repo?.has_frontend === false))
    .map((c) => c.phaseId);
}

/** D1 de `repoId`: fecha quando toda fase exigida está `done` no `foundation-state.yaml`. */
export function d1Readiness(state: FoundationState | null, repoId: string, repo?: Pick<RepoEntry, "has_frontend">): GateReadiness {
  const phases = phasesForRepo(state, repoId);
  const open = d1RequiredPhases(repo)
    .map((key) => ({ key, status: phases[key]?.status ?? MISSING_REQUIREMENT }))
    .filter((r) => r.status !== "done");
  return { closed: open.length === 0, open };
}

/** Os gates de Planning que o D2 exige aprovados. */
export const D2_REQUIRED_GATES = ["roadmap_gate", "risk_matrix_gate"] as const;

/** D2 da iniciativa: fecha quando `roadmap_gate` e `risk_matrix_gate` estão `approved`. */
export function d2Readiness(initiative: Pick<Initiative, "roadmap_gate" | "risk_matrix_gate">): GateReadiness {
  const open = D2_REQUIRED_GATES.map((key) => {
    const gate: PlanningGateStatus | undefined = initiative[key];
    return { key, status: gate?.status ?? MISSING_REQUIREMENT };
  }).filter((r) => r.status !== "approved");
  return { closed: open.length === 0, open };
}
