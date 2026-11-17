import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * A skill arch-diagrams-drawio gerava diagramas com as tags HTML CRUAS na tela
 * (`<font style="font-size:11px">` aparecia literal) porque as células tinham
 * markup no `value` mas o `style` não tinha `html=1` — sem ele o drawio trata o
 * label como texto puro.
 *
 * A skill é markdown, mas seus blocos de célula são o "código" que o agente
 * copia. Este teste os verifica como qualquer artefato: toda célula com HTML no
 * value precisa de html=1 no style.
 */
// Kit local (fonte canônica dentro do repo). Antes: "../../../../.github/skills/...",
// fora do repositório, que dava ENOENT num checkout limpo (D42). A cópia em
// templates/skills/ é idêntica byte a byte a esta.
const SKILL = path.resolve(__dirname, "../dist/kit/brownfield-templates/skills/arch-diagrams-drawio/SKILL.md");

/** Extrai cada bloco <mxCell ...>…</mxCell> do markdown. */
function mxCells(md: string): string[] {
  return md.match(/<mxCell\b[\s\S]*?<\/mxCell>/g) ?? [];
}

const md = fs.readFileSync(SKILL, "utf-8");
const cells = mxCells(md);

/** O value contém marcação HTML escapada (&lt;b&gt;, &lt;font&gt;, &lt;br&gt;)? */
function valueHasHtml(cell: string): boolean {
  const m = cell.match(/value="([^"]*)"/);
  return !!m && /&lt;(b|br|font|i)\b|&lt;\/(b|font|i)&gt;/.test(m[1]!);
}

function styleHasHtml1(cell: string): boolean {
  const m = cell.match(/style="([\s\S]*?)"/);
  return !!m && /\bhtml=1\b/.test(m[1]!);
}

describe("skill drawio — html=1 obrigatório onde há HTML no value", () => {
  it("a skill tem exemplos de célula (sanidade do parser)", () => {
    expect(cells.length).toBeGreaterThan(8);
  });

  it("REGRESSÃO: toda célula com HTML no value tem html=1 no style", () => {
    const offenders = cells
      .filter(valueHasHtml)
      .filter((c) => !styleHasHtml1(c))
      .map((c) => (c.match(/id="([^"]*)"/)?.[1] ?? c.slice(0, 60)));

    expect(
      offenders,
      `células com HTML no value mas SEM html=1 (tags apareceriam cruas): ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("os nós C4 principais têm html=1", () => {
    const c4 = cells.filter((c) => /shape=mxgraph\.c4\./.test(c));
    expect(c4.length).toBeGreaterThan(5);
    for (const cell of c4) {
      const id = cell.match(/id="([^"]*)"/)?.[1];
      expect(styleHasHtml1(cell), `nó C4 '${id}' sem html=1`).toBe(true);
    }
  });

  it("a skill documenta a regra para o agente não regredir", () => {
    expect(md).toMatch(/html=1.*OBRIGAT[ÓO]RIO/i);
    expect(md).toMatch(/texto literal/i);
  });
});
