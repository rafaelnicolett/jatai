/**
 * islandArt.ts — a geometria de uma ilha e da sua decoração (F5.3): o bloco de
 * terra e grama, o ipê, a caixa da colônia com a entrada, o favo de mel e, na
 * ilha atual, o anexo em obra. Tudo em coordenadas do palco, derivado do
 * centro e da largura da ilha: a decoração é desenhada para a largura de
 * referência (300) e escala com `u = w / 300`.
 *
 * Também diz onde as abelhas voam e pousam (`anchors`). Puro e determinístico:
 * os tufos de grama e as pétalas vêm de uma semente do id da ilha, então a
 * mesma ilha é sempre a mesma.
 */
import type { IslandPlacement } from "./layout";
import { add, cube, diamond, hashSeed, inDiamond, pt, seeded, slab, strata, type Cube, type Pt, type Quad, type Slab } from "./projection";

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}
export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreeArt {
  trunk: Rect;
  canopy: Circle[];
  shade: Circle;
  highlight: Circle;
  shadow: Ellipse;
  petals: Circle[];
}

export interface AnnexArt {
  cube: Cube;
  /** Postes e cumeeira do andaime, tracejados. */
  scaffold: string;
}

export interface IslandAnchors {
  /** O canto da frente da caixa, no chão. */
  front: Pt;
  /** A entrada da colônia. */
  entrance: Pt;
  /** O voo em volta da caixa. */
  orbit: Ellipse;
  /** O voo largo, sobre a grama toda. */
  wide: Ellipse;
  /** O centro do voo parado perto da entrada. */
  hover: Pt;
  /** Onde o favo fica. */
  comb: Pt;
  /** Pontos de pouso na grama, na frente da entrada. */
  perches: Pt[];
  /** Onde a guarda acesa fica de pé. */
  guard: Pt;
  /** Embaixo-centro do rótulo da ilha. */
  label: Pt;
}

export interface IslandArt {
  slab: Slab;
  strata: Array<readonly [Pt, Pt, Pt]>;
  /** A sombra suave no chão. */
  shadow: Ellipse;
  /** O anel da seleção e do foco: o losango da grama, 12 px maior de cada lado. */
  ring: Quad;
  /** O alvo de clique: o retângulo da ilha. */
  hit: Rect;
  haze: Ellipse;
  tree: TreeArt;
  box: Cube;
  entrance: { outer: Ellipse; inner: Ellipse };
  /** Duas tábuas na face esquerda da caixa. */
  planks: Array<readonly [Pt, Pt]>;
  annex: AnnexArt | null;
  tufts: Pt[];
  /** Centro e raio das células do favo, e as posições, na ordem de preenchimento. */
  combSlots: Pt[];
  combRadius: number;
  anchors: IslandAnchors;
}

/** Quantas células o favo desenha, no máximo (o resto vira o número "+N"). */
export const MAX_COMB_CELLS = 12;

/** As células de um favo de mel em empacotamento hexagonal, do centro para fora (anel 1, anel 2…). */
export function hexSpiral(count: number, spacing: number, center: Pt): Pt[] {
  // Os seis vizinhos de uma célula, em coordenadas axiais (q, r).
  const dirs: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const cells: Array<[number, number]> = [[0, 0]];
  for (let ring = 1; cells.length < count; ring++) {
    // Cada anel começa no canto (-ring, +ring) e dá a volta, `ring` passos em cada uma das seis direções.
    let q = -ring;
    let r = ring;
    for (const [dq, dr] of dirs) {
      for (let step = 0; step < ring; step++) {
        cells.push([q, r]);
        q += dq;
        r += dr;
      }
    }
  }
  const row = Math.sqrt(3) / 2;
  return cells.slice(0, count).map(([q, r]) => pt(center.x + spacing * (q + r / 2), center.y + spacing * row * r));
}

const circle = (c: Pt, r: number): Circle => ({ cx: c.x, cy: c.y, r });
const ellipse = (c: Pt, rx: number, ry: number): Ellipse => ({ cx: c.x, cy: c.y, rx, ry });

/** Os tufos de grama: pontos dentro do losango, longe da árvore, da caixa, do favo e do anexo. */
function tufts(p: IslandPlacement, avoid: Array<{ at: Pt; r: number }>): Pt[] {
  const rand = seeded(hashSeed(p.id));
  const want = Math.max(6, Math.round(11 * p.u));
  const out: Pt[] = [];
  for (let tries = 0; out.length < want && tries < want * 40; tries++) {
    const candidate = pt(p.c.x + (rand() * 2 - 1) * p.w * 0.46, p.c.y + (rand() * 2 - 1) * p.w * 0.23);
    if (!inDiamond(candidate, p.c, p.w * 0.88)) continue;
    if (avoid.some((a) => Math.hypot(candidate.x - a.at.x, (candidate.y - a.at.y) * 1.6) < a.r)) continue;
    if (out.some((o) => Math.hypot(candidate.x - o.x, (candidate.y - o.y) * 1.6) < 22 * p.u)) continue;
    out.push(candidate);
  }
  return out;
}

