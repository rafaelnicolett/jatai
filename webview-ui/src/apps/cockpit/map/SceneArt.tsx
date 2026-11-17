import type { SceneBridge, SceneIsland, SceneModel } from "./sceneModel";
import { hashSeed, pathOf, seeded, type Cube, type Pt } from "./projection";
import { STAGE } from "./layout";
import s from "./SceneArt.module.css";

/**
 * A arte estática da cena (F5.3): o céu com vento, as ilhas, as pontes e os
 * favos, desenhados uma vez em SVG. Nada aqui se move: as abelhas, as guardas
 * e os brilhos vivem numa camada HTML por cima (BeeLayer), animada só com
 * `transform` e opacidade, então esta camada não é repintada a cada quadro.
 *
 * Toda cor vem dos tokens da cena (`--jt-scene-*`) pelas classes do CSS Module, então a
 * mesma cena troca de crepúsculo para dia, e de ilustrada para esquemática no
 * alto contraste, só pelos tokens.
 */

const ID = "jt-map";

/** Os gradientes, o filtro de sombra suave e os brilhos. As cores vêm das classes (stop-color por CSS). */
function Defs() {
  return (
    <defs>
      <linearGradient id={`${ID}-grass`} x1="0" y1="0" x2="1" y2="1">
        <stop className={s.grass0} offset="0" />
        <stop className={s.grass1} offset="1" />
      </linearGradient>
      <linearGradient id={`${ID}-fog`} x1="0" y1="0" x2="1" y2="1">
        <stop className={s.fog0} offset="0" />
        <stop className={s.fog1} offset="1" />
      </linearGradient>
      <linearGradient id={`${ID}-soil-l`} x1="0" y1="0" x2="0" y2="1">
        <stop className={s.soilLTop} offset="0" />
        <stop className={s.soilLBottom} offset="1" />
      </linearGradient>
      <linearGradient id={`${ID}-soil-r`} x1="0" y1="0" x2="0" y2="1">
        <stop className={s.soilRTop} offset="0" />
        <stop className={s.soilRBottom} offset="1" />
      </linearGradient>
      <linearGradient id={`${ID}-sheen`} x1="0" y1="0" x2="1" y2="1">
        <stop className={s.sheen0} offset="0" />
        <stop className={s.sheen1} offset="0.6" />
      </linearGradient>
      <radialGradient id={`${ID}-warm`} cx="0.5" cy="0.5" r="0.5">
        <stop className={s.warm0} offset="0" />
        <stop className={s.warm1} offset="1" />
      </radialGradient>
      <radialGradient id={`${ID}-comb-glow`} cx="0.5" cy="0.5" r="0.5">
        <stop className={s.combGlow0} offset="0" />
        <stop className={s.combGlow1} offset="1" />
      </radialGradient>
      <radialGradient id={`${ID}-glow-done`} cx="0.5" cy="0.5" r="0.5">
        <stop className={s.glowDone0} offset="0" />
        <stop className={s.glowDone1} offset="1" />
      </radialGradient>
      <filter id={`${ID}-soft`} x="-30%" y="-80%" width="160%" height="260%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <filter id={`${ID}-soft-small`} x="-50%" y="-100%" width="200%" height="300%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
  );
}

const fill = (key: string): string => `url(#${ID}-${key})`;

/** Traços finos de vento no céu, sempre os mesmos (semente fixa): textura, sem significado. */
function windPath(): string {
  const rand = seeded(hashSeed("vento"));
  const strokes: string[] = [];
  for (let i = 0; i < 26; i++) {
    const x = Math.round(60 + rand() * (STAGE.w - 120));
    const y = Math.round(560 + rand() * (STAGE.h - 600));
    const len = 18 + rand() * 30;
    strokes.push(`M${x} ${y} l${Math.round(len)} ${Math.round(len / 2)}`);
  }
  return strokes.join(" ");
}
const WIND = windPath();

/** Estrelas: pontos pequenos e parados no alto do céu, sempre os mesmos (semente fixa). */
const STARS = (() => {
  const rand = seeded(hashSeed("estrelas"));
  return Array.from({ length: 46 }, () => ({ x: Math.round(rand() * STAGE.w), y: Math.round(rand() * STAGE.h * 0.42), r: 0.7 + rand() * 1.5, o: 0.12 + rand() * 0.42 }));
})();

