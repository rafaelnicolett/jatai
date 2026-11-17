import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

/**
 * Menções `@agente` no corpo do orquestrador de cada edição do kit (F3.5,
 * ADR-0018). O `kit-lint` resolve as referências do frontmatter; aqui fica o
 * texto que o orquestrador manda o agente seguir: citar um agente que a
 * edição não instala faz o orquestrador rotear para um arquivo que não existe.
 */

const require_ = createRequire(import.meta.url);
interface Edition { name: string; plan: Map<string, string> }
const kit = require_("../scripts/kit.js") as { editions(): Edition[] };
const BRAND = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../src/data/brand.json"), "utf-8")) as { name: string; legacy: { names: string[] } };

/** O orquestrador: o nome do kit (`maestro`) e os da marca. */
const ORCHESTRATOR = new Set(["maestro", BRAND.name, ...BRAND.legacy.names]);

function edition(name: string): Edition {
  return kit.editions().find((e) => e.name === name)!;
}

/** Ids dos agentes que a edição instala (o nome do arquivo, sem `.agent.md`). */
function agentIds(e: Edition): Set<string> {
  return new Set([...e.plan.keys()].filter((rel) => rel.endsWith(".agent.md")).map((rel) => path.posix.basename(rel, ".agent.md")));
}

/** `@menções` do corpo (sem o frontmatter) que não são agente da edição nem o orquestrador. */
function unresolvedMentions(e: Edition, rel: string): string[] {
  const body = fs.readFileSync(e.plan.get(rel)!, "utf-8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const ids = agentIds(e);
  const mentions = [...body.matchAll(/(?<![\w.])@([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![\w-])/g)].map((m) => m[1]!);
  return [...new Set(mentions)].filter((id) => !ids.has(id) && !ORCHESTRATOR.has(id)).sort();
}

describe("menções a agentes no orquestrador do kit", () => {
  it("REGRESSÃO: o orquestrador greenfield só cita agentes que a edição greenfield instala (o @assessor é do brownfield)", () => {
    expect(unresolvedMentions(edition("greenfield"), "agents/maestro.agent.md")).toEqual([]);
  });

  // O brownfield não tem @reviewer: a revisão do PR é humana, no gate D3.
  it.each(["agents/maestro.agent.md", "chatmodes/maestro.chatmode.md", "claude-instructions.md", "copilot-instructions.md", "AGENTS.md"])(
    "REGRESSÃO: %s do brownfield só cita agentes que a edição brownfield instala (sem @reviewer)",
    (rel) => {
      expect(unresolvedMentions(edition("brownfield"), rel)).toEqual([]);
    }
  );
});
