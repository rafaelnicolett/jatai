import { useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import s from "./ChoiceCard.module.css";

interface ChoiceCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "title"> {
  /**
   * - `toggle` (padrão): botão com `aria-pressed`. Serve à escolha única e à
   *   múltipla, e é o que o Wizard usa hoje;
   * - `radio`: `role="radio"` + `aria-checked`, dentro de um
   *   `role="radiogroup"` cujo dono cuida do tabindex itinerante e das setas.
   */
  mode?: "toggle" | "radio";
  selected: boolean;
  /** Título: é o nome acessível. */
  title: ReactNode;
  /** Descrição: vai para `aria-describedby`. */
  description?: ReactNode;
  /** Ícone decorativo (o título já diz o que é). */
  icon?: ReactNode;
  /** Selo ou meta à direita/embaixo ("recomendado", "beta"). */
  meta?: ReactNode;
  /** Indisponível, mas focável, com o motivo na dica (DS v2 §4.0). */
  disabledReason?: string;
}

/**
 * Cartão de escolha (novo no DS v2, F4.2; sugestão da onda 4 para os cards do
 * Wizard). Seleção é escolha da pessoa, então é azul (§1, princípio 2):
 * borda de 2px `--jt-selected` sem deslocar o layout, fundo `status-you-bg`,
 * título mais forte e um ✓ no canto, para a seleção não depender só da cor.
 */
export function ChoiceCard({
  mode = "toggle",
  selected,
  title,
  description,
  icon,
  meta,
  disabledReason,
  className,
  onClick,
  ...rest
}: ChoiceCardProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = description ? `${id}-desc` : undefined;
  const classes = [s.card, className].filter(Boolean).join(" ");
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (disabledReason) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }
  return (
    <button
      type="button"
      className={classes}
      role={mode === "radio" ? "radio" : undefined}
      aria-pressed={mode === "toggle" ? selected : undefined}
      aria-checked={mode === "radio" ? selected : undefined}
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-disabled={disabledReason ? true : undefined}
      title={disabledReason}
      onClick={handleClick}
      {...rest}
    >
      {icon && (
        <span className={s.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={s.title} id={titleId}>
        {title}
      </span>
      {description && (
        <span className={s.desc} id={descId}>
          {description}
        </span>
      )}
      {meta && <span className={s.meta}>{meta}</span>}
      <svg className={s.check} width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M3.5 8.4 6.6 11.4 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
