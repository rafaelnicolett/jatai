import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { VisuallyHidden } from "../../primitives/VisuallyHidden/VisuallyHidden";
import { GATE_STATUS_TEXT, type GateStatus } from "./gateStatus";
import s from "./GateBadge.module.css";

interface GateBadgeProps {
  /** Chave do gate: "D1", "D2", "F1". */
  gate: string;
  status: GateStatus;
}

/**
 * GateBadge do DS v2 (§4.11): 26 × 26, raio 8, mono 11/600.
 * - aprovado: borda sólida done-line, texto done-fg;
 * - espera você: borda you-line e ■ no canto;
 * - depois: borda tracejada future-line, texto fg-3;
 * - bloqueado: borda blocked-line e ⊘ no canto.
 * O estado também vai em texto (visualmente oculto): "D1, aprovado".
 */
export function GateBadge({ gate, status }: GateBadgeProps) {
  return (
    <span className={s.badge} data-status={status}>
      <span className={s.key}>{gate}</span>
      {status === "waiting" && <StatusGlyph status="you" size={10} className={s.mark} />}
      {status === "blocked" && <StatusGlyph status="blocked" size={10} className={s.mark} />}
      <VisuallyHidden>, {GATE_STATUS_TEXT[status]}</VisuallyHidden>
    </span>
  );
}
