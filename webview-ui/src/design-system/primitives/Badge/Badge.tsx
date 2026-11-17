import type { HTMLAttributes, ReactNode } from "react";
import s from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
}

export function Badge({ tone = "neutral", icon, children, className, ...rest }: BadgeProps) {
  const classes = [s.badge, s[`badge--${tone}`], className].filter(Boolean).join(" ");
  return (
    <span className={classes} {...rest}>
      {icon}
      {children}
    </span>
  );
}
