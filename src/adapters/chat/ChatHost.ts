/**
 * ChatHost.ts — porta do chat do editor (F3.6).
 *
 * Abre a view de chat do VS Code com um pedido: para o participante de chat
 * (`open`) ou direto num agente do chat, como o orquestrador (`openAgent`,
 * ADR-0025). Quem decide o texto é quem chama; a porta só entrega. Sem
 * `vscode` nem I/O.
 */

export type ChatHostId = "copilot" | "claude";

export interface ChatOpenOptions {
  /** Só preenche o campo do chat, sem enviar (o usuário revisa e envia). */
  partial?: boolean;
  /** Harness do workspace, quando quem chama já sabe (ex.: o Wizard); senão a porta descobre. */
  host?: ChatHostId;
}

export interface ChatHost {
  /** Abre o chat com `query`. Rejeita se o chat não estiver disponível. */
  open(query: string, options?: ChatOpenOptions): Promise<void>;
  /** Abre o chat no agente `agent` (custom agent do Copilot) com `query`. Rejeita se o chat não estiver disponível. */
  openAgent(agent: string, query: string, options?: ChatOpenOptions): Promise<void>;
}

/** Chat que só grava os pedidos, para testes. */
export class RecordingChatHost implements ChatHost {
  readonly opened: Array<{ query: string; partial: boolean }> = [];
  readonly agentRequests: Array<{ agent: string; query: string; partial: boolean; host?: ChatHostId }> = [];

  open(query: string, options: ChatOpenOptions = {}): Promise<void> {
    this.opened.push({ query, partial: options.partial === true });
    return Promise.resolve();
  }

  openAgent(agent: string, query: string, options: ChatOpenOptions = {}): Promise<void> {
    this.agentRequests.push({ agent, query, partial: options.partial === true, ...(options.host ? { host: options.host } : {}) });
    return Promise.resolve();
  }
}
