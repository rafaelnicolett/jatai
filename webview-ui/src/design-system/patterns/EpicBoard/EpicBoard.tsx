import { EmptyState } from "../EmptyState/EmptyState";
import { StatusColumn } from "../StatusColumn/StatusColumn";
import type { ColumnStatus } from "../StatusColumn/statusColumns";
import { TaskCard, type TaskCardCondition } from "../TaskCard/TaskCard";
import s from "./EpicBoard.module.css";

export interface BoardTaskView {
  key: string;
  /** O id curto do cartão ("task-1"). */
  id: string;
  title: string;
  /** Coluna onde o cartão mora. */
  column: ColumnStatus;
  /** Bloqueado e falhou ficam onde estão, com o motivo; cancelado vai para o Feito, riscado (ADR-0022 §7). */
  condition?: TaskCardCondition;
  meta?: string;
  /** O título vira botão de detalhes (o cartão inteiro nunca é botão). */
  onOpen?: () => void;
  /** A ação do cartão "espera você" ("Ver o que está em jogo"). */
  action?: { label: string; onClick: () => void; accessibleLabel?: string };
}

export interface BoardColumnView {
  status: ColumnStatus;
  tasks: BoardTaskView[];
  /** Cartões bloqueados ou que falharam nesta coluna: o cabeçalho ganha "· ⊘ 1 bloqueada". */
  blockedCount: number;
}

interface EpicBoardProps {
  /** id do painel (`aria-controls` das paradas e dos potes): "epic-board". */
  id: string;
  /** id da parada selecionada: o quadro é o `tabpanel` dela. Sem parada, é só uma região nomeada. */
  labelledBy?: string;
  title: string;
  description?: string;
  columns: BoardColumnView[];
  /** Quadro sem nenhum cartão: o que mostrar no lugar das colunas. */
  empty?: { title: string; body: string };
  /** Muda a cada evento de agente: o ● de "Trabalhando" respira numa rajada. */
  activityKey?: string;
}

/**
 * Quadro do épico do DS v2 (§4.5): título e descrição, e as 4 colunas
 * Fila ○ · Trabalhando ● · Espera você ■ · Feito ✓. O status bloqueado é
 * CONDIÇÃO do cartão, não uma 5ª coluna: o quadro mantém as 4 colunas que a
 * 720px ainda cabem.
 *
 * Landmark: `role="tabpanel"` da parada selecionada, com o único `h1` visível;
 * cada coluna é uma `<section>` com `h2` ("Fila, 3 tarefas") e uma lista; o
 * status vem do título da coluna e o bloqueio do texto do motivo.
 * Responsivo pela largura do próprio quadro (container query): 4 colunas a
 * partir de 760px, 2 × 2 de 420 a 759px e 1 abaixo.
 */
export function EpicBoard({ id, labelledBy, title, description, columns, empty, activityKey }: EpicBoardProps) {
  const label = labelledBy ? { role: "tabpanel" as const, "aria-labelledby": labelledBy } : { "aria-label": title || "Quadro" };
  return (
    <section id={id} className={s.board} {...label}>
      <header className={s.header}>
        <h1 className={s.title}>{title}</h1>
        {description && <p className={s.description}>{description}</p>}
      </header>
      {empty && <EmptyState variant="inline" title={empty.title} body={empty.body} headingLevel={2} />}
      <div className={s.grid}>
        {columns.map((col) => (
          <StatusColumn key={col.status} status={col.status} count={col.tasks.length} blockedCount={col.blockedCount} activityKey={col.status === "working" ? activityKey : undefined}>
            {col.tasks.map((t) => (
              <TaskCard key={t.key} id={t.id} title={t.title} variant={col.status} condition={t.condition} meta={t.meta} onOpen={t.onOpen} action={t.action} />
            ))}
          </StatusColumn>
        ))}
      </div>
    </section>
  );
}
