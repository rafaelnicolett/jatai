import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import s from "./Button.module.css";

/**
 * Variantes do DS v2 (§4.9):
 * - primary: ação principal (mel, texto Própolis);
 * - secondary: alternativa;
 * - tertiary: saída lateral (era `ghost`);
 * - accent: navegação da marca ("Mapa", "Voltar ao Cockpit");
 * - you: ação de "espera você" dentro de card;
 * - icon: só ícone (exige `aria-label`);
 * - command: a busca de comandos, com `kbd`;
 * - danger: destrutivo.
 */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "accent" | "you" | "icon" | "command" | "danger";
/** 36 / 40 / 44 / 48 px de altura. */
export type ButtonSize = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  /** Alternância: vira `aria-pressed` (fundo you-bg e borda --jt-selected quando ligado). */
  pressed?: boolean;
  /**
   * Desabilitado que continua focável (DS v2 §4.0): `aria-disabled`, o
   * motivo na dica e o clique ignorado. Prefira a `disabled`, que tira o
   * botão da ordem de tabulação e esconde o porquê.
   */
  disabledReason?: string;
  /** Registrando: glifo de carregamento no lugar do ícone, `aria-busy` e clique ignorado. */
  loading?: boolean;
  /** Rótulo durante o carregamento (ex.: "Registrando…"); sem ele, o rótulo fica. */
  loadingLabel?: string;
  /** Atalho exibido na variante `command` ("⌘K", "Ctrl K"). */
  kbd?: string;
  type?: "button" | "submit" | "reset";
}

function Spinner() {
  return (
    <svg className={s.spinner} width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon,
      iconPosition = "left",
      pressed,
      disabledReason,
      loading = false,
      loadingLabel,
      kbd,
      type = "button",
      children,
      className,
      onClick,
      title,
      ...rest
    },
    ref,
  ) => {
    const inert = Boolean(disabledReason) || loading;
    const classes = [s.btn, s[`btn--${variant}`], s[`btn--${size}`], className].filter(Boolean).join(" ");
    const lead = loading ? <Spinner /> : icon;
    const label = loading && loadingLabel ? loadingLabel : children;
    function handleClick(e: MouseEvent<HTMLButtonElement>) {
      if (inert) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    }
    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        aria-pressed={pressed === undefined ? undefined : pressed}
        aria-disabled={disabledReason ? true : undefined}
        aria-busy={loading || undefined}
        title={title ?? disabledReason}
        onClick={handleClick}
        {...rest}
      >
        {lead && iconPosition === "left" && lead}
        {label}
        {kbd && <kbd className={s.kbd}>{kbd}</kbd>}
        {lead && iconPosition === "right" && lead}
      </button>
    );
  },
);

Button.displayName = "Button";
