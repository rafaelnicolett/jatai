/**
 * sceneModel.ts — do `ColmeiaVM` ao que a cena desenha (F5.3), em função pura.
 *
 * `buildScene(vm, details)` junta o que o núcleo já derivou (ilhas, pontes,
 * abelhas, guardas, potes) com o layout e a decoração: onde cada coisa fica,
 * o que cada rótulo diz, por onde cada abelha voa e onde ela pousa. Nenhuma
 * regra de negócio mora na vista: tudo o que ela mostra sai deste modelo, e
 * o mesmo `ColmeiaVM` dá sempre a mesma cena.
 *
 * O que é decisão de apresentação e fica aqui, sem inventar estado (R2):
 * quantas abelhas cabem por ilha (as outras viram "+N"), o cacho do favo,
 * a cor do ipê de cada stream, e a ponte entre ondas de um hotfix (que o
 * núcleo não tem como gate): ela só liga as ilhas, em tabuleiro quando a
 * onda seguinte já começou e tracejada antes.
 */
import type { ColmeiaBee, ColmeiaGuard, ColmeiaVM, IslandDetail } from "@data";
import { describeWorkStatus } from "../../../design-system/status/workStatus";
import { beeCondition, countsOf, guardChip, islandAriaLabel, islandMeta, type IslandCounts } from "./copy";
import { planRoute, perchOf, type BeeRoute } from "./beeRoutes";
import { islandArt, MAX_COMB_CELLS, type IslandArt } from "./islandArt";
import { layoutScene, STAGE, type BridgePlacement, type IslandPlacement } from "./layout";
import { add, lerp, mid, pt, sub, type Pt } from "./projection";

/** Quantas abelhas uma ilha desenha; as outras viram o chip "+N" (DS v2 §4.8). */
export const MAX_BEES_PER_ISLAND = 6;

/**
 * Até quantas abelhas voando as asas batem. Cada abelha anima uma volta (no
 * compositor) e, batendo asas, mais um nó (o navegador anima filho de SVG fora
 * do compositor, com estilo e layout a cada quadro). Acima disto as asas ficam
 * abertas e o voo continua: o total de nós animados nunca passa de
 * `FLAP_LIMIT * 2 + 1` (41), abaixo dos 60 do orçamento, em qualquer quantidade.
 */
export const FLAP_LIMIT = 20;

export type TreeKey = "roxo" | "rosa" | "amarelo" | "branco";

const TREE_BY_ID: Record<string, TreeKey> = { discovery: "roxo", planning: "rosa", execution: "amarelo", operation: "branco", upstream: "roxo", downstream: "amarelo" };
const TREE_CYCLE: readonly TreeKey[] = ["roxo", "rosa", "amarelo", "branco"];

export interface SceneComb {
  key: string;
  at: Pt;
  filled: boolean;
  /** Caminho da evidência, nos favos cheios. */
  path?: string;
}

export interface SceneIsland {
  id: string;
  label: string;
  index: number;
  state: IslandDetail["state"];
  placement: IslandPlacement;
  art: IslandArt;
  tree: TreeKey;
  meta: { text: string; tone: "done" | "working" | "queue" | "future" };
  /** "■ 1 espera você", e o bloqueio e a falha em texto: o rótulo nunca depende só da cor. */
  chips: Array<{ tone: "you" | "blocked"; glyph: "you" | "blocked" | "failed"; text: string }>;
  ariaLabel: string;
  combs: SceneComb[];
  /** Entregas além das células do favo: o "+N". */
  combOverflow: number;
  counts: IslandCounts;
  /** Há guarda acesa na ilha (decisão ou aprovação esperando a pessoa). */
  lit: { count: number; reasons: string[]; at: Pt } | null;
}

export interface BridgeArt {
  deck: [Pt, Pt, Pt, Pt];
  plank: [Pt, Pt];
  rails: Array<[Pt, Pt]>;
  posts: Array<[Pt, Pt]>;
}

export interface SceneBridge {
  key: string;
  from: string;
  to: string;
  /** A chave do gate (D1…); ausente na ponte entre ondas de um hotfix. */
  gate?: string;
  state: "approved" | "unbuilt";
  placement: BridgePlacement;
  art: BridgeArt;
  center: Pt;
  chip: { text: string; tone: "done" | "future"; at: Pt } | null;
  /** O guarda do gate: de pé e tranquilo na ponte aprovada, dormindo na por construir. */
  guard: { at: Pt; posture: "rest" | "asleep" } | null;
}

