import { Children, useId, type ReactNode } from "react";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { VisuallyHidden } from "../../primitives/VisuallyHidden/VisuallyHidden";
import { STATUS_COLUMN_LABEL, blockedText, type ColumnStatus } from "./statusColumns";
import s from "./StatusColumn.module.css";

interface StatusColumnProps {
  status: ColumnStatus;
  /** Quantas tarefas (por padrão, quantos filhos). */
  count?: number;
  /** Cards bloqueados nesta coluna: o cabeçalho ganha "· ⊘ 1 bloqueada". */
  blockedCount?: number;
  headingLevel?: 2 | 3;
  /**
   * Muda a cada evento de agente: o ● de "Trabalhando" respira numa rajada
   * de 2 ciclos e para (DS v2 §3.11). Sem a prop, nada se move.
   */
  activityKey?: string | number;
  /** Os TaskCards; cada um vira um <li>. */
  children?: ReactNode;
}

/**
 * Coluna de status do quadro do épico (DS v2 §4.5). Cabeçalho com glifo,
 * rótulo e contagem; o bloqueio é condição do card, então aparece só como
 * sufixo. Coluna vazia mostra o cabeçalho com "0": é informação ("nada
 * esperando").
 */
export function StatusColumn({ status, count, blockedCount = 0, headingLevel = 2, activityKey, children }: StatusColumnProps) {
  const headingId = useId();
  const items = Children.toArray(children);
  const n = count ?? items.length;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={s.column} data-status={status} aria-labelledby={headingId}>
      <Heading className={s.header} id={headingId}>
        <StatusGlyph key={activityKey} status={status} pulse={status === "working" && activityKey !== undefined} />
        <span className={s.label}>{STATUS_COLUMN_LABEL[status]}</span>
        <span className={s.count}>
          <VisuallyHidden>, </VisuallyHidden>
          {n}
          <VisuallyHidden> {n === 1 ? "tarefa" : "tarefas"}</VisuallyHidden>
        </span>
        {blockedCount > 0 && (
          <span className={s.blocked}>
            <span aria-hidden="true">·</span>
            <VisuallyHidden>, </VisuallyHidden>
            <StatusGlyph status="blocked" size={12} color="inherit" />
            {blockedText(blockedCount)}
          </span>
        )}
      </Heading>
      {items.length > 0 && (
        <ul className={s.list}>
          {items.map((child, i) => (
            <li key={i}>{child}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
