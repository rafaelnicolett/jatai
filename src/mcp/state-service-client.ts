/**
 * state-service-client.ts
 *
 * Anti-Corruption Layer entre o servidor MCP (processo Node standalone,
 * spawned pelo cliente MCP/host de agente) e a API HTTP local do State
 * Service (`StateServiceServer`, roda dentro do Extension Host — ver
 * ADR-0004). Este módulo é a ÚNICA coisa no servidor MCP que fala HTTP com
 * o State Service; as tools MCP (`tools.ts`) chamam só estas funções.
 *
 * A implementação de fato (descoberta via `server.json` + fetch + header de
 * auth) mora no cliente único `../state/client/state-service-client.ts` (F3.3,
 * ADR-0017), que também serve o CLI e as tools de escrita. Antes morava em
 * `../server/state-service-read-client.ts`, extraída dali no
 * roadmap item 3.2 para ser reusada também por `CockpitNextController`
 * (Extension Host, não um processo MCP standalone). Este arquivo é um
 * re-export fino: mantém o mesmo contrato público que `mcp/tools.ts` e os
 * testes já dependiam, sem duplicar a lógica de descoberta/fetch/auth entre
 * os dois consumidores (o servidor MCP e o Cockpit).
 *
 * Falha (arquivo ausente OU fetch falha — ex.: extensão foi desativada
 * depois do arquivo escrito, ou processo travou sem rodar `deactivate()`)
 * NUNCA lança: cada função devolve um envelope `{ ok: false, error }` com
 * mensagem clara, igual ao padrão de degradação graciosa do resto do
 * codebase (erro é dado, não exceção).
 *
 * AUTENTICAÇÃO (item 2.5): todo endpoint do State Service exceto `/health`
 * exige o header `Authorization: Bearer <token>` — o `token` vem do mesmo
 * `server.json` que já dá a porta (`StateServiceInfo.token`, ver
 * `state-service-info.ts`). Sem isto, as 3 tools MCP quebrariam com 401 assim
 * que `StateServiceServer` passou a exigir auth.
 */
export {
  getInitiatives,
  getDeliveryState,
  checkStateServiceHealth,
  STATE_SERVICE_NOT_RUNNING_ERROR,
  type StateServiceEnvelope,
  type StateServiceClientOptions,
} from "../state/client/state-service-client";
