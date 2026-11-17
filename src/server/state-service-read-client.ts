/**
 * Barrel de transição (F3.3, ADR-0017): o cliente de leitura do State Service
 * agora é parte do cliente único em `src/state/client/state-service-client.ts`.
 * Mesma API pública de antes (`GET /initiatives`, `/delivery-state`, `/health`).
 */
export {
  getInitiatives,
  getDeliveryState,
  checkStateServiceHealth,
  STATE_SERVICE_NOT_RUNNING_ERROR,
  type StateServiceEnvelope,
  type StateServiceClientOptions,
} from "../state/client/state-service-client";
