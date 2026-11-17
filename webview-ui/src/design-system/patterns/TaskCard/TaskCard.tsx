import { useId, type ReactNode } from "react";
import { Button } from "../../primitives/Button/Button";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { describeWorkStatus } from "../../status/workStatus";
import s from "./TaskCard.module.css";

/** Coluna onde o card mora (§4.5): Fila, Trabalhando, Espera você, Feito. */
export type TaskCardVariant = "queue" | "working" | "you" | "done";

/**
 * Condição do card (ADR-0022 §7): bloqueado e falhou não são coluna, o card
 * fica onde está com o motivo; cancelado vai para o grupo dos fechados,
 * riscado, com o motivo.
 */
export interface TaskCardCondition {
  kind: "blocked" | "failed" | "cancelled";
  reason: string;
}

interface TaskCardProps {
  /** Id da tarefa ("T0.2"). */
  id: string;
  title: string;
  variant: TaskCardVariant;
  /** Quem faz ou de quem depende ("@migration-agent"). */
  meta?: ReactNode;
  condition?: TaskCardCondition;
  /** Tempo no estado ("há 12 min"). */
  elapsed?: string;
  /** O título vira botão de detalhes (o card inteiro nunca é botão, para não aninhar controles). */
  onOpen?: () => void;
  /** Ação do card "espera você" ("Ver o que está em jogo"), com nome completo opcional. */
  action?: { label: string; onClick: () => void; accessibleLabel?: string };
  headingLevel?: 3 | 4;
}

/**
 * TaskCard do DS v2 (§4.5). Variantes por coluna; a condição (bloqueado,
 * falhou, cancelado) muda a borda, põe o glifo antes do id e mostra o
 * motivo em texto. Entra com fade de --jt-dur-base ao mudar de coluna.
 */
export function TaskCard({ id, title, variant, meta, condition, elapsed, onOpen, action, headingLevel = 3 }: TaskCardProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const Heading = headingLevel === 4 ? "h4" : "h3";
  return (
    <article
      className={s.card}
      data-variant={variant}
      data-condition={condition?.kind}
      data-interactive={onOpen ? true : undefined}
      aria-labelledby={titleId}
    >
      <div className={s.top}>
        <span className={s.id}>
          {condition && <StatusGlyph status={condition.kind} size={12} />}
          {id}
        </span>
        {elapsed && <span className={s.elapsed}>{elapsed}</span>}
      </div>
      <Heading className={s.title} id={titleId}>
        {onOpen ? (
          <button type="button" className={s.titleButton} onClick={onOpen}>
            {title}
          </button>
        ) : (
          title
        )}
      </Heading>
      {meta && <p className={s.meta}>{meta}</p>}
      {condition && <p className={s.reason}>{describeWorkStatus(condition.kind, condition.reason)}</p>}
      {action && (
        <div className={s.actions}>
          <Button variant="you" size="sm" aria-label={action.accessibleLabel} onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </article>
  );
}
