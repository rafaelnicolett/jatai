/**
 * agentDirectory.ts — lê dos agentes instalados no workspace a responsabilidade
 * de cada um (F5.3), para o painel da ilha do mapa da colmeia.
 *
 * Os agentes ficam em `.claude/agents/**` (Claude Code) e `.github/agents/**`
 * (Copilot), um `<id>.agent.md` com frontmatter YAML. Vale o campo
 * `description`. Só o frontmatter é lido, nunca o corpo do agente (R8: o mapa
 * mostra metadados).
 *
 * O Cockpit monta o snapshot a cada 4 s e a cada evento, então o leitor guarda
 * o resultado e só relê quando a lista de arquivos, o tamanho ou o horário de
 * algum deles muda. Falha num arquivo nunca derruba o lote: o agente só fica
 * sem a linha de responsabilidade.
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { BRAND } from "../../data/brand.pure";
import { agentRoleFromDescription, normalizeAgentId, type AgentCatalogEntry } from "../../core/contracts/agent-directory.pure";

/** Onde o kit instala os agentes, na ordem de preferência quando o mesmo id aparece nos dois. */
export const AGENT_DIRS = [".claude/agents", ".github/agents"] as const;

const AGENT_FILE = /\.agent\.md$/;
const MAX_DEPTH = 3;
/** Um agente com mais que isto não é um agente do kit; o frontmatter não passa de alguns KB. */
const MAX_FILE_BYTES = 256 * 1024;

/** O frontmatter de um `.agent.md`, ou `null` se o arquivo não tem um. */
function frontmatterOf(raw: string): Record<string, unknown> | null {
  const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!m) return null;
  try {
    const doc: unknown = parseYaml(m[1]!);
    return doc && typeof doc === "object" && !Array.isArray(doc) ? (doc as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Um agente a partir do texto do arquivo. Sem `description`, não há responsabilidade a mostrar: `null`. */
export function parseAgentFile(raw: string, fileName: string): AgentCatalogEntry | null {
  const fm = frontmatterOf(raw);
  if (!fm) return null;
  const description = typeof fm["description"] === "string" ? fm["description"] : "";
  const role = agentRoleFromDescription(description);
  if (role === "") return null;
  const id = typeof fm["id"] === "string" && fm["id"].trim() !== "" ? fm["id"] : fileName.replace(AGENT_FILE, "");
  return { id: normalizeAgentId(id), role };
}

interface AgentFile {
  rel: string;
  full: string;
  signature: string;
}

function listAgentFiles(root: string): AgentFile[] {
  const out: AgentFile[] = [];
  const walk = (dir: string, rel: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // pasta ausente: o workspace pode não ter esse harness
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      const relPath = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) walk(full, relPath, depth + 1);
      } else if (AGENT_FILE.test(entry.name)) {
        try {
          const stat = fs.statSync(full);
          if (stat.size <= MAX_FILE_BYTES) out.push({ rel: relPath, full, signature: `${relPath}:${stat.mtimeMs}:${stat.size}` });
        } catch {
          // arquivo sumiu entre a listagem e o stat
        }
      }
    }
  };
  for (const dir of AGENT_DIRS) walk(path.join(root, ...dir.split("/")), dir, 0);
  return out;
}

export class AgentCatalogReader {
  private _root: string | null = null;
  private _signature = "";
  private _entries: AgentCatalogEntry[] = [];

  /** O catálogo dos agentes do workspace, relido só quando algum arquivo mudou. */
  read(root: string): AgentCatalogEntry[] {
    const files = listAgentFiles(root);
    const signature = files.map((f) => f.signature).join("|");
    if (root === this._root && signature === this._signature) return this._entries;

    const byId = new Map<string, AgentCatalogEntry>();
    for (const file of files) {
      try {
        const entry = parseAgentFile(fs.readFileSync(file.full, "utf-8"), path.basename(file.full));
        if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
      } catch (err) {
        console.error(`[${BRAND.name}] Cockpit: falha ao ler o agente ${file.rel}:`, err);
      }
    }
    this._root = root;
    this._signature = signature;
    this._entries = [...byId.values()];
    return this._entries;
  }
}
