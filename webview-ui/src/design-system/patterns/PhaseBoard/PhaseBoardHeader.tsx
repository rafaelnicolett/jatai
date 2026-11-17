import type { ReactNode } from "react";
import type { PlanItemStatus } from "@data";
import s from "./PhaseBoardHeader.module.css";

interface PhaseBoardHeaderProps {
  status: PlanItemStatus;
  title: string;
  meta: ReactNode;
  /** Slot opcional à direita — usado hoje pela aprovação atômica de fase greenfield. */
  action?: ReactNode;
}

/**
 * Cabeçalho pequeno acima do `PhaseBoard` — nome da fase/onda/repo
 * selecionado + status + meta. Reaproveitado pelos 3 formatos de iniciativa
 * pra não repetir esse mesmo bloco 3 vezes.
 */
export function PhaseBoardHeader({ status, title, meta, action }: PhaseBoardHeaderProps) {
  return (
    <div className={s.head}>
      <span className={[s.dot, status === "running" && "hx-pulse"].filter(Boolean).join(" ")} data-status={status} />
      <h3 className={s.title}>{title}</h3>
      <span className={s.meta}>{meta}</span>
      {action}
    </div>
  );
}
