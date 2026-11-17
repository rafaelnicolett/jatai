import { describe, it, expect } from "vitest";
import { AXIS, FACING, cube, diamond, edgeEnds, edgeMid, hashSeed, inDiamond, pathOf, pt, r1, seeded, slab, strata, toGrid, toScreen } from "../src/apps/cockpit/map/projection";

/** A matemática isométrica do mapa (F5.3): funções puras, conferidas contra os números do protótipo aprovado (Mapa.dc.html). */

describe("projeção isométrica 2:1", () => {
  it("o losango do chão tem o dobro da largura da altura, e os vértices do protótipo da Descoberta", () => {
    const d = diamond(pt(300, 560), 300);
    expect(d).toEqual([pt(300, 485), pt(450, 560), pt(300, 635), pt(150, 560)]);
    const [top, right, bottom, left] = d;
    expect(right.x - left.x).toBe(2 * (bottom.y - top.y));
  });

  it("andar um passo de grade em x leva 2:1 para sudeste, e em y para nordeste; toGrid desfaz toScreen", () => {
    const origin = pt(100, 100);
    const a = toScreen(0, 0, 10, origin);
    expect(toScreen(1, 0, 10, origin)).toEqual(pt(a.x + 10, a.y + 5));
    expect(toScreen(0, 1, 10, origin)).toEqual(pt(a.x + 10, a.y - 5));
    for (const [gx, gy] of [[3, 2], [-1.5, 4], [0, 0], [7, -3]] as const) {
      const g = toGrid(toScreen(gx, gy, 12.5, origin), 12.5, origin);
      expect(g.gx).toBeCloseTo(gx, 9);
      expect(g.gy).toBeCloseTo(gy, 9);
    }
    expect(AXIS.NE).toEqual(pt(2, -1));
    expect(AXIS.SE).toEqual(pt(2, 1));
  });

  it("inDiamond: o centro e os vértices estão dentro, o canto da caixa envolvente fica fora", () => {
    const c = pt(300, 560);
    for (const p of [c, ...diamond(c, 300)]) expect(inDiamond(p, c, 300)).toBe(true);
    expect(inDiamond(pt(c.x + 140, c.y + 70), c, 300)).toBe(false);
    expect(inDiamond(pt(c.x + 75, c.y + 37), c, 300)).toBe(true);
  });

  it("as arestas: NE do topo à direita, SE da direita à base, SW da base à esquerda, NW da esquerda ao topo", () => {
    const d = diamond(pt(0, 0), 200);
    expect(edgeEnds(d, "NE")).toEqual([d[0], d[1]]);
    expect(edgeEnds(d, "SE")).toEqual([d[1], d[2]]);
    expect(edgeEnds(d, "SW")).toEqual([d[2], d[3]]);
    expect(edgeEnds(d, "NW")).toEqual([d[3], d[0]]);
  });

  it("o meio das arestas que se olham dá os pontos de ponte do protótipo (Descoberta → Planejamento e Planejamento → Execução)", () => {
    const desc = diamond(pt(300, 560), 300);
    const plan = diamond(pt(600, 410), 280);
    expect(edgeMid(desc, FACING.NE[0])).toEqual(pt(375, 522.5));
    expect(edgeMid(plan, FACING.NE[1])).toEqual(pt(530, 445));
    const exe = diamond(pt(920, 570), 420);
    expect(edgeMid(plan, FACING.SE[0])).toEqual(pt(670, 445));
    expect(edgeMid(exe, FACING.SE[1])).toEqual(pt(815, 517.5));
  });

  it("o bloco da ilha: duas faces de terra com a espessura do protótipo e a borda da frente", () => {
    const s = slab(pt(300, 560), 300, 60);
    expect(s.left).toEqual([pt(150, 560), pt(300, 635), pt(300, 695), pt(150, 620)]);
    expect(s.right).toEqual([pt(450, 560), pt(300, 635), pt(300, 695), pt(450, 620)]);
    expect(s.lip).toEqual([pt(150, 560), pt(300, 635), pt(450, 560)]);
    expect(strata(s, [0.45])[0]).toEqual([pt(150, 587), pt(300, 662), pt(450, 587)]);
  });

  it("a caixa da colônia do protótipo: faces, telhado com beiral e borda", () => {
    const c = cube(pt(318, 563), 30, 36, 4, 5);
    expect(c.left).toEqual([pt(288, 512), pt(318, 527), pt(318, 563), pt(288, 548)]);
    expect(c.right).toEqual([pt(348, 512), pt(318, 527), pt(318, 563), pt(348, 548)]);
    expect(c.roof).toEqual([pt(318, 491), pt(352, 508), pt(318, 525), pt(284, 508)]);
    expect(c.rim).toEqual([pt(284, 508), pt(318, 525), pt(352, 508), pt(352, 513), pt(318, 530), pt(284, 513)]);
  });

  it("pathOf escreve o caminho SVG com uma casa decimal e fecha quando pedido", () => {
    expect(pathOf([pt(1, 2), pt(3.04, 4.96)])).toBe("M1,2 L3,5 Z");
    expect(pathOf([pt(1, 2), pt(3, 4)], false)).toBe("M1,2 L3,4");
    expect(r1(2.345)).toBe(2.3);
  });

  it("a semente: a mesma entrada dá a mesma sequência, em [0, 1), e textos diferentes dão sementes diferentes", () => {
    const a = seeded(hashSeed("execution"));
    const b = seeded(hashSeed("execution"));
    const seq = Array.from({ length: 6 }, () => a());
    expect(seq).toEqual(Array.from({ length: 6 }, () => b()));
    expect(seq.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(hashSeed("discovery")).not.toBe(hashSeed("planning"));
  });
});
