import type { HTMLAttributes } from "react";
import s from "./Card.module.css";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Popover ou diálogo: ganha elevação (no alto contraste, a elevação vira só a borda). */
  raised?: boolean;
  /** Elemento semântico: `section`/`article`/`aside` quando o cartão é uma região com título. */
  as?: "div" | "section" | "article" | "aside";
}

/**
 * Panel (Card) do DS v2 (§4.13, D23): superfície `surface`, borda `line`,
 * raio 16 e padding 16. É a única forma de montar uma superfície de cartão:
 * feature não repete `border + radius + background` no próprio CSS.
 */
export function Card({ raised = false, as: Tag = "div", className, children, ...rest }: CardProps) {
  const classes = [s.card, raised && s["card--raised"], className].filter(Boolean).join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
