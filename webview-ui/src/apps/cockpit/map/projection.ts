/**
 * projection.ts — a matemática isométrica do mapa da colmeia (F5.3, ADR-0020),
 * em funções puras. Projeção 2:1 de jogo: o losango do chão tem o dobro da
 * largura da altura, e os dois eixos do piso andam de 2 px em x para 1 em y.
 *
 * Tudo aqui trabalha em coordenadas do palco (1440 × 900), com o y para baixo.
 * Nada desenha: o `islandArt`, o `layout` e o `sceneModel` usam estas peças
 * para montar a cena, e os testes conferem as propriedades da projeção.
 */

export interface Pt {
  x: number;
  y: number;
}

export const pt = (x: number, y: number): Pt => ({ x, y });
export const add = (a: Pt, b: Pt): Pt => pt(a.x + b.x, a.y + b.y);
export const sub = (a: Pt, b: Pt): Pt => pt(a.x - b.x, a.y - b.y);
export const mul = (a: Pt, k: number): Pt => pt(a.x * k, a.y * k);
export const lerp = (a: Pt, b: Pt, t: number): Pt => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5);
export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Uma casa decimal: o suficiente para o SVG e estável para comparar em teste. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

export type Quad = readonly [Pt, Pt, Pt, Pt];

/** Largura do losango dividida pela altura: 2:1. */
export const TILE_RATIO = 2;

/**
 * Os dois eixos do piso, em passos de x e y. Andar na direção `NE` sobe um
 * passo a cada dois de x; `SE` desce. São as direções em que as ilhas e as
 * pontes se ligam.
 */
export const AXIS = { NE: pt(2, -1), SE: pt(2, 1) } as const;
export type Axis = keyof typeof AXIS;

/** O losango do chão de largura `w` centrado em `c`: topo, direita, base, esquerda. */
export function diamond(c: Pt, w: number): Quad {
  const hw = w / 2;
  const hh = w / TILE_RATIO / 2;
  return [pt(c.x, c.y - hh), pt(c.x + hw, c.y), pt(c.x, c.y + hh), pt(c.x - hw, c.y)];
}

/** Aresta do losango: `NE` do topo à direita, `SE` da direita à base, `SW` da base à esquerda, `NW` da esquerda ao topo. */
export type Edge = "NE" | "SE" | "SW" | "NW";

export function edgeEnds(d: Quad, edge: Edge): [Pt, Pt] {
  const [top, right, bottom, left] = d;
  switch (edge) {
    case "NE": return [top, right];
    case "SE": return [right, bottom];
    case "SW": return [bottom, left];
    case "NW": return [left, top];
  }
}

export const edgeMid = (d: Quad, edge: Edge): Pt => mid(...edgeEnds(d, edge));

/** A aresta de `A` que olha para `B` quando `B` fica no sentido de `axis`, e a de `B` que olha de volta. */
export const FACING: Record<Axis, [Edge, Edge]> = { NE: ["NE", "SW"], SE: ["SE", "NW"] };

/** Ponto em coordenadas de grade (gx para o leste-sudeste, gy para o leste-nordeste) projetado no palco. */
export function toScreen(gx: number, gy: number, unit: number, origin: Pt = pt(0, 0)): Pt {
  return pt(origin.x + (gx + gy) * unit, origin.y + (gx - gy) * (unit / TILE_RATIO));
}

/** O inverso de `toScreen`, no plano do chão. */
export function toGrid(p: Pt, unit: number, origin: Pt = pt(0, 0)): { gx: number; gy: number } {
  const sx = (p.x - origin.x) / unit;
  const sy = ((p.y - origin.y) * TILE_RATIO) / unit;
  return { gx: (sx + sy) / 2, gy: (sx - sy) / 2 };
}

/** O ponto está dentro do losango de largura `w` centrado em `c` (borda inclusa)? */
export function inDiamond(p: Pt, c: Pt, w: number): boolean {
  const hw = w / 2;
  const hh = w / TILE_RATIO / 2;
  return Math.abs(p.x - c.x) / hw + Math.abs(p.y - c.y) / hh <= 1 + 1e-9;
}

/** Os pontos como caminho SVG: `M x,y L x,y … Z`. */
export function pathOf(points: readonly Pt[], close = true): string {
  const body = points.map((p, i) => `${i === 0 ? "M" : "L"}${r1(p.x)},${r1(p.y)}`).join(" ");
  return close ? `${body} Z` : body;
}

export interface Slab {
  top: Quad;
  /** Face da esquerda: esquerda, base, base mais a espessura, esquerda mais a espessura. */
  left: Quad;
  /** Face da direita: direita, base, base mais a espessura, direita mais a espessura. */
  right: Quad;
  /** A aresta da frente da grama (esquerda, base, direita), onde fica a borda. */
  lip: readonly [Pt, Pt, Pt];
  thickness: number;
}

/** O bloco de uma ilha: o topo de grama e as duas faces de terra. */
export function slab(c: Pt, w: number, thickness: number): Slab {
  const top = diamond(c, w);
  const [, right, bottom, left] = top;
  const down = pt(0, thickness);
  return {
    top,
    left: [left, bottom, add(bottom, down), add(left, down)],
    right: [right, bottom, add(bottom, down), add(right, down)],
    lip: [left, bottom, right],
    thickness,
  };
}

/** Linhas de estrato da terra a `fractions` da espessura: esquerda, base, direita. */
export function strata(s: Slab, fractions: readonly number[]): Array<readonly [Pt, Pt, Pt]> {
  return fractions.map((f) => {
    const d = pt(0, s.thickness * f);
    return [add(s.lip[0], d), add(s.lip[1], d), add(s.lip[2], d)] as const;
  });
}

export interface Cube {
  left: Quad;
  right: Quad;
  /** O telhado: o losango acima, com o beiral. */
  roof: Quad;
  /** A borda da frente do telhado (esquerda, base, direita, e as três espessas 5 px abaixo). */
  rim: readonly [Pt, Pt, Pt, Pt, Pt, Pt];
  /** O ponto do chão onde fica o canto da frente. */
  front: Pt;
}

/**
 * Uma caixa no chão: o canto da frente em `front`, meia-largura `half` em x e
 * altura `h`. Os dois lados seguem os eixos do piso; o telhado tem um beiral
 * de `overhang`. É a caixa da colônia (a de abelha sem ferrão).
 */
export function cube(front: Pt, half: number, h: number, overhang = 4, rimDepth = 5): Cube {
  const slope = half / TILE_RATIO;
  const topFront = pt(front.x, front.y - h);
  const left: Quad = [pt(front.x - half, front.y - slope - h), topFront, front, pt(front.x - half, front.y - slope)];
  const right: Quad = [pt(front.x + half, front.y - slope - h), topFront, front, pt(front.x + half, front.y - slope)];
  const roof = diamond(pt(front.x, front.y - h - slope - overhang), (half + overhang) * 2);
  const [, rRight, rBottom, rLeft] = roof;
  const drop = pt(0, rimDepth);
  return { left, right, roof, rim: [rLeft, rBottom, rRight, add(rRight, drop), add(rBottom, drop), add(rLeft, drop)], front };
}

/** Geradora pseudoaleatória pequena e estável (mulberry32): a mesma semente dá a mesma cena. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente a partir de um texto (id de ilha, chave de abelha). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
