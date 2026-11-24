import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BeeGlyph, type BeePosture } from "./BeeGlyph";
import { frameTransform, keyframesOf } from "./beeRoutes";
import type { MotionState } from "./mapPrefs";
import { FLAP_LIMIT, type SceneBee, type SceneModel } from "./sceneModel";
import s from "./BeeLayer.module.css";

/**
 * A camada viva do mapa (F5.3): as abelhas que voam, as paradas, a guarda acesa
 * e as guardas dos gates. Cada abelha é um elemento HTML com `transform`
 * animado pela Web Animations API: o voo roda no compositor, sem relayout e
 * sem JavaScript por quadro, e uma cena com ninguém trabalhando não anima nada.
 *
 * - **Voando** (`motion: live`): uma volta fechada por abelha, em loop, com o
 *   atraso negativo da volta (as abelhas da ilha não voam juntas).
 * - **Em pausa**: as animações ficam pausadas onde estão.
 * - **Movimento reduzido**: nenhuma animação; cada abelha fica no ponto de pouso.
 * - **Pousando**: a abelha que deixa de trabalhar não some de uma vez: desliza
 *   do ponto do voo até o pouso, recolhe as asas, fica um tempo e apaga.
 */

/** Quanto a abelha fica pousada na ilha antes de apagar, e quanto dura o apagar. */
export const LAND_MS = 700;
export const LINGER_MS = 2400;

/** O conteúdo da volta, em texto: muda só quando a volta muda, e é o que mantém a animação rodando entre uma atualização e outra. */
function signatureOf(bee: SceneBee): string {
  const r = bee.route;
  return r ? `${r.kind}|${r.frames[0]!.x},${r.frames[0]!.y}|${r.frames.length}|${r.duration}|${r.phase}|${bee.size}` : `parada|${bee.perch.x},${bee.perch.y}|${bee.size}`;
}

interface SpriteProps {
  bee: SceneBee;
  motion: MotionState;
  landing: boolean;
  onGone: (key: string) => void;
}

function BeeSprite({ bee, motion, landing, onGone }: SpriteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const signature = signatureOf(bee);
  const animates = bee.route !== null && motion !== "reduced" && !landing;
  const rest = frameTransform({ x: bee.perch.x, y: bee.perch.y, rot: 0 }, bee.size);
  const start = bee.route && motion !== "reduced" ? frameTransform(bee.route.frames[0]!, bee.size) : rest;
  const [leaving, setLeaving] = useState(false);

  // A volta: criada quando muda o conteúdo dela; pausar e retomar só mexem na animação.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || landing) return;
    el.style.transform = start;
    if (!animates || !bee.route || typeof el.animate !== "function") return;
    const a = el.animate(keyframesOf(bee.route, bee.size), { duration: bee.route.duration, iterations: Infinity, easing: "linear", delay: bee.route.phase });
    animation.current = a;
    return () => {
      // Antes de soltar a volta, guarda onde a abelha está, para o pouso sair dali sem pulo.
      const now = getComputedStyle(el).transform;
      if (now && now !== "none") el.style.transform = now;
      a.cancel();
      animation.current = null;
    };
    // O que importa da rota está na assinatura; a identidade do objeto muda a cada derivação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, animates, landing]);

  useEffect(() => {
    const a = animation.current;
    if (!a) return;
    if (motion === "paused") a.pause();
    else a.play();
  }, [motion, signature, animates]);

  // O pouso: desliza até o ponto de pouso, fica um tempo e apaga.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !landing) return;
    if (typeof el.animate === "function") {
      el.animate([{ transform: el.style.transform || start }, { transform: rest }], { duration: LAND_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" });
    } else {
      el.style.transform = rest;
    }
    const fade = setTimeout(() => setLeaving(true), LAND_MS + LINGER_MS);
    const gone = setTimeout(() => onGone(bee.key), LAND_MS + LINGER_MS + 320);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
    // Só quando a abelha começa a pousar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing]);

  const posture: BeePosture = landing ? "landed" : bee.condition === "working" ? (motion === "live" ? "fly" : "perched") : "parked";
  return (
    <div
      ref={ref}
      className={s.sprite}
      data-bee={bee.agentId ?? bee.key}
      data-island={bee.islandId}
      data-condition={bee.condition}
      data-accent={bee.accent}
      data-flying={animates ? "true" : "false"}
      data-landing={landing ? "true" : undefined}
      data-leaving={leaving ? "true" : undefined}
      data-enter={landing ? undefined : ""}
      style={{ width: bee.size, height: bee.size, transform: start }}
    >
      <BeeGlyph posture={posture} condition={bee.condition} accent={bee.accent} />
    </div>
  );
}

/**
 * Quem está pousando: as abelhas que voavam no desenho anterior e já não
 * estão no atual. Calculado durante o render (e não num efeito), para o
 * elemento da abelha continuar o mesmo e o pouso sair de onde ela estava.
 */
function useLanding(bees: SceneBee[], motion: MotionState): { landing: SceneBee[]; done: (key: string) => void } {
  const [previous, setPrevious] = useState<{ bees: SceneBee[] }>({ bees });
  const [landing, setLanding] = useState<SceneBee[]>([]);
  if (previous.bees !== bees) {
    const now = new Set(bees.map((b) => b.key));
    const gone = motion === "live" ? previous.bees.filter((b) => b.route !== null && !now.has(b.key)) : [];
    setPrevious({ bees });
    setLanding((list) => [...list.filter((b) => !now.has(b.key) && !gone.some((g) => g.key === b.key)), ...gone]);
  }
  return { landing, done: (key) => setLanding((list) => list.filter((b) => b.key !== key)) };
}

export function BeeLayer({ scene, motion }: { scene: SceneModel; motion: MotionState }) {
  const { landing, done } = useLanding(scene.bees, motion);
  const sprites = [...scene.bees.map((bee) => ({ bee, landing: false })), ...landing.map((bee) => ({ bee, landing: true }))];

  // Muita abelha voando: as asas ficam abertas (o voo continua) para o total de nós animados caber no orçamento.
  const crowded = scene.flying > FLAP_LIMIT;

  return (
    <div className={s.layer} aria-hidden="true" data-crowd={crowded ? "true" : undefined}>
      {scene.islands.map((island) =>
        island.lit ? (
          <div key={`${island.id}-guard`} data-guard-lit={island.id}>
            {/* A posição vai no de fora e a animação no de dentro: a animação de `transform` não pode apagar o `translate`. */}
            <span className={s.glowPos} style={{ width: 56, height: 56, transform: `translate(${island.lit.at.x - 28}px, ${island.lit.at.y - 22}px)` }}>
              <span className={s.glowYou} />
            </span>
            <div className={s.sprite} data-guard="alert" style={{ width: 28, height: 28, transform: `translate(${island.lit.at.x - 14}px, ${island.lit.at.y - 14}px)` }}>
              <BeeGlyph posture="alert" />
            </div>
          </div>
        ) : null
      )}
      {scene.bridges.map((bridge) =>
        bridge.guard ? (
          <div key={`${bridge.key}-guard`} className={s.sprite} data-guard={bridge.guard.posture} data-gate={bridge.gate} style={{ width: 20, height: 20, transform: `translate(${bridge.guard.at.x - 10}px, ${bridge.guard.at.y - 10}px)` }}>
            <BeeGlyph posture={bridge.guard.posture} />
          </div>
        ) : null
      )}
      {sprites.map(({ bee, landing: isLanding }) => (
        <BeeSprite key={bee.key} bee={bee} motion={motion} landing={isLanding} onGone={done} />
      ))}
    </div>
  );
}
