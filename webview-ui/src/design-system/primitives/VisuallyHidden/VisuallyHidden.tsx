import type { ReactNode } from "react";
import s from "./VisuallyHidden.module.css";

/** Texto só para leitor de tela (fica fora da tela, mas no nome acessível). */
export function VisuallyHidden({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span className={s.hidden} id={id}>
      {children}
    </span>
  );
}
