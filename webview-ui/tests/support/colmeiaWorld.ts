import { activeInitiative, deriveColmeia, deriveIslandDetails, initiativeFlow, type ColmeiaVM, type IslandDetail, type RunEvent } from "@data";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { buildScene, type SceneModel, type SceneOptions } from "../../src/apps/cockpit/map/sceneModel";
import { buildColmeiaSnapshot, colmeiaEvent, type ColmeiaSnapshotOptions } from "../../src/mock/colmeiaScenarios";

/**
 * Apoio dos testes do mapa (F5.3): o "mundo" de mentira e a cadeia de
 * derivação que o webview usa (snapshot → ColmeiaVM → detalhes → cena).
 * Não é fixture de dado: os builders vêm de `src/mock/colmeiaScenarios.ts`,
 * os mesmos do harness visual, e a cadeia é a de `useColmeia`.
 */

export { buildColmeiaSnapshot, colmeiaEvent };

export interface World {
  snapshot: CockpitSnapshot;
  events: RunEvent[];
  vm: ColmeiaVM;
  details: IslandDetail[];
  scene: SceneModel;
}

/** O mundo derivado: o que o webview mostra para este estado e estes eventos. */
export function world(options: ColmeiaSnapshotOptions = {}, scene: SceneOptions = {}): World {
  const events = options.events ?? [];
  const snapshot = buildColmeiaSnapshot({ ...options, events });
  const vm = deriveColmeia(snapshot, events, initiativeFlow(activeInitiative(snapshot.initiatives)));
  const details = deriveIslandDetails(snapshot, vm, events, snapshot.agents);
  return { snapshot, events, vm, details, scene: buildScene(vm, details, scene) };
}

/** Um agente começa uma tarefa da Execução (o evento que o hook do kit e o StateCommands gravam). */
export function started(agent: string, task: string, message?: string, at?: number): RunEvent {
  return colmeiaEvent({ event_type: "agent-started", agent_id: agent, task_id: task, phase_id: "execution", ...(message ? { message } : {}) }, at);
}

export function finished(agent: string, task: string, at?: number): RunEvent {
  return colmeiaEvent({ event_type: "agent-done", agent_id: agent, task_id: task, phase_id: "execution" }, at);
}
