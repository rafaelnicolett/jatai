import { Badge } from "../../primitives";
import s from "./SeverityChips.module.css";

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/** Contagem de achados por severidade — "o que encontramos", não "o que falta fazer". */
export function SeverityChips({ critical, high, medium, low }: SeverityCounts) {
  const total = critical + high + medium + low;
  if (total === 0) return <span className={s.empty}>sem achados registrados</span>;
  return (
    <div className={s.row}>
      {critical > 0 && <Badge tone="danger">{critical} crítico{critical > 1 ? "s" : ""}</Badge>}
      {high > 0 && <Badge tone="warning">{high} alto{high > 1 ? "s" : ""}</Badge>}
      {medium > 0 && <Badge tone="neutral">{medium} médio{medium > 1 ? "s" : ""}</Badge>}
      {low > 0 && <Badge tone="neutral">{low} baixo{low > 1 ? "s" : ""}</Badge>}
    </div>
  );
}
