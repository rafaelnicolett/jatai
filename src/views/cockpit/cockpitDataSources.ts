/**
 * cockpitDataSources.ts — as fontes de dados do Cockpit em produção (F3.8).
 *
 * Cada domínio lê o arquivo do workspace pelo loader do seu contrato.
 * Iniciativas e delivery-state são lidos no próprio processo, pelo
 * `StateCommands` e pelo repositório de estado (ADR-0017, A12): nada de HTTP
 * para o State Service que roda no mesmo Extension Host. Falha vira
 * `DataSourceIssue`, nunca exceção.
 */

import type { ConfigLoader } from "../../adapters/config/ConfigLoader";
import type { CockpitDataSources } from "./CockpitSnapshotBuilder";
import { loadRepos } from "../../data/repos-contract";
import { loadFoundationState } from "../../data/foundation-state-contract";
import { loadContextRepos } from "../../data/context-repos-contract";
import { loadRepoGraph } from "../../data/repo-graph-contract";
import { loadRunEvents } from "../../data/run-events-contract";
import { loadInitiatives, type InitiativesState } from "../../data/initiatives-contract";
import { loadDeliveryState, type DeliveryState } from "../../data/delivery-state-contract";
import { loadSprintBacklog } from "../../data/sprint-backlog-contract";
import { loadOperationsSnapshot } from "../../data/operations-contract";
import { getKitStatus, kitVersion } from "../../data/kit-version";
import { StateCommands } from "../../state/application/StateCommands";
import type { StateRepository } from "../../state/repository/StateRepository";
import { BRAND } from "../../data/brand.pure";
import { AgentCatalogReader } from "./agentDirectory";

export function cockpitDataSources(configLoader: ConfigLoader, repository: StateRepository): CockpitDataSources {
  // Um leitor por Cockpit: guarda o catálogo e só relê quando um agente muda (F5.3).
  const agentCatalog = new AgentCatalogReader();
  return {
    loadConfig: () => configLoader.load(),
    isConfigured: () => configLoader.isConfigured(),
    loadRepos: (root, onError) => loadRepos(root, onError),
    loadFoundationState: (root, onError) => loadFoundationState(root, onError),
    loadContextRepos: (root, onError) => loadContextRepos(root, onError),
    loadRepoGraph: (root, onError) => loadRepoGraph(root, onError),
    loadRunEvents: (root, limit, onError) => loadRunEvents(root, limit, onError),
    /**
     * Iniciativas no próprio processo (A12 / H-BUG-18, ADR-0017): o mesmo dado
     * de `GET /initiatives`, pelo `StateCommands` sobre o repositório. Se a
     * leitura falhar, cai no loader tolerante do YAML, que reporta o problema
     * como `DataSourceIssue` (nunca lança).
     */
    readInitiatives: (root, onError): Promise<InitiativesState | null> => {
      try {
        const result = new StateCommands({ root, repository }).readInitiatives();
        if (result.ok) return Promise.resolve((result.body.state as InitiativesState | null) ?? null);
      } catch (err) {
        console.error(`[${BRAND.name}] Cockpit: falha ao ler iniciativas pelo repositório; usando o YAML:`, err);
      }
      return Promise.resolve(loadInitiatives(root, onError));
    },
    /** Delivery-state no próprio processo: o mesmo dado de `GET /delivery-state[?initiativeId=<id>]`, com o mesmo fallback. */
    readDeliveryState: (root, initiativeId, onError): Promise<DeliveryState | null> => {
      try {
        return Promise.resolve(repository.loadDeliveryState(root, initiativeId));
      } catch (err) {
        console.error(`[${BRAND.name}] Cockpit: falha ao ler o delivery-state pelo repositório; usando o YAML:`, err);
      }
      return Promise.resolve(loadDeliveryState(root, initiativeId, onError));
    },
    loadSprintBacklog: (root, activeId, onError) => loadSprintBacklog(root, activeId, onError),
    loadOperationsSnapshot: (root, onError) => loadOperationsSnapshot(root, onError),
    kitStatus: (root) => getKitStatus(root, kitVersion()),
    loadAgentCatalog: (root) => agentCatalog.read(root),
  };
}
