import type { PlanItem, PlanItemStatus } from "@data";
import { computeRailSegments } from "./computeRailSegments";
import s from "./ProgressRail.module.css";

const LABEL: Record<PlanItemStatus, string> = {
  done: "concluída",
  running: "rodando",
  review: "aguarda revisão",
  blocked: "bloqueada",
  pending: "pendente",
};

interface ProgressRailProps {
  items: PlanItem[];
}

/**
 * Faixa fina e persistente no shell — sobrevive a troca de aba porque vive
 * fora do `<main>` do `AppShell`. Resolve "pra onde eu troquei de view e
 * perdi de vista quanto falta" sem exigir que nenhuma view individual carregue
 * esse resumo sozinha.
 */
export function ProgressRail({ items }: ProgressRailProps) {
  const { total, doneCount, reviewCount, segments } = computeRailSegments(items);

  return (
    <div className={s.rail}>
      <div className={s.track}>
        {segments.map((seg) => (
          <div
            key={seg.status}
            className={s.segment}
            data-status={seg.status}
            style={{ width: `${seg.pct}%` }}
            title={`${seg.count} ${LABEL[seg.status]}`}
          />
        ))}
      </div>
      <span className={s.summary}>
        {total > 0 ? `${doneCount}/${total}` : "—"}
        {reviewCount > 0 && (
          <span className={s.awaiting}>
            {" "}
            · {reviewCount} {reviewCount > 1 ? "aguardam" : "aguarda"} você
          </span>
        )}
      </span>
    </div>
  );
}
