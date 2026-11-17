import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { JataiMark } from "../../brand/JataiMark";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import s from "./EmptyState.module.css";

export interface EmptyStateProps {
  /**
   * DS v2 §4.12:
   * - `page`: centralizado, até 420px, glifo Guarda de 56 em mel, título `display-md`, texto e a ação principal;
   * - `inline`: borda tracejada dentro de um painel (quadro vazio), título, texto e ação opcional;
   * - `quiet`: glifo ✓ ou ◌ e uma linha ("Nada espera você agora").
   */
  variant?: "page" | "inline" | "quiet";
  /** `page`: um ícone dentro do selo, no lugar do glifo da marca (as telas anteriores ao DS v2 passam o seu). */
  icon?: LucideIcon;
  /** `quiet`: o glifo da linha. ✓ para "nada a fazer", ◌ para "ainda não existe". */
  glyph?: "done" | "future";
  /** Em `quiet`, a linha toda. Nas outras variantes, o título. Diga por que está vazio e quando enche, nunca só "Nada aqui". */
  title: string;
  body?: string;
  action?: ReactNode;
  /** O nível do título depende do contexto (DS v2 §4.12). */
  headingLevel?: 1 | 2 | 3;
  /** Ainda esperando: `aria-busy`. */
  busy?: boolean;
}

/**
 * Estado vazio do DS v2 (§4.12). Não é região viva: quem esvazia a lista por
 * ação da pessoa anuncia a mudança por conta própria (`role="status"` educado).
 */
export function EmptyState({ variant = "page", icon: Icon, glyph = "done", title, body, action, headingLevel = 2, busy = false }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";

  if (variant === "quiet") {
    return (
      <p className={s.quiet} data-variant="quiet">
        <StatusGlyph status={glyph === "future" ? "future" : "done"} color="inherit" />
        <span>{title}</span>
      </p>
    );
  }

  if (variant === "inline") {
    return (
      <div className={s.inline} data-variant="inline" aria-busy={busy || undefined}>
        <Heading className={s.inlineTitle}>{title}</Heading>
        {body && <p className={s.inlineBody}>{body}</p>}
        {action && <div className={s.action}>{action}</div>}
      </div>
    );
  }

  return (
    <div className={s.wrap} data-variant="page" aria-busy={busy || undefined}>
      {Icon ? (
        <div className={s.iconBadge}>
          <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
        </div>
      ) : (
        <JataiMark size={56} decorative className={s.mark} />
      )}
      <Heading className={s.title}>{title}</Heading>
      {body && <p className={s.body}>{body}</p>}
      {action && <div className={s.action}>{action}</div>}
    </div>
  );
}
