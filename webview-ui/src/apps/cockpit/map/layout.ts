/**
 * layout.ts — onde cada ilha e cada ponte ficam no palco (F5.3).
 *
 * As ilhas andam numa escada pelos dois eixos do piso, uma de cada vez:
 * a primeira liga à segunda pelo eixo `NE`, a segunda à terceira por `SE`, e
 * assim por diante, como no protótipo aprovado (Mapa.dc.html). A ponte nasce
 * no meio da aresta de uma ilha que olha para a outra e termina no meio da
 * aresta da outra. A ilha atual é a maior; a adormecida, a menor.
 *
 * O layout é o mesmo para 3 ou 9 ilhas (um hotfix ou um fluxo por épicos):
 * o conjunto inteiro é medido e escalado para caber na faixa segura do palco,
 * e todas as medidas derivadas (decoração, ponte, sombra) seguem a largura
 * da ilha, então a cena toda escala junto. Puro: mesma entrada, mesma saída.
 */
import type { IslandState } from "@data";
import { AXIS, FACING, add, diamond, edgeMid, mul, pt, type Axis, type Pt } from "./projection";

/** O palco em que a cena é desenhada; a vista o escala para caber (`contain`). */
export const STAGE = { w: 1440, h: 900 } as const;

/** A faixa do palco para as ilhas: o cabeçalho fica acima e o feed e a legenda abaixo e ao lado. */
export const SAFE = { x: 70, y: 235, w: 1300, h: 535 } as const;

/** Largura do losango por estado: a atual é a maior, a adormecida a menor (protótipo: 420, 300/280, 260). */
export const ISLAND_WIDTH: Record<IslandState, number> = { current: 420, done: 292, sleeping: 270 };

/** Largura de referência do desenho da ilha: a decoração é desenhada para 300 e escala com `u = w / 300`. */
export const REFERENCE_WIDTH = 300;

/** Comprimento da ponte entre duas ilhas, em passos de eixo (protótipo: 65 a 77). */
export const BRIDGE_LENGTH = 72;

/** Meia-largura do tabuleiro, em passos de eixo (o protótipo tem 9 px em x). */
export const BRIDGE_HALF_WIDTH = 4.5;

/** Sobe a cena até este fator quando há poucas ilhas, para ela não parecer perdida no palco. */
export const MAX_SCALE = 1.25;

/** Espaço reservado acima da ilha para o rótulo (HUD) e a copa da árvore. */
const HEADROOM = 70;
/** Espaço abaixo da ilha para a sombra no chão. */
const FLOOR = 24;

export interface IslandPlacement {
  id: string;
  index: number;
  state: IslandState;
  /** Centro do losango de grama. */
  c: Pt;
  /** Largura do losango. */
  w: number;
  /** Espessura da terra. */
  thickness: number;
  /** Escala da decoração: 1 para a largura de referência. */
  u: number;
}

export interface BridgePlacement {
  from: string;
  to: string;
  axis: Axis;
  /** Meio da aresta da ilha de origem que olha para a de destino. */
  a: Pt;
  /** Meio da aresta da ilha de destino que olha de volta. */
  b: Pt;
  /** Meia-largura do tabuleiro, como vetor (perpendicular ao sentido da ponte). */
  e: Pt;
}

export interface SceneLayout {
  placements: IslandPlacement[];
  bridges: BridgePlacement[];
  /** Fator aplicado ao conjunto para caber na faixa segura. */
  scale: number;
}

/** Espessura da terra: um quinto da largura, até 350 (protótipo: 300 dá 60, 420 dá 70). */
export const thicknessFor = (w: number): number => Math.round(Math.min(w, 350) * 0.2);

/** O eixo da ligação entre a ilha `i` e a `i + 1`: `NE`, `SE`, `NE`… */
export const axisOfLink = (i: number): Axis => (i % 2 === 0 ? "NE" : "SE");

const PERPENDICULAR: Record<Axis, Axis> = { NE: "SE", SE: "NE" };

interface Raw {
  id: string;
  state: IslandState;
  c: Pt;
  w: number;
}

/** O conjunto em coordenadas cruas (sem escala nem deslocamento): a primeira ilha na origem. */
function rawPlacements(islands: ReadonlyArray<{ id: string; state: IslandState }>): Raw[] {
  const out: Raw[] = [];
  islands.forEach((island, i) => {
    const w = ISLAND_WIDTH[island.state];
    if (i === 0) {
      out.push({ ...island, c: pt(0, 0), w });
      return;
    }
    const prev = out[i - 1]!;
    // Centro a centro: meia aresta da anterior, a ponte e meia aresta desta, no eixo da ligação.
    const step = prev.w / 8 + BRIDGE_LENGTH + w / 8;
    out.push({ ...island, c: add(prev.c, mul(AXIS[axisOfLink(i - 1)], step)), w });
  });
  return out;
}

/** Caixa que o conjunto ocupa, com o espaço do rótulo em cima e da sombra embaixo. */
function bounds(raw: Raw[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of raw) {
    const t = thicknessFor(r.w);
    minX = Math.min(minX, r.c.x - r.w / 2);
    maxX = Math.max(maxX, r.c.x + r.w / 2);
    minY = Math.min(minY, r.c.y - r.w / 4 - HEADROOM);
    maxY = Math.max(maxY, r.c.y + r.w / 4 + t + FLOOR);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Coloca as ilhas no palco, na ordem do fluxo, e liga cada uma à seguinte.
 * Zero ilhas dão um layout vazio; uma ilha só não tem ponte.
 */
export function layoutScene(islands: ReadonlyArray<{ id: string; state: IslandState }>): SceneLayout {
  if (islands.length === 0) return { placements: [], bridges: [], scale: 1 };
  const raw = rawPlacements(islands);
  const box = bounds(raw);
  const scale = Math.min(MAX_SCALE, SAFE.w / (box.maxX - box.minX), SAFE.h / (box.maxY - box.minY));
  // O centro da caixa vai para o centro da faixa segura.
  const shift = pt(SAFE.x + SAFE.w / 2 - ((box.minX + box.maxX) / 2) * scale, SAFE.y + SAFE.h / 2 - ((box.minY + box.maxY) / 2) * scale);

  const placements = raw.map((r, index): IslandPlacement => {
    const w = r.w * scale;
    return { id: r.id, index, state: r.state, c: add(mul(r.c, scale), shift), w, thickness: thicknessFor(r.w) * scale, u: w / REFERENCE_WIDTH };
  });

  const bridges: BridgePlacement[] = [];
  for (let i = 0; i + 1 < placements.length; i++) {
    const from = placements[i]!;
    const to = placements[i + 1]!;
    const axis = axisOfLink(i);
    const [edgeFrom, edgeTo] = FACING[axis];
    bridges.push({
      from: from.id,
      to: to.id,
      axis,
      a: edgeMid(diamond(from.c, from.w), edgeFrom),
      b: edgeMid(diamond(to.c, to.w), edgeTo),
      e: mul(AXIS[PERPENDICULAR[axis]], BRIDGE_HALF_WIDTH * scale),
    });
  }
  return { placements, bridges, scale };
}
