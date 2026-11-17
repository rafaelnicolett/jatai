import { describe, it, expect } from "vitest";
import type { IslandState } from "@data";
import { BRIDGE_LENGTH, ISLAND_WIDTH, MAX_SCALE, SAFE, STAGE, axisOfLink, layoutScene, thicknessFor } from "../src/apps/cockpit/map/layout";
import { AXIS, FACING, diamond, edgeEnds, inDiamond, pt, type Pt } from "../src/apps/cockpit/map/projection";

/** O layout do mapa (F5.3): a escada de ilhas pelos dois eixos do piso, a ponte de meio de aresta a meio de aresta, e tudo cabendo no palco. */

const four = (current = 2): Array<{ id: string; state: IslandState }> =>
  ["discovery", "planning", "execution", "operation"].map((id, i) => ({ id, state: i < current ? "done" : i === current ? "current" : "sleeping" }));

const many = (n: number, current = 0): Array<{ id: string; state: IslandState }> => Array.from({ length: n }, (_, i) => ({ id: `ilha-${i}`, state: i < current ? "done" : i === current ? "current" : "sleeping" }));

const onSegment = (p: Pt, [a, b]: [Pt, Pt]): boolean => {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const within = p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6;
  return Math.abs(cross) < 1e-6 && within;
};

describe("layoutScene", () => {
  it("sem ilhas não há layout, e uma ilha só não tem ponte", () => {
    expect(layoutScene([])).toEqual({ placements: [], bridges: [], scale: 1 });
    const solo = layoutScene(many(1));
    expect(solo.placements).toHaveLength(1);
    expect(solo.bridges).toEqual([]);
  });

  it("a ilha atual é a maior, a adormecida a menor, com as larguras do protótipo (420, ~290, 270) na mesma proporção", () => {
    const { placements, scale } = layoutScene(four());
    const widths = placements.map((p) => p.w / scale);
    expect(widths).toEqual([ISLAND_WIDTH.done, ISLAND_WIDTH.done, ISLAND_WIDTH.current, ISLAND_WIDTH.sleeping].map((w) => expect.closeTo(w, 6)));
    expect(Math.max(...placements.map((p) => p.w))).toBe(placements[2]!.w);
    expect(thicknessFor(300)).toBe(60);
    expect(thicknessFor(420)).toBe(70);
  });

  it("os eixos das ligações alternam NE, SE, NE, como no protótipo", () => {
    expect([0, 1, 2, 3].map(axisOfLink)).toEqual(["NE", "SE", "NE", "SE"]);
    expect(layoutScene(four()).bridges.map((b) => b.axis)).toEqual(["NE", "SE", "NE"]);
  });

  it("cada ponte nasce no meio da aresta que olha para a outra ilha e anda exatamente pelo eixo, com o comprimento de projeto", () => {
    const layout = layoutScene(four());
    for (const [i, bridge] of layout.bridges.entries()) {
      const from = layout.placements[i]!;
      const to = layout.placements[i + 1]!;
      const [edgeFrom, edgeTo] = FACING[bridge.axis];
      expect(onSegment(bridge.a, edgeEnds(diamond(from.c, from.w), edgeFrom))).toBe(true);
      expect(onSegment(bridge.b, edgeEnds(diamond(to.c, to.w), edgeTo))).toBe(true);
      const axis = AXIS[bridge.axis];
      const dx = bridge.b.x - bridge.a.x;
      const dy = bridge.b.y - bridge.a.y;
      // Paralelo ao eixo (produto vetorial nulo) e com o comprimento da ponte, na escala do conjunto.
      expect(dx * axis.y - dy * axis.x).toBeCloseTo(0, 6);
      expect(dx / axis.x).toBeCloseTo(BRIDGE_LENGTH * layout.scale, 6);
    }
  });

  it("o tabuleiro é perpendicular ao sentido da ponte (o outro eixo do piso)", () => {
    for (const bridge of layoutScene(four()).bridges) {
      const other = bridge.axis === "NE" ? AXIS.SE : AXIS.NE;
      expect(bridge.e.x * other.y - bridge.e.y * other.x).toBeCloseTo(0, 6);
      expect(Math.hypot(bridge.e.x, bridge.e.y)).toBeGreaterThan(0);
    }
  });

  it("para qualquer número de ilhas o conjunto cabe no palco e na faixa segura, sem a escala passar do teto", () => {
    for (let n = 1; n <= 9; n++) {
      for (let current = 0; current < n; current++) {
        const { placements, scale } = layoutScene(many(n, current));
        expect(scale, `${n} ilhas`).toBeLessThanOrEqual(MAX_SCALE);
        const xs = placements.flatMap((p) => [p.c.x - p.w / 2, p.c.x + p.w / 2]);
        expect(Math.min(...xs), `${n} ilhas, x mínimo`).toBeGreaterThanOrEqual(SAFE.x - 1);
        expect(Math.max(...xs), `${n} ilhas, x máximo`).toBeLessThanOrEqual(SAFE.x + SAFE.w + 1);
        for (const p of placements) {
          expect(p.c.y - p.w / 4, "topo").toBeGreaterThanOrEqual(SAFE.y - 1);
          expect(p.c.y + p.w / 4 + p.thickness, "base").toBeLessThanOrEqual(STAGE.h);
        }
      }
    }
  });

  it("poucas ilhas ocupam mais o palco (até o teto) e muitas encolhem", () => {
    expect(layoutScene(many(3)).scale).toBeGreaterThan(layoutScene(four()).scale);
    expect(layoutScene(many(1)).scale).toBe(MAX_SCALE);
    expect(layoutScene(many(9)).scale).toBeLessThan(0.7);
  });

  it("nenhuma ilha encosta noutra: o losango de uma não tem vértice dentro do da outra", () => {
    for (const n of [3, 4, 6, 9]) {
      const { placements } = layoutScene(many(n, 1));
      for (const a of placements) {
        for (const b of placements) {
          if (a === b) continue;
          for (const v of diamond(b.c, b.w)) expect(inDiamond(v, a.c, a.w), `${a.id} × ${b.id}`).toBe(false);
        }
      }
    }
  });

  it("é puro: a mesma entrada dá o mesmo layout", () => {
    expect(layoutScene(four(1))).toEqual(layoutScene(four(1)));
    expect(layoutScene(four(0)).placements[0]!.c).not.toEqual(layoutScene(four(2)).placements[0]!.c);
  });

  it("a escala da decoração segue a largura: 1 na largura de referência (300)", () => {
    const { placements } = layoutScene(four());
    for (const p of placements) expect(p.u).toBeCloseTo(p.w / 300, 9);
    void pt;
  });
});
