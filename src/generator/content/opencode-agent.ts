/**
 * opencode-agent.ts
 *
 * Tradução de um agente do kit para o formato do OpenCode 2.x (epic-9).
 * Função pura: recebe o caminho relativo no kit e o conteúdo já renderizado
 * (os `{{brand.*}}` foram resolvidos pelo `copyKitFile`) e devolve o destino
 * plano e o conteúdo com o frontmatter permitido.
 *
 * O contrato foi verificado no OpenCode 2.3.0
 * (`planning/mod-missao-open-source/opencode/opencode-contract.md`):
 * - o ID do agente é o caminho do arquivo (`<id>.md`), então o kit é achatado;
 * - frontmatter desconhecido vai para `request.body`; só `description`,
 *   `mode` e `permissions` sobrevivem;
 * - `model` em lista impede o agente de carregar;
 * - `uses_skills` vira allowlist de `skill` + seção no corpo.
 */

import * as yaml from "js-yaml";
import { BRAND, type Brand } from "../../data/brand.pure";

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Streams do kit; a subpasta não entra no ID do OpenCode, então ela é achatada. */
export const KIT_AGENT_STREAMS = ["discovery", "planning", "execution", "operation", "upstream", "downstream", "guardian", "sidecar"] as const;

const ORCHESTRATOR_NOTE = `## Neste harness (OpenCode)

Para acionar um especialista, use a tool \`subagent\` com o **ID** do agente
(\`assessor\`, \`tech-mapper\`, ...). A menção \`@assessor\` é a forma curta; o ID
não tem a subpasta \`discovery/\`.`;

const ASSESSOR_NOTE = `## Nota do OpenCode — LLM Wiki

A LLM Wiki fica em \`.opencode/agents/domain/<slug>.md\`; no OpenCode o ID do
agente é \`domain/<slug>\`. Use \`@domain/<slug>\` no roteamento.`;

export interface AdaptedOpenCodeAgent {
  /** Nome do arquivo no destino, dentro de `.opencode/agents/`. */
  readonly destination: string;
  readonly content: string;
}

interface SplitAgent {
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

function splitFrontmatter(raw: string): SplitAgent {
  const m = FM_RE.exec(raw);
  if (!m) return { frontmatter: {}, body: raw };
  let parsed: unknown;
  try {
    parsed = yaml.load(m[1]!);
  } catch {
    parsed = {};
  }
  return {
    frontmatter: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {},
    body: raw.slice(m[0].length),
  };
}

/** Reescreve os paths do kit para o layout do OpenCode (sem tocar em artefatos). */
export function rewriteOpenCodePaths(text: string): string {
  let out = text;
  // A definição de <host-dir> no corpo do @assessor vira a do OpenCode, antes
  // de o placeholder genérico ser substituído.
  out = out.replace(/`<host-dir>` é `\.github` \(Copilot\)\s*\n?ou `\.claude` \(Claude\)/g, "no OpenCode, o harness usa `.opencode`");
  out = out.replace(/\.github\/agents\//g, ".opencode/agents/");
  out = out.replace(/\.claude\/agents\//g, ".opencode/agents/");
  out = out.replace(/\.github\/skills\//g, ".opencode/skills/");
  out = out.replace(/\.claude\/skills\//g, ".opencode/skills/");
  out = out.replace(/<host-dir>/g, ".opencode");
  // Agentes do kit: stream/<id>.agent.md -> <id>.md (plano).
  out = out.replace(
    new RegExp(`(agents\\/)(?:${KIT_AGENT_STREAMS.join("|")})\\/([A-Za-z0-9_.-]+)\\.agent\\.md`, "g"),
    "$1$2.md"
  );
  // Os demais (ex.: a LLM Wiki em domain/<slug>.agent.md) só perdem o .agent.
  out = out.replace(/(agents\/[A-Za-z0-9_./<>-]+)\.agent\.md/g, "$1.md");
  return out;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

/**
 * Adapta um agente. `rel` é o caminho no kit, POSIX, relativo a `agents/`
 * (ex.: `discovery/assessor.agent.md`, `maestro.agent.md`).
 */
export function adaptOpenCodeAgent(rel: string, raw: string, brand: Brand = BRAND): AdaptedOpenCodeAgent {
  const { frontmatter, body } = splitFrontmatter(raw);
  const orchestrator = rel === "maestro.agent.md";
  const destination = orchestrator
    ? `${brand.name}.md`
    : rel.replace(/\.agent\.md$/, ".md").split("/").pop()!;
  const usesSkills = stringList(frontmatter.uses_skills);
  const description = typeof frontmatter.description === "string" && frontmatter.description.trim().length >= 20
    ? frontmatter.description.trim()
    : `${destination.replace(/\.md$/, "")} — agente do kit ${brand.displayName}.`;

  const out: Record<string, unknown> = {
    description,
    mode: orchestrator ? "primary" : "subagent",
  };
  if (usesSkills.length > 0) {
    out.permissions = [
      { action: "skill", resource: "*", effect: "deny" },
      ...usesSkills.map((skill) => ({ action: "skill", resource: skill, effect: "allow" })),
    ];
  }

  let adaptedBody = rewriteOpenCodePaths(body);
  if (orchestrator) adaptedBody = `${adaptedBody.trimEnd()}\n\n${ORCHESTRATOR_NOTE}\n`;
  if (destination === "assessor.md") adaptedBody = `${adaptedBody.trimEnd()}\n\n${ASSESSOR_NOTE}\n`;
  if (usesSkills.length > 0) {
    adaptedBody = `${adaptedBody.trimEnd()}\n\n## Skills desta fase\n\nCarregue apenas: ${usesSkills.map((s) => `\`${s}\``).join(", ")}.\n`;
  }

  const yamlBlock = yaml.dump(out, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd();
  return { destination, content: `---\n${yamlBlock}\n---\n${adaptedBody}` };
}
