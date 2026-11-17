import { BeeGlyph } from "./BeeGlyph";
import s from "./Hud.module.css";

/**
 * "Como ler" (DS v2 §4.8): o que cada peça da cena quer dizer. Cada termo leva
 * o miniglifo, para a pista de forma não depender só da cor.
 */
export function Legend() {
  return (
    <section className={s.legend} aria-label="Legenda">
      <span className={s.eyebrow}>Como ler</span>
      <dl className={s.terms}>
        <div className={s.term}>
          <dt data-tone="working">
            <span className={s.mini}><BeeGlyph posture="perched" /></span>
            Abelha
          </dt>
          <dd>um agente trabalhando</dd>
        </div>
        <div className={s.term}>
          <dt data-tone="done">
            <span className={s.miniBridge} aria-hidden="true" />
            Ponte verde
          </dt>
          <dd>gate aprovado</dd>
        </div>
        <div className={s.term}>
          <dt data-tone="you">
            <span className={s.mini}><BeeGlyph posture="alert" /></span>
            Guarda azul
          </dt>
          <dd>uma decisão espera você</dd>
        </div>
        <div className={s.term}>
          <dt data-tone="working">
            <span className={s.miniComb} aria-hidden="true" />
            Pote cheio
          </dt>
          <dd>uma entrega pronta</dd>
        </div>
      </dl>
      <p className={s.quiet}>Clique numa ilha para ver quem trabalha ali.</p>
    </section>
  );
}
