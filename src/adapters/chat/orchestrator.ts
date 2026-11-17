/**
 * orchestrator.ts — encaminhar trabalho para o agente orquestrador (ADR-0025,
 * F3.7).
 *
 * O ponto de entrada da metodologia é o agente `jatai` nos dois harnesses. O
 * guia de chat (o participante) não executa nada: todo pedido de trabalho
 * (abrir iniciativa, continuar fase, Foundation) vai para o agente.
 */

import type { ChatHost, ChatOpenOptions } from "./ChatHost";
import { BRAND, type Brand } from "../../core/brand/brand.pure";

/**
 * Tira do começo do pedido a menção ao ponto de entrada (`@jatai`, os nomes
 * das marcas anteriores e o `@maestro` do Copilot): no agente, o pedido vai
 * sem ela.
 */
export function withoutEntryMention(prompt: string, brand: Brand = BRAND): string {
  let out = prompt;
  for (const mention of [brand.participant.name, ...brand.legacy.participants, "maestro"]) {
    out = out.replace(new RegExp(`^@${mention}\\b\\s*`), "");
  }
  return out;
}

/** `true` quando o pedido começa mencionando o ponto de entrada (ver `withoutEntryMention`). */
export function mentionsEntry(prompt: string, brand: Brand = BRAND): boolean {
  return withoutEntryMention(prompt, brand) !== prompt;
}

/** Abre o chat no agente orquestrador com o pedido (sem a menção de entrada). */
export function handOffToOrchestrator(chatHost: ChatHost, prompt: string, options: ChatOpenOptions = {}): Promise<void> {
  return chatHost.openAgent(BRAND.participant.name, withoutEntryMention(prompt), options);
}
