/**
 * brand.pure.ts
 *
 * Marca como dado (ADR-0013, F1.2). A fonte única dos nomes de marca é o
 * `brand.json` ao lado; este módulo só o tipa, congela e expõe.
 *
 * Quem lê daqui: o host (`src/`), o CLI de estado (`src/cli/`), o servidor
 * MCP (`src/mcp/`), o webview (via `webview-safe.ts`) e o gerador, que
 * renderiza os placeholders `{{brand.*}}` do kit ao copiá-lo para o
 * workspace. Zero `fs`/`path`/`vscode`: é importável pelo bundle do webview.
 *
 * Trocar a marca é trocar o `brand.json` (F1.3). O `scripts/brand-lint.mjs`
 * reprova literal de marca fora dele, e um teste confere o `package.json`
 * contra este arquivo, porque o manifesto é estático.
 */

import brandJson from "../../data/brand.json";

/** Nomes de marcas anteriores que o código ainda reconhece (Expand-Contract, ADR-0013). */
export interface BrandLegacy {
  /** Formas ASCII minúsculas das marcas anteriores, da mais recente para a mais antiga. */
  readonly names: readonly string[];
  /** Nomes de exibição das marcas anteriores, na mesma ordem de `names`. */
  readonly displayNames: readonly string[];
  /** Configs legados na raiz do workspace, na ordem de preferência de leitura. */
  readonly configFiles: readonly string[];
  /** CLIs legados em `.github/scripts/`, chamados pelos agentes de kits antigos. */
  readonly cliFiles: readonly string[];
  /** Orquestradores legados do Claude Code em `.claude/agents/`. */
  readonly orchestratorAgents: readonly string[];
  /** Slash commands legados em `.claude/commands/`. */
  readonly slashCommands: readonly string[];
  /** Nomes legados do participante de chat (sem o `@`). */
  readonly participants: readonly string[];
  /** Prefixos legados de variável de ambiente (com o `_` final). */
  readonly envPrefixes: readonly string[];
  /** Marcadores legados de opt-out do `.gitignore` (ver `GITIGNORE_KEEP_REPOS_MARKER`). */
  readonly gitignoreMarkers: readonly string[];
}

export interface Brand {
  /** Forma ASCII minúscula, usada em ids, comandos e nomes de arquivo. */
  readonly name: string;
  /** Nome de exibição, com acento se houver. */
  readonly displayName: string;
  /**
   * Pacotes publicados. `name` é o da extensão (`package.json › name`);
   * `cli` é o da CLI no npm (escopado, porque o npm bloqueia `jatai` por
   * semelhança com `jotai` e `jiti`). O binário continua `jatai`.
   */
  readonly package: { readonly name: string; readonly cli: string };
  /** Prefixo dos ids de comando: `<commandPrefix>.<comando>`. */
  readonly commandPrefix: string;
  /** Seção das chaves de configuração: `<configSection>.<chave>`. */
  readonly configSection: string;
  /**
   * Ponto de entrada da metodologia. `name` é o agente orquestrador
   * (`@jatai` no Claude Code, o custom agent `jatai` no Copilot) e é o que o
   * kit escreve como `{{brand.participant.name}}`; `id` é o id do participante
   * de chat no manifesto (o guia, ADR-0025).
   */
  readonly participant: { readonly id: string; readonly name: string };
  /**
   * O participante de chat, que desde a ADR-0025 é guia: mostra onde a
   * iniciativa está e encaminha para o agente orquestrador. `name` é o que o
   * usuário digita depois do `@`, diferente do nome do agente (F3.7).
   */
  readonly guide: { readonly name: string; readonly fullName: string };
  /** Nomes de arquivo que a extensão grava no workspace do usuário. */
  readonly files: {
    /** Config na raiz do workspace. */
    readonly config: string;
    /** CLI de estado em `.github/scripts/` (e o bundle em `templates/scripts/`). */
    readonly cli: string;
    /** Orquestrador do Claude Code em `.claude/agents/` (o Copilot usa `maestro.agent.md`). */
    readonly orchestratorAgent: string;
    /** Slash command do Claude Code em `.claude/commands/`. */
    readonly slashCommand: string;
  };
  /** Nome do executável do CLI de estado, como aparece nas mensagens de uso. */
  readonly cliName: string;
  /** Nome que o servidor MCP do State Service anuncia no handshake. */
  readonly mcpServerName: string;
  /** Prefixo das variáveis de ambiente lidas pelo CLI e pelo MCP (com o `_` final). */
  readonly envPrefix: string;
  /** Prefixo do id de template gravado no config: `<templatePrefix><stack>`. */
  readonly templatePrefix: string;
  /** Linha de opt-out do `.gitignore` que mantém `repos/` versionada. */
  readonly gitignoreMarker: string;
  readonly urls: { readonly homepage: string; readonly repository: string; readonly issues: string };
  /** Arquivos de identidade visual (o kit de identidade é a F1.1). */
  readonly assets: { readonly icon: string; readonly activityBarIcon: string; readonly iconFont: string };
  readonly legacy: BrandLegacy;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** A marca em uso. Congelada: ninguém troca a marca em runtime. */
export const BRAND: Brand = deepFreeze(brandJson);

/**
 * Valor de um caminho pontuado da marca (`"files.config"`, `"displayName"`).
 * `undefined` quando o caminho não existe ou não termina numa string.
 */
export function brandValueAt(dotted: string, brand: Brand = BRAND): string | undefined {
  let current: unknown = brand;
  for (const key of dotted.split(".")) {
    if (current === null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Lê `<prefixo><sufixo>` do ambiente: primeiro com o prefixo da marca
 * (`envPrefix`), depois com os das marcas anteriores (`legacy.envPrefixes`),
 * na ordem. Um `.mcp.json` antigo com a variável da marca anterior continua
 * funcionando (Expand-Contract, ADR-0013). `undefined` se nenhuma existir.
 */
export function readBrandEnv(
  env: Readonly<Record<string, string | undefined>>,
  suffix: string,
  brand: Brand = BRAND
): string | undefined {
  for (const prefix of [brand.envPrefix, ...brand.legacy.envPrefixes]) {
    const value = env[`${prefix}${suffix}`];
    if (value !== undefined) return value;
  }
  return undefined;
}

/** `{{brand.<caminho>}}`, como o kit (`templates/`, `brownfield-templates/`) escreve a marca. */
export const BRAND_PLACEHOLDER = /\{\{brand\.([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\}\}/g;

/**
 * Troca cada `{{brand.<caminho>}}` pelo valor da marca. Um placeholder que
 * não resolve fica como está: o `scripts/brand-lint.mjs` reprova o kit que o
 * contiver, então ele nunca chega a um workspace.
 */
export function renderBrandPlaceholders(text: string, brand: Brand = BRAND): string {
  return text.replace(BRAND_PLACEHOLDER, (match, dotted: string) => brandValueAt(dotted, brand) ?? match);
}