export interface SceneBee {
  key: string;
  islandId: string;
  agentId: string | null;
  index: number;
  size: number;
  condition: "working" | "blocked" | "failed";
  /** A volta; `null` quando a abelha para (bloqueada ou com falha). */
  route: BeeRoute | null;
  /** Onde ela pousa: parada, em pausa ou com movimento reduzido. */
  perch: Pt;
  /** O motivo em texto, nas abelhas paradas. */
  tag: { glyph: "blocked" | "failed"; text: string } | null;
}

export interface SceneOverflow {
  islandId: string;
  count: number;
  at: Pt;
}

export interface SceneModel {
  stage: typeof STAGE;
  initiativeId: string | null;
  empty: ColmeiaVM["empty"] | null;
  scale: number;
  islands: SceneIsland[];
  bridges: SceneBridge[];
  bees: SceneBee[];
  overflow: SceneOverflow[];
  /** Quantas abelhas voam (as que têm volta): é o que o orçamento de animação conta. */
  flying: number;
}

export interface SceneOptions {
  /** Abelhas desenhadas por ilha. Padrão `MAX_BEES_PER_ISLAND`. */
  maxBeesPerIsland?: number;
}

const treeOf = (id: string, index: number): TreeKey => TREE_BY_ID[id] ?? TREE_CYCLE[index % TREE_CYCLE.length]!;

/** Tamanho da abelha: 24, 22 e 20 px como no protótipo, mais para a ilha grande, nunca além de 32 px (DS v2 §3.11). */
const beeSize = (index: number, u: number): number => Math.min(32, Math.round((24 - Math.min(index, 2) * 2) * Math.max(0.9, Math.min(u, 1.3))));

/** A ponte desenhada: tabuleiro, tábua, corrimãos e postes, a partir dos meios das arestas. */
export function bridgeArt(b: BridgePlacement, scale: number): BridgeArt {
  const up = pt(0, -12 * scale);
  const { a, b: to, e } = b;
  const a1 = sub(a, e);
  const a2 = add(a, e);
  const b1 = sub(to, e);
  const b2 = add(to, e);
  const m1 = mid(a1, b1);
  const m2 = mid(a2, b2);
  return {
    deck: [a1, b1, b2, a2],
    plank: [a, to],
    rails: [[add(a1, up), add(b1, up)], [add(a2, up), add(b2, up)]],
    posts: [a1, b1, a2, b2, m1, m2].map((p): [Pt, Pt] => [p, add(p, up)]),
  };
}

/** Abelhas de uma ilha na ordem de importância: as paradas primeiro, depois as mais antigas. */
function orderedBees(bees: ColmeiaBee[]): ColmeiaBee[] {
  return bees
    .map((bee, i) => ({ bee, i }))
    .sort((x, y) => Number(y.bee.state === "blocked") - Number(x.bee.state === "blocked") || (x.bee.since ?? "").localeCompare(y.bee.since ?? "") || x.i - y.i)
    .map((x) => x.bee);
}

const beeKey = (bee: ColmeiaBee): string => `${bee.agentId ?? "estado"}|${bee.taskId ?? bee.phaseId ?? "-"}|${bee.islandId}`;

function combsOf(art: IslandArt, detail: IslandDetail): { combs: SceneComb[]; overflow: number } {
  const filled = detail.pots.slice(0, MAX_COMB_CELLS);
  const room = Math.max(0, MAX_COMB_CELLS - filled.length);
  const combs: SceneComb[] = [
    ...filled.map((p, i): SceneComb => ({ key: p.artifactPath, at: art.combSlots[i]!, filled: true, path: p.artifactPath })),
    ...Array.from({ length: Math.min(detail.plannedPots, room) }, (_, i): SceneComb => ({ key: `por-vir-${i}`, at: art.combSlots[filled.length + i]!, filled: false })),
  ];
  return { combs, overflow: Math.max(0, detail.pots.length - MAX_COMB_CELLS) };
}

function litOf(art: IslandArt, guards: ColmeiaGuard[]): SceneIsland["lit"] {
  return guards.length === 0 ? null : { count: guards.length, reasons: guards.map((g) => g.reason), at: art.anchors.guard };
}

const EMPTY_SCENE = (vm: ColmeiaVM): SceneModel => ({ stage: STAGE, initiativeId: vm.initiativeId, empty: vm.empty ?? null, scale: 1, islands: [], bridges: [], bees: [], overflow: [], flying: 0 });

