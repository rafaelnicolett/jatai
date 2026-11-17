import type { ReactNode } from "react";
import { WORK_STATUS_INFO, type WorkStatus } from "../../status/workStatus";
import s from "./StatusGlyph.module.css";

interface StatusGlyphProps {
  status: WorkStatus;
  /** Lado da caixa em px (DS v2: 14; 8 nas marcas de canto). */
  size?: number;
  /**
   * Respira numa rajada (2 ciclos, --jt-iterations-burst) ao montar: o "●
   * trabalhando" quando chega um evento. Para repetir a rajada no próximo
   * evento, o pai troca a `key`. Parado com movimento reduzido.
   */
  pulse?: boolean;
  /** `inherit` usa a cor do texto em volta; por padrão, o traço do status (≥ 3:1). */
  color?: "status" | "inherit";
  className?: string;
}

const STROKE = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Formas do DS v2 §4.13 (✓ ● ■ ○ ⊘ ◌) e as duas da ADR-0022 (✕ falhou, — cancelado). */
const SHAPES: Record<WorkStatus, ReactNode> = {
  done: <path d="M3.2 7.4 5.9 10l4.9-5.8" {...STROKE} strokeWidth={2.6} />,
  working: <circle cx="7" cy="7" r="4" fill="currentColor" />,
  you: <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" />,
  queue: <circle cx="7" cy="7" r="3" {...STROKE} strokeWidth={2} />,
  blocked: (
    <>
      <circle cx="7" cy="7" r="5" {...STROKE} strokeWidth={2} />
      <path d="M3.6 10.4 10.4 3.6" {...STROKE} strokeWidth={2} />
    </>
  ),
  future: <circle cx="7" cy="7" r="5.25" {...STROKE} strokeWidth={1.5} strokeDasharray="2.2 2" strokeLinecap="butt" />,
  failed: <path d="m3.9 3.9 6.2 6.2m0-6.2-6.2 6.2" {...STROKE} strokeWidth={2.6} />,
  cancelled: <path d="M3 7h8" {...STROKE} strokeWidth={2.6} />,
};

/**
 * Glifo de status: forma própria por status, em `currentColor`. Sempre
 * `aria-hidden` e sempre ao lado de um texto (visível ou visualmente
 * oculto): é o glifo que deixa o status legível sem cor (escala de cinza,
 * forced-colors).
 */
export function StatusGlyph({ status, size = 14, pulse = false, color = "status", className }: StatusGlyphProps) {
  const classes = [s.glyph, pulse && s.pulse, className].filter(Boolean).join(" ");
  return (
    <svg
      className={classes}
      data-status={status}
      data-tone={color === "status" ? WORK_STATUS_INFO[status].tone : undefined}
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[status]}
    </svg>
  );
}
