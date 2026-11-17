import type { PlanItemStatus } from "@data";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { VisuallyHidden } from "../../primitives/VisuallyHidden/VisuallyHidden";
import { WORK_STATUS_INFO, toWorkStatus, type WorkStatus } from "../../status/workStatus";
import s from "./StatusBadge.module.css";

interface StatusBadgeProps {
  /** Status v2 (§3.3 + ADR-0022) ou o `PlanItemStatus` legado, convertido pela tabela da §3.3. */
  status: WorkStatus | PlanItemStatus;
  /** Motivo em texto: obrigatório na prática para blocked, failed e cancelled (ADR-0022). */
  reason?: string;
  /** Troca o rótulo padrão ("Concluído" em vez de "Feito", "na fila" em vez de "Na fila"). */
  label?: string;
  /** Só o glifo; o texto completo continua no nome acessível e na dica. */
  compact?: boolean;
  /** Rajada do ● quando chega um evento (só faz efeito em `working`). */
  pulse?: boolean;
}

/**
 * StatusChip do DS v2 (§4.10): glifo + rótulo, nunca só cor. Um só
 * vocabulário para o Cockpit, o quadro e o mapa.
 *
 * - `blocked` e `failed` levam o motivo em texto ("Falhou: timeout no CI");
 * - `cancelled` sai riscado, com o motivo;
 * - no alto contraste o fundo some e entra a borda de 1px no traço do status.
 */
export function StatusBadge({ status, reason, label, compact = false, pulse = false }: StatusBadgeProps) {
  const st = toWorkStatus(status);
  const info = WORK_STATUS_INFO[st];
  const text = label ?? info.label;
  const why = reason?.trim();
  const full = why ? `${text}: ${why}` : text;
  return (
    <span className={s.badge} data-status={st} data-tone={info.tone} title={why || compact ? full : undefined}>
      <StatusGlyph status={st} color="inherit" pulse={pulse && st === "working"} />
      {compact ? (
        <VisuallyHidden>{full}</VisuallyHidden>
      ) : (
        <>
          <span className={s.label}>{text}</span>
          {why && <span className={s.reason}>: {why}</span>}
        </>
      )}
    </span>
  );
}
