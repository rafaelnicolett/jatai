import { describe, it, expect } from "vitest";
import type { IslandState } from "@data";
import { ROUTE_DURATION, ROUTE_ORDER, frameTransform, keyframesOf, perchOf, planRoute, startOf } from "../src/apps/cockpit/map/beeRoutes";
import { islandArt } from "../src/apps/cockpit/map/islandArt";
import { layoutScene } from "../src/apps/cockpit/map/layout";
import { inDiamond, lerp } from "../src/apps/cockpit/map/projection";

/** Por onde as abelhas voam (F5.3): voltas fechadas, rumo contínuo, sempre sobre a ilha, e os pontos de pouso. */

const ISLANDS: Array<{ id: string; state: IslandState }> = [
  { id: "discovery", state: "done" },
  { id: "planning", state: "done" },
  { id: "execution", state: "current" },
  { id: "operation", state: "sleeping" },
];

function arts() {
  const layout = layoutScene(ISLANDS);
  return layout.placements.map((p) => ({ p, art: islandArt(p, { annex: p.state === "current" }) }));
}

describe("planRoute", () => {
  it("cada volta é fechada: o último quadro está no ponto do primeiro, e o rumo continua o do penúltimo", () => {
    for (const { p, art } of arts()) {
      for (let index = 0; index < ROUTE_ORDER.length; index++) {
        const route = planRoute(index, art.anchors, lerp(p.c, art.anchors.entrance, -1), p.u);
        const first = route.frames[0]!;
        const last = route.frames.at(-1)!;
        expect([last.x, last.y], `${p.id} #${index}`).toEqual([first.x, first.y]);
        // O rumo é contínuo: nunca salta mais que meia volta entre dois quadros (salvo a virada do salto, que é de 180°).
        for (let i = 1; i < route.frames.length; i++) {
          expect(Math.abs(route.frames[i]!.rot - route.frames[i - 1]!.rot), `${p.id} #${index} quadro ${i}`).toBeLessThanOrEqual(180.01);
        }
        // O rumo de fechamento difere do inicial por um múltiplo de 360°: visualmente é o mesmo.
        const turn = (((last.rot - first.rot) % 360) + 360) % 360;
        expect(Math.min(turn, 360 - turn), `${p.id} #${index} fechamento`).toBeLessThan(1);
      }
    }
  });

  it("a ordem das voltas: a primeira abelha orbita a caixa, a segunda vai e volta da ponte, a terceira salta ao favo", () => {
    expect(ROUTE_ORDER.slice(0, 3)).toEqual(["orbit", "shuttle", "hop"]);
    const [{ p, art }] = arts();
    expect(planRoute(0, art.anchors, null, p.u).kind).toBe("orbit");
    expect(planRoute(1, art.anchors, null, p.u).kind).toBe("shuttle");
    expect(planRoute(2, art.anchors, null, p.u).kind).toBe("hop");
    expect(planRoute(ROUTE_ORDER.length, art.anchors, null, p.u).kind).toBe("orbit");
  });

  it("toda volta passa sobre a ilha: nenhum quadro sai do losango de grama (com folga de 12%)", () => {
    for (const { p, art } of arts()) {
      for (let index = 0; index < ROUTE_ORDER.length; index++) {
        const bridgeHead = lerp(p.c, art.anchors.entrance, 0.5);
        const route = planRoute(index, art.anchors, bridgeHead, p.u);
        for (const f of route.frames) expect(inDiamond({ x: f.x, y: f.y }, p.c, p.w * 1.12), `${p.id} #${index} (${f.x}, ${f.y})`).toBe(true);
      }
    }
  });

  it("os pontos de pouso ficam sobre a grama, na frente da entrada, e são seis diferentes", () => {
    for (const { p, art } of arts()) {
      const perches = Array.from({ length: 6 }, (_, i) => perchOf(art.anchors, i));
      for (const perch of perches) expect(inDiamond(perch, p.c, p.w), `${p.id} pouso`).toBe(true);
      expect(new Set(perches.map((q) => `${q.x},${q.y}`)).size).toBe(6);
      expect(perchOf(art.anchors, 6)).toEqual(perches[0]);
    }
  });

  it("é determinística: a mesma abelha voa sempre a mesma volta, e as abelhas da ilha começam defasadas", () => {
    const [{ p, art }] = arts();
    expect(planRoute(2, art.anchors, null, p.u)).toEqual(planRoute(2, art.anchors, null, p.u));
    const phases = [0, 1, 2, 3].map((i) => planRoute(i, art.anchors, null, p.u).phase);
    expect(new Set(phases).size).toBe(4);
    expect(phases.every((n) => n <= 0)).toBe(true);
  });

  it("a duração de cada volta é a do tipo (o protótipo orbita em cerca de 9,8 s)", () => {
    const [{ p, art }] = arts();
    for (const [index, kind] of ROUTE_ORDER.entries()) expect(planRoute(index, art.anchors, null, p.u).duration).toBe(ROUTE_DURATION[kind]);
    expect(ROUTE_DURATION.orbit).toBe(9800);
  });

  it("o quadro vira só `transform` (translate e rotate): é o que o compositor anima sem relayout", () => {
    const [{ p, art }] = arts();
    const route = planRoute(0, art.anchors, null, p.u);
    const keyframes = keyframesOf(route, 24);
    expect(keyframes).toHaveLength(route.frames.length);
    for (const k of keyframes) expect(Object.keys(k)).toEqual(["transform"]);
    expect(frameTransform({ x: 100, y: 50, rot: 30 }, 24)).toBe("translate(88px, 38px) rotate(30deg)");
    expect(startOf(route)).toEqual({ x: route.frames[0]!.x, y: route.frames[0]!.y });
  });
});
