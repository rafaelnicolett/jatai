import { describe, it, expect } from "vitest";
import type { BoardCard } from "../src/design-system/patterns/PhaseBoard/PhaseBoard";
import { boardCardModalFields } from "../src/design-system/patterns/PhaseBoard/boardCardModalFields";

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return { key: "item-1.1", id: "item-1.1", title: "resumo", lane: "done", ...overrides };
}

describe("boardCardModalFields", () => {
  it("card sem meta/since: nenhum campo", () => {
    expect(boardCardModalFields(card())).toEqual([]);
  });

  it("card com meta: 1 campo 'Detalhes' com o valor de meta", () => {
    expect(boardCardModalFields(card({ meta: "2026-08-20" }))).toEqual([{ label: "Detalhes", value: "2026-08-20" }]);
  });

  it("card com since: 1 campo 'Desde' com o valor de since", () => {
    expect(boardCardModalFields(card({ since: "2026-08-20T10:00:00Z" }))).toEqual([
      { label: "Desde", value: "2026-08-20T10:00:00Z" },
    ]);
  });

  it("card com meta E since ao mesmo tempo: os dois campos aparecem — diferente do CardFooter compacto, que só mostra um dos dois (aprovar > since > meta)", () => {
    const fields = boardCardModalFields(card({ meta: "nota da onda", since: "2026-08-01" }));
    expect(fields).toEqual([
      { label: "Detalhes", value: "nota da onda" },
      { label: "Desde", value: "2026-08-01" },
    ]);
  });

  it("card com approve presente: boardCardModalFields ainda mostra meta (independente do rodapé compacto esconder meta quando approve existe)", () => {
    const fields = boardCardModalFields(
      card({ meta: "2026-08-15", approve: { onApprove: () => {} } })
    );
    expect(fields).toEqual([{ label: "Detalhes", value: "2026-08-15" }]);
  });

  it("card sem details: nenhum campo de commit/artefatos/known bugs", () => {
    expect(boardCardModalFields(card({ details: {} }))).toEqual([]);
  });

  it("card com details.commit: 1 campo 'Commit' com o valor curto do SHA", () => {
    expect(boardCardModalFields(card({ details: { commit: "7d409ea" } }))).toEqual([
      { label: "Commit", value: "7d409ea" },
    ]);
  });

  it("card com details.artifacts: 1 campo 'Artefatos' com os itens juntados por quebra de linha", () => {
    const fields = boardCardModalFields(card({ details: { artifacts: ["docs/adr/0003-x.md", "tests/y.test.ts"] } }));
    expect(fields).toEqual([{ label: "Artefatos", value: "docs/adr/0003-x.md\ntests/y.test.ts" }]);
  });

  it("card com details.knownBugs: 1 campo 'Known bugs' com os itens juntados por quebra de linha", () => {
    const fields = boardCardModalFields(card({ details: { knownBugs: ["bug-42", "bug-43"] } }));
    expect(fields).toEqual([{ label: "Known bugs", value: "bug-42\nbug-43" }]);
  });

  it("card com details.artifacts/knownBugs vazios ([]): não mostra os campos correspondentes", () => {
    expect(boardCardModalFields(card({ details: { artifacts: [], knownBugs: [] } }))).toEqual([]);
  });

  it("card com meta, since E os 3 campos de details ao mesmo tempo: todos aparecem, nesta ordem", () => {
    const fields = boardCardModalFields(
      card({
        meta: "nota da onda",
        since: "2026-08-01",
        details: { commit: "7d409ea", artifacts: ["a.md"], knownBugs: ["bug-1"] },
      })
    );
    expect(fields).toEqual([
      { label: "Detalhes", value: "nota da onda" },
      { label: "Desde", value: "2026-08-01" },
      { label: "Commit", value: "7d409ea" },
      { label: "Artefatos", value: "a.md" },
      { label: "Known bugs", value: "bug-1" },
    ]);
  });
});
