import { useState } from "react";
import type { PlanItemStatus } from "@data";
import { Button } from "../../primitives";
import { ElapsedTimeChip } from "../ElapsedTimeChip/ElapsedTimeChip";
import { Modal } from "../Modal/Modal";
import { boardCardModalFields } from "./boardCardModalFields";
import s from "./PhaseBoard.module.css";

export interface BoardCard<L extends string = PlanItemStatus> {
  key: string;
  /** Curto, mono, canto do card — ex.: "S1-BKD-02", "prd.md", "crítico". */
  id: string;
  title: string;
  /** Qual coluna o card cai. */
  lane: L;
  /** Cor da borda esquerda. Default = `lane` quando `L` é `PlanItemStatus`. */
  status?: PlanItemStatus;
  /** Rodapé — dono decide o conteúdo (timestamp, agente, motivo de bloqueio). Ignorado quando `since` ou `approve` estão presentes. */
  meta?: string;
  /** Presente → rodapé vira `ElapsedTimeChip`. */
  since?: string;
  /** Presente → rodapé vira botão "Aprovar" (+ checkbox de fricção opcional). */
  approve?: {
    onApprove: () => void;
    disabled?: boolean;
    friction?: {
      label: string;
      acknowledged: boolean;
      onAcknowledgedChange: (acknowledged: boolean) => void;
    };
  };
  /** Detalhes extras só exibidos no modal (nunca no rodapé compacto) — de `WaveItemStatusEntry.commit`/`artifacts`/`known_bugs_pinned`, quando o adapter os repassa. Opcional: nenhum card antigo quebra sem isto. */
  details?: {
    commit?: string;
    artifacts?: string[];
    knownBugs?: string[];
  };
}

export interface BoardLane<L extends string = PlanItemStatus> {
  key: L;
  label: string;
}

interface PhaseBoardProps<L extends string = PlanItemStatus> {
  lanes: BoardLane<L>[];
  cards: BoardCard<L>[];
}

function CardFooter<L extends string>({ card }: { card: BoardCard<L> }) {
  if (card.approve) {
    const { onApprove, disabled, friction } = card.approve;
    const blocked = !!friction && !friction.acknowledged;
    return (
      <div className={s.approveWrap}>
        {friction && (
          <label className={s.frictionLabel}>
            <input
              type="checkbox"
              checked={friction.acknowledged}
              onChange={(e) => friction.onAcknowledgedChange(e.target.checked)}
            />
            {friction.label}
          </label>
        )}
        <Button variant="primary" size="sm" disabled={disabled || blocked} onClick={onApprove}>
          Aprovar
        </Button>
      </div>
    );
  }
  if (card.since) return <ElapsedTimeChip since={card.since} />;
  if (card.meta) return <span className={s.meta}>{card.meta}</span>;
  return null;
}

/**
 * Board genérico: SEMPRE as colunas inteiras (`lanes`), mesmo as vazias —
 * mostra o quadro completo, não só o pedaço que já tem card, pra dar a
 * visão do fluxo inteiro (pra onde cada coisa vai) de um só olhar. Uma
 * coluna sem card mostra "0" e fica vazia — isso também é informação (ex.:
 * "nada bloqueado agora"). Não sabe nada sobre formato de iniciativa
 * (greenfield/Discovery/Modernization); isso vive inteiramente nos adapters
 * que constroem `BoardCard[]`.
 */
export function PhaseBoard<L extends string = PlanItemStatus>({ lanes, cards }: PhaseBoardProps<L>) {
  const byLane = new Map<L, BoardCard<L>[]>();
  for (const card of cards) byLane.set(card.lane, [...(byLane.get(card.lane) ?? []), card]);

  // Chave do card com o modal de detalhe aberto — `null` = nenhum. Vive aqui
  // (não em cada card) porque só um modal pode estar aberto por vez.
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);
  const openCard = cards.find((c) => c.key === openCardKey) ?? null;

  return (
    <div className={s.board}>
      {lanes.map((lane) => {
        const laneCards = byLane.get(lane.key) ?? [];
        return (
          <div key={lane.key} className={s.column}>
            <div className={s.columnHead}>
              <span>{lane.label}</span>
              <span className={s.count}>{laneCards.length}</span>
            </div>
            <div className={s.cards}>
              {laneCards.length === 0 && <div className={s.emptyColumn} />}
              {laneCards.map((card) => (
                <div
                  key={card.key}
                  className={[s.card, s[`card--${card.status ?? card.lane}`]].filter(Boolean).join(" ")}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenCardKey(card.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenCardKey(card.key);
                    }
                  }}
                >
                  <div className={s.cardId}>{card.id}</div>
                  <div className={s.cardTitle}>{card.title}</div>
                  {/* `stopPropagation` — clicar em "Aprovar"/checkbox de fricção nunca deve abrir o modal por cima da ação. */}
                  <div className={s.cardFoot} onClick={(e) => e.stopPropagation()}>
                    <CardFooter card={card} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {openCard && (
        <Modal open eyebrow={openCard.id} title={openCard.title} onClose={() => setOpenCardKey(null)}>
          {boardCardModalFields(openCard).map((field) => (
            <div key={field.label} className={s.modalField}>
              <span className={s.modalFieldLabel}>{field.label}</span>
              <span className={s.modalFieldValue}>{field.value}</span>
            </div>
          ))}
          {openCard.approve && (
            <div className={s.modalApprove}>
              <CardFooter card={openCard} />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
