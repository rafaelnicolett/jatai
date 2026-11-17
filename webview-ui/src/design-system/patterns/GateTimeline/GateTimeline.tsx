import { Button } from "../../primitives/Button/Button";
import { EmptyState } from "../EmptyState/EmptyState";
import { GateBadge } from "../GateBadge/GateBadge";
import type { GateStatus } from "../GateBadge/gateStatus";
import s from "./GateTimeline.module.css";

export interface GateItemView {
  /** Chave do selo: "D1", "D2", "D3". */
  badge: string;
  title: string;
  status: GateStatus;
  /** "✓ aprovado em 25/08 por Fulana", "espera você", "falta quality, debt". */
  meta: string;
  /** Só no gate que espera você: abre o painel de decisão. */
  onReview?: () => void;
}

interface GateTimelineProps {
  items: GateItemView[];
  /** Sem gates: o texto do estado vazio ("Esta iniciativa ainda não tem gates."). */
  empty?: string;
}

/**
 * Linha do tempo de gates do DS v2 (§4.6): quais foram aprovados, quando e por
 * quem, e qual espera você. Cada item é lido inteiro ("D2, aprovado,
 * Planejamento → Execução, ✓ aprovado em 14/11 por Pessoa"); o estado vai no
 * selo (forma e traçado) e no texto, nunca só na cor. O gate que espera você
 * ganha "Revisar o gate", que abre o painel de decisão.
 */
export function GateTimeline({ items, empty }: GateTimelineProps) {
  return (
    <aside className={s.timeline} aria-label="Gates">
      <span className={s.eyebrow}>Guardas · gates</span>
      {items.length === 0 ? (
        <EmptyState variant="quiet" glyph="future" title={empty ?? "Esta iniciativa ainda não tem gates."} />
      ) : (
        <ol className={s.list}>
          {items.map((item) => (
            <li key={`${item.badge}-${item.title}`} className={s.item} data-status={item.status}>
              <GateBadge gate={item.badge} status={item.status} />
              <span className={s.text}>
                <span className={s.title}>{item.title}</span>
                <span className={s.meta}>{item.meta}</span>
                {item.onReview && (
                  <Button variant="you" size="sm" aria-label={`Revisar o gate ${item.badge}: ${item.title}`} onClick={item.onReview}>
                    Revisar o gate
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
