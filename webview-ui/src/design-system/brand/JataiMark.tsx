import { BRAND } from "@data";
import { GLYPH_PATHS, GLYPH_VIEWBOX, WORDMARK_PATHS, WORDMARK_VIEWBOX } from "./brandArt";
import s from "./JataiMark.module.css";

interface JataiMarkProps {
  /** Altura do glifo em px (DS v2: 26 na AppBar, 22 na abelha da trilha, 56 no estado vazio). */
  size?: number;
  /** Glifo + wordmark em contorno (o BrandMark da AppBar). */
  wordmark?: boolean;
  /** Decorativo (`aria-hidden`): quando o nome já está escrito ao lado. */
  decorative?: boolean;
  className?: string;
}

/**
 * Símbolo da marca (ADR-0013): o glifo Guarda em `--jt-mel` e, opcional, o
 * wordmark em contorno em `--jt-fg`. Substitui o HelyxMark (DS v2 §4.13,
 * BrandMark). O nome acessível vem do `BRAND`, nunca de um literal.
 */
export function JataiMark({ size = 26, wordmark = false, decorative = false, className }: JataiMarkProps) {
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": BRAND.displayName };
  const wordmarkHeight = Math.round(size * 0.62);
  return (
    <span className={[s.mark, className].filter(Boolean).join(" ")} {...a11y}>
      <svg className={s.glyph} width={size} height={size} viewBox={GLYPH_VIEWBOX} aria-hidden="true" focusable="false">
        <g fill="currentColor">
          {GLYPH_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
      {wordmark && (
        <svg
          className={s.wordmark}
          height={wordmarkHeight}
          width={Math.round((wordmarkHeight * 1975) / 976)}
          viewBox={WORDMARK_VIEWBOX}
          aria-hidden="true"
          focusable="false"
        >
          <g fill="currentColor">
            {WORDMARK_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </svg>
      )}
    </span>
  );
}
