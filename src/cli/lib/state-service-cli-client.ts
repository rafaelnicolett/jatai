/**
 * Barrel de transição (F3.3, ADR-0017): o cliente de escrita do CLI (prazo de
 * 300 ms, `{ ok: false }` como sinal para o fallback de escrita direta em
 * YAML) agora é a política `tryStateServiceWrite` do cliente único em
 * `src/state/client/state-service-client.ts`. Mesma API pública de antes.
 *
 * O fallback é permanente por design (ADR-0003, mantido pela ADR-0017): o
 * principal consumidor do CLI é um agente num terminal, sem garantia de que
 * o VS Code com a extensão está aberto. Não remova sem reabrir essa decisão.
 */
export {
  tryStateServiceWrite,
  STATE_SERVICE_CLI_TIMEOUT_MS,
  type StateServiceCliClientOptions,
  type StateServiceWriteResult,
} from "../../state/client/state-service-client";
