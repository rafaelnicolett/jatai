/**
 * beeRoutes.ts — por onde cada abelha voa (F5.3), em funções puras.
 *
 * Cada abelha de uma ilha recebe uma volta fechada entre as estações da
 * colônia: em volta da caixa, entre a entrada e a ponte, em saltos entre o
 * favo e a caixa, parada no ar perto da entrada, ou larga sobre a grama. A
 * volta é uma lista de quadros (posição e rumo) que a vista entrega ao
 * navegador como animação de `transform`: o voo roda no compositor, sem
 * relayout e sem JavaScript por quadro.
 *
 * O rumo acompanha a direção do voo (a abelha é desenhada de cabeça para
 * cima, então 0° é "indo para cima") e é contínuo ao longo da volta, para o
 * navegador não girar a abelha pelo lado longo quando o ângulo passa de 360°.
 */
import type { IslandAnchors } from "./islandArt";
import { lerp, mid, pt, sub, type Pt } from "./projection";

export type RouteKind = "orbit" | "shuttle" | "hop" | "hover" | "wide";

export interface RouteFrame {
  x: number;
  y: number;
  /** Rumo em graus, contínuo ao longo da volta. */
  rot: number;
}

export interface BeeRoute {
  kind: RouteKind;
  /** Uma volta fechada: o último quadro está no mesmo lugar do primeiro (e no mesmo rumo, a menos de uma volta inteira). */
  frames: RouteFrame[];
  /** Uma volta inteira, em ms. Protótipo: 1,4 s por salto (`--jt-dur-flight`). */
  duration: number;
  /** Atraso negativo em ms: as abelhas da mesma ilha não começam a volta juntas. */
  phase: number;
}

/** A ordem das voltas numa ilha: a primeira abelha orbita a caixa, a segunda vai e volta da ponte, e assim por diante. */
export const ROUTE_ORDER: readonly RouteKind[] = ["orbit", "shuttle", "hop", "hover", "wide", "orbit"];

/** Uma volta inteira de cada tipo, em ms (protótipo: a órbita dá a volta em cerca de 9,8 s; o salto leva 1,4 s). */
export const ROUTE_DURATION: Record<RouteKind, number> = { orbit: 9800, shuttle: 11000, hop: 5600, hover: 3200, wide: 15000 };

const SAMPLES: Record<RouteKind, number> = { orbit: 36, shuttle: 40, hop: 32, hover: 20, wide: 48 };

/** Os pontos de uma volta, sem rumo: `points[i]` para `i` em `0..n-1`, fechada (o seguinte do último é o primeiro). */
function loopPoints(kind: RouteKind, a: IslandAnchors, index: number, bridgeHead: Pt, u: number): Pt[] {
  const n = SAMPLES[kind];
  const dir = index % 2 === 0 ? 1 : -1;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const phi = 2 * Math.PI * t;
    switch (kind) {
      case "orbit": {
        // A segunda órbita (índice 5) é mais fechada, para não passar por cima da primeira.
        const k = index >= 5 ? 0.78 : 1;
        out.push(pt(a.orbit.cx + a.orbit.rx * k * Math.cos(dir * phi), a.orbit.cy + a.orbit.ry * k * Math.sin(dir * phi)));
        break;
      }
      case "wide":
        out.push(pt(a.wide.cx + a.wide.rx * Math.cos(-dir * phi), a.wide.cy + a.wide.ry * Math.sin(-dir * phi)));
        break;
      case "shuttle": {
        // Uma elipse esticada entre a entrada e a ponte: vai por um lado e volta pelo outro.
        const m = mid(a.entrance, bridgeHead);
        const half = sub(bridgeHead, a.entrance);
        const len = Math.hypot(half.x, half.y) || 1;
        const along = -Math.cos(phi);
        const side = Math.sin(phi) * Math.max(7 * u, len * 0.09);
        const nx = -half.y / len;
        const ny = half.x / len;
        out.push(pt(m.x + (half.x / 2) * along + nx * side, m.y + (half.y / 2) * along + ny * side));
        break;
      }
      case "hop": {
        // Dois saltos em arco: da caixa ao favo e de volta.
        const first = t < 0.5;
        const s = first ? t * 2 : (t - 0.5) * 2;
        const [from, to] = first ? [a.entrance, a.comb] : [a.comb, a.entrance];
        const p = lerp(from, to, s * s * (3 - 2 * s));
        out.push(pt(p.x, p.y - 16 * u * 4 * s * (1 - s)));
        break;
      }
      case "hover": {
        const r = 7 * u;
        out.push(pt(a.hover.x + r * Math.cos(dir * phi), a.hover.y + r * 0.6 * Math.sin(dir * phi)));
        break;
      }
    }
  }
  return out;
}