function CubeArt({ cube, left, right, roof, rim }: { cube: Cube; left: string; right: string; roof: string; rim: string }) {
  return (
    <>
      <path className={left} d={pathOf(cube.left)} />
      <path className={right} d={pathOf(cube.right)} />
      <path className={roof} d={pathOf(cube.roof)} />
      <path className={rim} d={pathOf(cube.rim)} />
    </>
  );
}

/** Um tufo de grama: três lâminas finas, no tamanho da ilha. */
function tuftPath(at: Pt, u: number): string {
  const h = 5 * u;
  return `M${at.x - 2.2 * u},${at.y} l${-0.8 * u},${-h} M${at.x},${at.y} l${0.4 * u},${-h * 1.3} M${at.x + 2.2 * u},${at.y} l${1.1 * u},${-h}`;
}

function Island({ island, fresh }: { island: SceneIsland; fresh: ReadonlySet<string> }) {
  const { art, placement, tree } = island;
  const { u } = placement;
  const sleeping = island.state === "sleeping";
  const slab = art.slab;
  return (
    <g className={s.island} data-state={island.state} data-island={island.id} opacity={sleeping ? 0.5 : undefined}>
      <ellipse className={s.shadow} cx={art.shadow.cx} cy={art.shadow.cy} rx={art.shadow.rx} ry={art.shadow.ry} filter={`url(#${ID}-soft)`} />
      <path className={s.soilL} d={pathOf(slab.left)} fill={fill("soil-l")} />
      <path className={s.soilR} d={pathOf(slab.right)} fill={fill("soil-r")} />
      {art.strata.map((line, i) => (
        <path key={i} className={s.strata} d={pathOf(line, false)} strokeOpacity={i === 0 ? 0.5 : 0.35} strokeWidth={i === 0 ? 3 : 2} />
      ))}
      <path className={s.soilEdge} d={pathOf([slab.left[0], slab.left[1], slab.right[0]], false)} />
      <path className={sleeping ? s.fog : s.grass} d={pathOf(slab.top)} fill={fill(sleeping ? "fog" : "grass")} />
      {!sleeping && <path className={s.sheen} d={pathOf(slab.top)} fill={fill("sheen")} />}
      <path className={sleeping ? s.lipFog : s.lip} d={pathOf(slab.lip, false)} />

      {art.tufts.map((at, i) => (
        <path key={i} className={s.tuft} d={tuftPath(at, u)} strokeWidth={Math.max(1, 1.5 * u)} />
      ))}

      {/* O ipê: sombra, tronco, copa em três círculos, sombra da copa, brilho e pétalas no chão. */}
      <ellipse className={s.treeShadow} cx={art.tree.shadow.cx} cy={art.tree.shadow.cy} rx={art.tree.shadow.rx} ry={art.tree.shadow.ry} />
      {art.tree.petals.map((p, i) => (
        <circle key={i} className={s.petal} data-tree={tree} cx={p.cx} cy={p.cy} r={p.r} />
      ))}
      <rect className={s.trunk} x={art.tree.trunk.x} y={art.tree.trunk.y} width={art.tree.trunk.w} height={art.tree.trunk.h} rx={1.5 * u} />
      {art.tree.canopy.map((k, i) => (
        <circle key={i} className={s.canopy} data-tree={tree} cx={k.cx} cy={k.cy} r={k.r} />
      ))}
      <circle className={s.canopyShade} data-tree={tree} cx={art.tree.shade.cx} cy={art.tree.shade.cy} r={art.tree.shade.r} />
      <circle className={s.canopyHi} data-tree={tree} cx={art.tree.highlight.cx} cy={art.tree.highlight.cy} r={art.tree.highlight.r} />

      {/* O anexo em obra, atrás da caixa, só na ilha atual. */}
      {art.annex && (
        <>
          <CubeArt cube={art.annex.cube} left={s.annexL} right={s.annexR} roof={s.annexRoof} rim={s.annexRim} />
          <path className={s.scaffold} d={art.annex.scaffold} />
        </>
      )}

      {/* A caixa da colônia, com as tábuas e a entrada. */}
      <CubeArt cube={art.box} left={s.woodL} right={s.woodR} roof={s.roofTop} rim={s.roofRim} />
      {art.planks.map(([a, b], i) => (
        <path key={i} className={s.plank} d={pathOf([a, b], false)} />
      ))}
      <ellipse className={s.entranceRing} cx={art.entrance.outer.cx} cy={art.entrance.outer.cy} rx={art.entrance.outer.rx} ry={art.entrance.outer.ry} />
      <ellipse className={s.entrance} cx={art.entrance.inner.cx} cy={art.entrance.inner.cy} rx={art.entrance.inner.rx} ry={art.entrance.inner.ry} />

      {/* O favo: brilho de mel atrás, células cheias com a entrega e células vazias com as que vêm. */}
      {island.combs.some((k) => k.filled) && <ellipse className={s.combGlow} fill={fill("comb-glow")} cx={art.anchors.comb.x} cy={art.anchors.comb.y} rx={30 * u} ry={20 * u} />}
      {island.combs.map((k) => (
        <g key={k.key} data-pot={k.path ?? undefined} data-filled={k.filled}>
          {k.filled ? (
            <g className={fresh.has(k.key) ? s.potFill : undefined} style={{ transformOrigin: `${k.at.x}px ${k.at.y}px` }}>
              <circle className={s.comb} cx={k.at.x} cy={k.at.y} r={art.combRadius} />
              <circle className={s.combHi} cx={k.at.x - 0.3 * art.combRadius} cy={k.at.y - 0.35 * art.combRadius} r={0.32 * art.combRadius} />
            </g>
          ) : (
            <circle className={s.combEmpty} cx={k.at.x} cy={k.at.y} r={art.combRadius} />
          )}
        </g>
      ))}
      {sleeping && <ellipse className={s.haze} cx={art.haze.cx} cy={art.haze.cy} rx={art.haze.rx} ry={art.haze.ry} />}
    </g>
  );
}

