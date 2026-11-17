/**
 * Barrel de transição (F3.3, ADR-0017): o cliente de escrita do State Service
 * (os 6 `POST`, sem fallback — ADR-0004) agora é parte do cliente único em
 * `src/state/client/state-service-client.ts`. Mesma API pública de antes.
 */
export {
  upsertInitiative,
  switchActiveInitiative,
  bumpInitiativePhase,
  upsertWaveItem,
  upsertDeliveryPhase,
  upsertDeliveryChecklistItem,
  type StateServiceWriteEnvelope,
  type StateServiceWriteClientOptions,
  type UpsertInitiativeInput,
  type UpsertWaveItemInput,
  type UpsertDeliveryPhaseInput,
  type UpsertDeliveryChecklistItemInput,
} from "../state/client/state-service-client";
