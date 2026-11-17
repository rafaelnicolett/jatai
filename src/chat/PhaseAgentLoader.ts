/**
 * PhaseAgentLoader
 *
 * Loads the agent.md file for a given phase ID, returning the agent's persona
 * (the markdown body, with frontmatter parsed into structured metadata).
 *
 * The Maestro uses this to "channel" the specialist agent during a chat turn:
 * it injects the persona prompt into its own system prompt so the LLM responds
 * AS that agent, while Helyx keeps control of state/gates.
 */

import * as fs from "fs";
import * as path from "path";
import { deliveryAgentPath } from "../data/phase-catalog.pure";

// Phase ID → path do agent.md (`.github/agents/<stream>/<arquivo>.agent.md`, ou
// o mesmo arquivo em `.claude/agents/`): consulta ao catálogo único
// (`data/phase-catalog.pure.ts`), que substituiu a antiga tabela
// `AGENT_PATH_BY_PHASE` deste arquivo.

export interface PhaseAgent {
  phaseId: string;
  agentName: string;          // ex: "@business"
  personaPrompt: string;      // markdown body (without frontmatter)
  exitContract: string[];     // parsed from frontmatter
  guardRails: string[];       // parsed from frontmatter
  outputs: string[];          // parsed from frontmatter
}

/**
 * Onde a persona pode estar: o layout do Copilot (`.github/agents/`, o do
 * catálogo) e o do Claude Code (`.claude/agents/`, L9). O primeiro que existir vence.
 */
function personaCandidates(phaseId: string): string[] {
  const rel = deliveryAgentPath(phaseId);
  if (!rel) return [];
  const copilotPrefix = ".github/agents/";
  return rel.startsWith(copilotPrefix) ? [rel, `.claude/agents/${rel.slice(copilotPrefix.length)}`] : [rel];
}

export class PhaseAgentLoader {
  constructor(private readonly root: string) {}

  load(phaseId: string): PhaseAgent | null {
    const full = personaCandidates(phaseId)
      .map((rel) => path.join(this.root, rel))
      .find((p) => fs.existsSync(p));
    if (!full) return null;

    const raw = fs.readFileSync(full, "utf-8");
    const { frontmatter, body } = splitFrontmatter(raw);
    const id = frontmatter.fields["id"] ?? phaseId;

    return {
      phaseId,
      agentName: `@${id}`,
      personaPrompt: body.trim(),
      exitContract: parseListField(frontmatter, "exit_contract"),
      guardRails:   parseListField(frontmatter, "guard_rails"),
      outputs:      parseListField(frontmatter, "outputs"),
    };
  }
}

// ── Frontmatter parsing (lightweight — no full YAML dep) ────────────────────

interface ParsedFrontmatter {
  fields: Record<string, string>;
  rawBlock: string;
}

function splitFrontmatter(raw: string): { frontmatter: ParsedFrontmatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: { fields: {}, rawBlock: "" }, body: raw };
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const kv = line.match(/^([a-z_][a-z0-9_]*):\s*(.+)?$/i);
    if (kv && kv[2] !== undefined) fields[kv[1]!] = kv[2].trim();
    else if (kv) fields[kv[1]!] = ""; // empty value → list follows
  }
  return { frontmatter: { fields, rawBlock: m[1]! }, body: m[2]! };
}

function parseListField(fm: ParsedFrontmatter, key: string): string[] {
  const lines = fm.rawBlock.split("\n");
  const startIdx = lines.findIndex(l => new RegExp("^" + key + ":\\s*$").test(l));
  if (startIdx === -1) {
    // maybe inline value
    if (fm.fields[key]) return [fm.fields[key]];
    return [];
  }
  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i]!.match(/^\s+-\s+(.+)$/);
    if (m) {
      out.push(m[1]!.replace(/^["']|["']$/g, "").trim());
      continue;
    }
    if (lines[i]!.match(/^[a-z_]/i)) break; // next top-level key
  }
  return out;
}