/** A ponte: tabuleiro, tábuas, corrimãos e postes quando construída; o contorno tracejado quando por construir. */
function Bridge({ bridge }: { bridge: SceneBridge }) {
  const { art } = bridge;
  if (bridge.state === "unbuilt") return <path className={s.unbuilt} d={pathOf(art.deck)} data-bridge={bridge.key} data-state="unbuilt" data-gate={bridge.gate} />;
  const [pa, pb] = art.plank;
  return (
    <g data-bridge={bridge.key} data-state="approved" data-gate={bridge.gate}>
      <path className={s.deck} d={pathOf(art.deck)} />
      <path className={s.deckPlank} d={pathOf([pa, pb], false)} />
      {art.rails.map(([a, b], i) => (
        <path key={`r${i}`} className={s.rail} d={pathOf([a, b], false)} />
      ))}
      {art.posts.map(([a, b], i) => (
        <path key={`p${i}`} className={s.post} d={pathOf([a, b], false)} />
      ))}
      {bridge.gate && <ellipse className={s.bridgeGlow} fill={fill("glow-done")} cx={bridge.center.x} cy={bridge.center.y - 14} rx={26} ry={16} />}
    </g>
  );
}

/** Do fundo para a frente: a ilha mais alta no palco é a mais longe. */
export function SceneArt({ scene, fresh }: { scene: SceneModel; fresh: ReadonlySet<string> }) {
  const order = [...scene.islands].sort((a, b) => a.placement.c.y - b.placement.c.y || a.index - b.index);
  const current = scene.islands.find((i) => i.state === "current");
  return (
    <svg className={s.art} viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} width={STAGE.w} height={STAGE.h} aria-hidden="true" focusable="false">
      <Defs />
      {STARS.map((star, i) => (
        <circle key={i} className={s.star} cx={star.x} cy={star.y} r={star.r} opacity={star.o} />
      ))}
      <path className={s.wind} d={WIND} />
      {current && <ellipse className={s.warm} fill={fill("warm")} cx={current.placement.c.x} cy={current.placement.c.y + 30} rx={current.placement.w * 1.25} ry={current.placement.w * 0.72} />}
      {order.map((island) => (
        <Island key={island.id} island={island} fresh={fresh} />
      ))}
      {scene.bridges.map((bridge) => (
        <Bridge key={bridge.key} bridge={bridge} />
      ))}
    </svg>
  );
}
