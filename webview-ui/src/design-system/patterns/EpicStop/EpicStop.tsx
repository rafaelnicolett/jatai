import { forwardRef, type ButtonHTMLAttributes } from "react";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { epicStopName, type EpicStopStatus } from "./epicStopName";
import s from "./EpicStop.module.css";

interface EpicStopProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "role"> {
  /** "Epic" (padrão), "Onda", "Repositório", "Fase" ou "Sprint": a palavra do nome acessível. */
  unit?: string;
  n: number;
  label: string;
  status?: EpicStopStatus;
  /** A missão está aqui: 40px, preenchimento mel, anel working-line, `aria-current="step"`. */
  here?: boolean;
  /** Épico mostrado no quadro: anel --jt-selected e rótulo em 600 (`aria-selected`). */
  selected?: boolean;
  /** 0–100; entra no nome acessível ("18%"). */
  progress?: number;
  /** id do painel do quadro (`aria-controls`, em geral "epic-board"). */
  controls?: string;
}

/**
 * Parada da trilha (DS v2 §4.2): um épico do stream atual. É uma aba
 * (`role="tab"`) dentro do `tablist` da trilha; o tabindex itinerante e as
 * setas ficam com quem monta a trilha (PhaseTrack, F4.2 parte 2).
 *
 * Marcas de estado, nunca só cor: concluído troca o número por ✓; decisão
 * pendente põe ■ no canto; bloqueado, ⊘.
 */
export const EpicStop = forwardRef<HTMLButtonElement, EpicStopProps>(function EpicStop(
  { unit, n, label, status = "queue", here = false, selected = false, progress, controls, className, ...rest },
  ref
) {
  const classes = [s.stop, className].filter(Boolean).join(" ");
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      className={classes}
      data-status={status}
      data-here={here || undefined}
      aria-selected={selected}
      aria-controls={controls}
      aria-current={here ? "step" : undefined}
      aria-label={epicStopName({ unit, n, label, status, progress, here })}
      {...rest}
    >
      <span className={s.circle} aria-hidden="true">
        {status === "done" ? <StatusGlyph status="done" color="inherit" /> : <span className={s.n}>{n}</span>}
        {status === "you" && <StatusGlyph status="you" size={10} className={s.mark} />}
        {status === "blocked" && <StatusGlyph status="blocked" size={10} className={s.mark} />}
      </span>
      <span className={s.label} aria-hidden="true">
        {label}
      </span>
    </button>
  );
});