/** Normaliza um ângulo para (-180, 180]. */
const wrap180 = (deg: number): number => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** Rumo, em graus, de quem vai de `from` para `to` (cabeça para cima é 0°). */
const headingOf = (from: Pt, to: Pt): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90;

/**
 * A volta da abelha `index` da ilha: o tipo vem da ordem fixa, e o resto (o
 * rumo e o atraso) é derivado, sem sorteio, então a mesma abelha voa sempre
 * a mesma volta.
 */
export function planRoute(index: number, anchors: IslandAnchors, bridgeHead: Pt | null, u = 1): BeeRoute {
  const kind = ROUTE_ORDER[index % ROUTE_ORDER.length]!;
  const points = loopPoints(kind, anchors, index, bridgeHead ?? anchors.comb, u);
  const n = points.length;

  // Rumo de cada ponto pela diferença centrada; parado (diferença nula), mantém o anterior.
  const raw: number[] = [];
  let last = 0;
  for (let i = 0; i < n; i++) {
    const from = points[(i - 1 + n) % n]!;
    const to = points[(i + 1) % n]!;
    last = Math.hypot(to.x - from.x, to.y - from.y) < 1e-6 ? last : headingOf(from, to);
    raw.push(last);
  }
  // Contínuo ao longo da volta: cada rumo é o anterior mais a menor volta até ele.
  const unwrapped: number[] = [];
  raw.forEach((h, i) => unwrapped.push(i === 0 ? h : unwrapped[i - 1]! + wrap180(h - unwrapped[i - 1]!)));

  const frames: RouteFrame[] = points.map((p, i) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: Math.round(unwrapped[i]! * 10) / 10 }));
  // O quadro que fecha a volta: o primeiro ponto, com o rumo que continua o último.
  const closing = unwrapped[n - 1]! + wrap180(raw[0]! - unwrapped[n - 1]!);
  frames.push({ ...frames[0]!, rot: Math.round(closing * 10) / 10 });

  return { kind, frames, duration: ROUTE_DURATION[kind], phase: -index * 1900 };
}

/** O ponto de pouso da abelha `index` (parada, em pausa ou com movimento reduzido): os da ilha, em ordem. */
export const perchOf = (anchors: IslandAnchors, index: number): Pt => anchors.perches[index % anchors.perches.length]!;

/** O quadro como `transform` de uma abelha de `size` px: o centro da abelha vai para o ponto. */
export function frameTransform(frame: Pick<RouteFrame, "x" | "y" | "rot">, size: number): string {
  return `translate(${frame.x - size / 2}px, ${frame.y - size / 2}px) rotate(${frame.rot}deg)`;
}

/** Os quadros como `Keyframe[]` da Web Animations API, só com `transform`. */
export function keyframesOf(route: BeeRoute, size: number): Array<{ transform: string }> {
  return route.frames.map((f) => ({ transform: frameTransform(f, size) }));
}

/** Onde a volta começa: onde a abelha aparece ao entrar, antes de voar. */
export const startOf = (route: BeeRoute): Pt => pt(route.frames[0]!.x, route.frames[0]!.y);
