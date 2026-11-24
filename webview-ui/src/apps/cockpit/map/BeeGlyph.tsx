import type { CastAccent } from "@data";
import s from "./BeeLayer.module.css";

export type BeePosture = "fly" | "perched" | "parked" | "alert" | "rest" | "asleep" | "landed";

/**
 * A abelha no estilo Guarda (o símbolo da marca visto de cima), em SVG inline:
 * asas translúcidas, abdômen de mel com duas faixas de própolis, tórax e
 * cabeça. É o mesmo desenho do protótipo (Mapa.dc.html), com o contorno fino
 * das asas para elas aparecerem sobre o céu claro do dia.
 *
 * `posture` decide só a pose, por CSS: voando (asas batem), pousada (asas
 * paradas), parada por bloqueio ou falha (cor de ferrugem, sem bater), em
 * alerta (a guarda acesa, de pé), em descanso (a guarda do gate aprovado) e
 * dormindo (a guarda do gate que ainda não existe). Inline, e não `<use>`, para
 * a animação das asas valer em cada abelha.
 */
export function BeeGlyph({ posture, condition, accent }: { posture: BeePosture; condition?: "working" | "blocked" | "failed"; accent?: CastAccent }) {
  return (
    <svg
      className={s.glyph}
      data-posture={posture}
      data-condition={condition}
      data-accent={accent}
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <g className={s.wings}>
        <ellipse className={s.wing} cx="6.6" cy="9.4" rx="5.4" ry="2.6" transform="rotate(-24 6.6 9.4)" />
        <ellipse className={s.wing} cx="17.4" cy="9.4" rx="5.4" ry="2.6" transform="rotate(24 17.4 9.4)" />
      </g>
      <ellipse className={s.abdomen} cx="12" cy="16.2" rx="3.4" ry="5.2" />
      <rect className={s.stripe} x="8.6" y="14.4" width="6.8" height="1.3" />
      <rect className={s.stripe} x="8.6" y="17.2" width="6.8" height="1.3" />
      <circle className={s.thorax} cx="12" cy="10" r="2.7" />
      {/* O colar é a persona: decorativo, o status continua na pose e no glifo. */}
      <rect className={s.collar} x="9.7" y="8.2" width="4.6" height="1.2" rx="0.6" />
      <circle className={s.head} cx="12" cy="6.2" r="2.1" />
    </svg>
  );
}