/** A cena de uma iniciativa. `details` tem uma entrada por ilha do `vm`, na mesma ordem (`deriveIslandDetails`). */
export function buildScene(vm: ColmeiaVM, details: IslandDetail[], options: SceneOptions = {}): SceneModel {
  if (vm.islands.length === 0) return EMPTY_SCENE(vm);
  const maxBees = options.maxBeesPerIsland ?? MAX_BEES_PER_ISLAND;
  const layout = layoutScene(vm.islands.map((i) => ({ id: i.id, state: i.state })));
  const detailOf = new Map(details.map((d) => [d.islandId, d]));

  const islands = vm.islands.map((island, index): SceneIsland => {
    const placement = layout.placements[index]!;
    const detail = detailOf.get(island.id)!;
    const art = islandArt(placement, { annex: island.state === "current" });
    const counts = countsOf(detail);
    const gateAfter = vm.bridges.find((b) => b.from === island.id);
    const { combs, overflow } = combsOf(art, detail);
    const chips: SceneIsland["chips"] = [];
    if (counts.guards > 0) chips.push({ tone: "you", glyph: "you", text: guardChip(counts.guards) });
    if (counts.blocked > 0) chips.push({ tone: "blocked", glyph: "blocked", text: counts.blocked === 1 ? "1 bloqueada" : `${counts.blocked} bloqueadas` });
    if (counts.failed > 0) chips.push({ tone: "blocked", glyph: "failed", text: counts.failed === 1 ? "1 falhou" : `${counts.failed} falharam` });
    return {
      id: island.id,
      label: island.label,
      index,
      state: island.state,
      placement,
      art,
      tree: treeOf(island.id, index),
      meta: islandMeta(island.state, counts, island.wakesAfterGate),
      chips,
      ariaLabel: islandAriaLabel(detail, counts, gateAfter),
      combs,
      combOverflow: overflow,
      counts,
      lit: litOf(art, detail.guards),
    };
  });
  const byId = new Map(islands.map((i) => [i.id, i]));

  const bridges = layout.bridges.map((placement): SceneBridge => {
    const gate = vm.bridges.find((b) => b.from === placement.from && b.to === placement.to);
    const to = byId.get(placement.to)!;
    // Sem gate no núcleo (as ondas de um hotfix), a ponte só liga: construída quando a seguinte já começou.
    const state = gate ? gate.state : to.state === "sleeping" ? "unbuilt" : "approved";
    const center = mid(placement.a, placement.b);
    const art = bridgeArt(placement, layout.scale);
    return {
      key: `${placement.from}>${placement.to}`,
      from: placement.from,
      to: placement.to,
      ...(gate ? { gate: gate.gate } : {}),
      state,
      placement,
      art,
      center,
      chip: gate ? { text: state === "approved" ? `${gate.gate} ✓` : `${gate.gate}`, tone: state === "approved" ? "done" : "future", at: add(center, pt(0, -52 * layout.scale)) } : null,
      guard: gate ? { at: add(center, pt(0, -19 * layout.scale)), posture: state === "approved" ? "rest" : "asleep" } : null,
    };
  });

  const bees: SceneBee[] = [];
  const overflow: SceneOverflow[] = [];
  for (const island of islands) {
    const here = orderedBees(vm.bees.filter((b) => b.islandId === island.id));
    const link = bridges.find((b) => b.from === island.id) ?? bridges.find((b) => b.to === island.id);
    // O ponto da ilha que olha para a ponte: onde a abelha vai e volta.
    const head = link ? lerp(island.placement.c, link.from === island.id ? link.placement.a : link.placement.b, 0.62) : null;
    here.slice(0, maxBees).forEach((bee, index) => {
      const condition = beeCondition(bee.state, bee.reason);
      const reason = bee.reason?.replace(/^falhou:\s*/, "");
      bees.push({
        key: beeKey(bee),
        islandId: island.id,
        agentId: bee.agentId,
        index,
        size: beeSize(index, island.placement.u),
        condition,
        route: condition === "working" ? planRoute(index, island.art.anchors, head, island.placement.u) : null,
        perch: perchOf(island.art.anchors, index),
        tag: condition === "working" ? null : { glyph: condition, text: describeWorkStatus(condition, reason) },
      });
    });
    if (here.length > maxBees) overflow.push({ islandId: island.id, count: here.length - maxBees, at: add(island.art.anchors.front, pt(-30 * island.placement.u, -54 * island.placement.u)) });
  }

  return {
    stage: STAGE,
    initiativeId: vm.initiativeId,
    empty: null,
    scale: layout.scale,
    islands,
    bridges,
    bees,
    overflow,
    flying: bees.filter((b) => b.route !== null).length,
  };
}
