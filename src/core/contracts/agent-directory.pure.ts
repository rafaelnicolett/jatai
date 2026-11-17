/**
 * agent-directory.pure.ts — o catálogo dos agentes instalados, no que o mapa
 * da colmeia precisa (F5.3): quem é cada agente e qual a sua responsabilidade.
 *
 * A responsabilidade é a `description` do frontmatter do agente, lida no host
 * dos arquivos `.claude/agents/**` e `.github/agents/**` do workspace. Fica
 * aqui só o que é puro (tipo, id e o texto curto), para o webview importar; a
 * leitura do disco é da casca (`views/cockpit/agentDirectory.ts`).
 *
 * Aditivo: o campo `agents` do snapshot do Cockpit é opcional, e o mapa
 * funciona sem ele (a linha de responsabilidade só não aparece).
 */

/** Tamanho máximo do texto de responsabilidade que sai do host (a descrição do kit tem uma frase). */
export const AGENT_ROLE_MAX = 220;

/** Um agente instalado: `id` com arroba (`@migration-agent`) e a sua responsabilidade em uma frase. */
export interface AgentCatalogEntry {
  id: string;
  role: string;
}

/** `migration-agent` e `@migration-agent` são o mesmo agente; o catálogo usa sempre a forma com arroba. */
export function normalizeAgentId(raw: string): string {
  const id = raw.trim();
  return id.startsWith("@") ? id : `@${id}`;
}

/**
 * O prefixo de stream que o kit põe na descrição ("Execution: migra versão…",
 * "Discovery (opcional): …", "Side-car: …") diz onde o agente atua, e o mapa já
 * diz isso pela ilha. Sai do texto de responsabilidade.
 */
const STREAM_PREFIX = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{1,15}(?: \([^)]{1,20}\))?:\s+/;

/** A responsabilidade do agente em uma frase: sem o prefixo de stream, com a primeira letra maiúscula e cortada em `AGENT_ROLE_MAX`. */
export function agentRoleFromDescription(description: string): string {
  const text = description.replace(/\s+/g, " ").trim().replace(STREAM_PREFIX, "");
  if (text === "") return "";
  const clipped = [...text].slice(0, AGENT_ROLE_MAX).join("");
  return clipped.charAt(0).toLocaleUpperCase("pt-BR") + clipped.slice(1);
}

/** Índice do catálogo por id normalizado. */
export function agentRoleIndex(catalog: readonly AgentCatalogEntry[] | undefined): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of catalog ?? []) {
    const id = normalizeAgentId(entry.id);
    if (entry.role && !index.has(id)) index.set(id, entry.role);
  }
  return index;
}