export function islandArt(p: IslandPlacement, options: { annex: boolean }): IslandArt {
  const { c, w, u } = p;
  const at = (dx: number, dy: number): Pt => pt(c.x + dx * u, c.y + dy * u);
  const s = slab(c, w, p.thickness);

  // A árvore (ipê), atrás à esquerda.
  const base = at(-60, -15);
  const rand = seeded(hashSeed(`${p.id}:petalas`));
  const petals = Array.from({ length: 5 }, () => circle(pt(base.x + (rand() * 2 - 1) * 34 * u, base.y + (4 + rand() * 12) * u), (1.6 + rand() * 1.2) * u));
  const tree: TreeArt = {
    trunk: { x: base.x - 3 * u, y: base.y - 34 * u, w: 6 * u, h: 34 * u },
    canopy: [circle(add(base, pt(0, -44 * u)), 22 * u), circle(add(base, pt(-14 * u, -36 * u)), 15 * u), circle(add(base, pt(14 * u, -36 * u)), 16 * u)],
    shade: circle(add(base, pt(8 * u, -34 * u)), 14 * u),
    highlight: circle(add(base, pt(-6 * u, -52 * u)), 10 * u),
    shadow: ellipse(add(base, pt(10 * u, 2 * u)), 22 * u, 8 * u),
    petals,
  };

  // A caixa da colônia, no centro-direita, com a entrada na face direita.
  const front = at(18, 3);
  const box = cube(front, 30 * u, 36 * u, 4 * u, 5 * u);
  const entranceAt = add(front, pt(16 * u, -18 * u));
  const planks = [1 / 3, 2 / 3].map((f) => [add(box.left[0], pt(0, 36 * u * f)), add(box.left[1], pt(0, 36 * u * f))] as const);

  // O anexo em obra: só na ilha atual.
  let annex: AnnexArt | null = null;
  let annexAt: Pt | null = null;
  if (options.annex) {
    annexAt = at(74, 30);
    const a = cube(annexAt, 19 * u, 21 * u, 3 * u, 4 * u);
    const post = 25 * u;
    const scaffold = [
      `M${annexAt.x - post},${annexAt.y - 41 * u} L${annexAt.x - post},${annexAt.y - 5 * u}`,
      `M${annexAt.x + post},${annexAt.y - 41 * u} L${annexAt.x + post},${annexAt.y - 5 * u}`,
      `M${annexAt.x - post},${annexAt.y - 41 * u} L${annexAt.x},${annexAt.y - 54 * u} L${annexAt.x + post},${annexAt.y - 41 * u}`,
    ].join(" ");
    annex = { cube: a, scaffold };
  }

  // O favo: à direita da caixa; na ilha atual, à frente-esquerda, porque o anexo ocupa a direita.
  const combCenter = options.annex ? at(-22, 22) : at(60, 10);
  const combRadius = 7 * u;
  const combSlots = hexSpiral(MAX_COMB_CELLS, 15.5 * u, combCenter);

  const avoid = [
    { at: base, r: 34 * u },
    { at: add(front, pt(0, -14 * u)), r: 40 * u },
    { at: combCenter, r: 34 * u },
    ...(annexAt ? [{ at: annexAt, r: 38 * u }] : []),
  ];

  const hover = add(entranceAt, pt(0, -22 * u));
  const anchors: IslandAnchors = {
    front,
    entrance: entranceAt,
    orbit: ellipse(add(front, pt(0, -36 * u)), 58 * u, 25 * u),
    wide: ellipse(add(c, pt(0, -4 * u)), w * 0.3, w * 0.13),
    hover,
    comb: combCenter,
    perches: [pt(-24, 12), pt(-8, 20), pt(12, 22), pt(30, 14), pt(-38, 0), pt(44, -4)].map((d) => add(entranceAt, pt(d.x * u, d.y * u))),
    guard: add(entranceAt, pt(-4 * u, -20 * u)),
    label: pt(c.x, c.y - w / 4 - 30 * u),
  };

  return {
    slab: s,
    strata: strata(s, [0.45, 0.77]),
    shadow: ellipse(pt(c.x, c.y + w / 4 + p.thickness + 16 * u), w * 0.45, w * 0.085),
    ring: diamond(c, w + 24 * u),
    hit: { x: c.x - w / 2, y: c.y - w / 4 - 15 * u, w, h: w / 2 + p.thickness + 30 * u },
    haze: ellipse(pt(c.x, c.y + 6 * u), w * 0.57, w * 0.3),
    tree,
    box,
    entrance: { outer: ellipse(entranceAt, 6 * u, 4 * u), inner: ellipse(entranceAt, 3.5 * u, 2.4 * u) },
    planks,
    annex,
    tufts: tufts(p, avoid),
    combSlots,
    combRadius,
    anchors,
  };
}
