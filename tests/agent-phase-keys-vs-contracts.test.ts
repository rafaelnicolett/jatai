import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FOUNDATION_CONTRACTS, SKILL_LINKING_CONTRACT } from "../src/data/foundation-contracts";

/**
 * A garantia estrutural que faltava: "o dashboard tem que ser o caminho e
 * andamento do que está rolando" só é verdade se toda chave que um agente
 * grava em `foundation-state.yaml` tiver um contrato correspondente em
 * `foundation-contracts.ts`. Sem isso, a fase existe no disco e some da tela
 * — nem "pendente" aparece.
 *
 * Foi exatamente o que aconteceu 3 vezes seguidas, descobertas numa sessão
 * real: `dependency-graph` e `wiki-synthesis` tinham protocolo documentado e
 * ZERO contrato; `domain-extractor.agent.md` se contradizia com o
 * `assessor.agent.md` (`domain-extraction` vs `domain`). Nenhuma quebrava
 * build — cada uma só deixava a fase invisível, em silêncio.
 *
 * Este teste varre TODOS os blocos ```yaml de TODOS os agentes, extrai toda
 * chave gravada diretamente sob `phases:`, e falha se ela não tiver contrato.
 * Uma 4ª causa (`design` vs `design-system`) não é pega aqui por natureza —
 * foi uma improvisação em runtime, não um erro nos documentos — e é coberta
 * por um alias de compatibilidade no parser (foundation-state-contract.ts),
 * não por este teste estático.
 */

// Kit local (fonte canônica dentro do repo). Antes: "../../../../brownfield-templates/agents",
// fora do repositório, que dava ENOENT num checkout limpo (D42).
const AGENTS_ROOT = path.resolve(__dirname, "../dist/kit/brownfield-templates/agents");
const CANONICAL_PHASE_IDS = new Set([
  ...FOUNDATION_CONTRACTS.map((c) => c.phaseId),
  SKILL_LINKING_CONTRACT.phaseId,
]);

/** Extrai chaves gravadas como filhas diretas de um `phases:` em blocos ```yaml. */
function phaseKeysWrittenBy(filePath: string): string[] {
  const text = fs.readFileSync(filePath, "utf-8");
  const keys: string[] = [];

  for (const block of text.matchAll(/```yaml\n([\s\S]*?)```/g)) {
    const lines = block[1]!.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^phases:\s*$/.test(lines[i]!)) continue;

      let indent: number | null = null;
      for (const line of lines.slice(i + 1)) {
        if (line.trim() === "") continue;
        // Tolera comentário inline após a chave (`domain:  # nota`) — YAML
        // válido, e os próprios agent.md usam isso para anotar exemplos.
        const m = line.match(/^(\s+)([a-z][a-z0-9-]*):\s*(#.*)?$/);
        if (!m) break; // saiu do bloco phases:
        const curIndent = m[1]!.length;
        if (indent === null) indent = curIndent;
        if (curIndent !== indent) break; // nível diferente, não é irmã direta
        keys.push(m[2]!);
      }
    }
  }
  return keys;
}

function allAgentFiles(): string[] {
  const files: string[] = [];
  for (const dir of fs.readdirSync(AGENTS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of fs.readdirSync(path.join(AGENTS_ROOT, dir.name)).filter((f) => f.endsWith(".agent.md"))) {
      files.push(path.join(AGENTS_ROOT, dir.name, f));
    }
  }
  return files;
}

describe("toda chave de fase gravada por um agente tem contrato correspondente", () => {
  const files = allAgentFiles();

  it("encontra agentes para auditar (sanidade do parser)", () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
  });

  it("FOUNDATION_CONTRACTS não está vazio (sanidade)", () => {
    expect(CANONICAL_PHASE_IDS.size).toBeGreaterThanOrEqual(10);
  });

  it.each(files.map((f) => [path.relative(AGENTS_ROOT, f), f] as const))(
    "%s",
    (_rel, file) => {
      const keys = phaseKeysWrittenBy(file);
      const missing = keys.filter((k) => !CANONICAL_PHASE_IDS.has(k));
      expect(
        missing,
        `${path.basename(file)} grava fase(s) sem contrato em foundation-contracts.ts: ${missing.join(", ")}`
      ).toEqual([]);
    }
  );

  it("REGRESSÃO: dependency-graph tem contrato (Passo 2b do @assessor)", () => {
    expect(CANONICAL_PHASE_IDS.has("dependency-graph")).toBe(true);
  });

  it("REGRESSÃO: wiki-synthesis tem contrato (Passo 3b — síntese da LLM Wiki)", () => {
    expect(CANONICAL_PHASE_IDS.has("wiki-synthesis")).toBe(true);
  });

  it("REGRESSÃO: domain-extractor.agent.md não se contradiz com o assessor (usa 'domain', não 'domain-extraction')", () => {
    const file = path.join(AGENTS_ROOT, "discovery", "domain-extractor.agent.md");
    expect(phaseKeysWrittenBy(file)).not.toContain("domain-extraction");
    expect(phaseKeysWrittenBy(file)).toContain("domain");
  });
});

describe("FOUNDATION_CONTRACTS não tem phaseId duplicado", () => {
  it("todo phaseId (incluindo skill-linking) é único", () => {
    const ids = [...FOUNDATION_CONTRACTS.map((c) => c.phaseId), SKILL_LINKING_CONTRACT.phaseId];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
