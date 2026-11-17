import type { ReactNode } from "react";
import s from "./ProgressLayout.module.css";

interface ProgressLayoutProps {
  /** Faixa acima das colunas (barra de atenção, abas de estágio). Opcional. */
  top?: ReactNode;
  /** Coluna principal: mapa, board, painéis. Ocupa o espaço que sobrar. */
  children: ReactNode;
  /**
   * Coluna lateral de 320px (some abaixo de 1100px), em geral o
   * `RepoEventsLog`. `undefined` = sem coluna (a vista por ondas abre mão dela
   * para dar largura ao board); `null` = coluna presente e vazia.
   */
  aside?: ReactNode;
}

/**
 * Layout das telas de progresso (Descoberta, fluxo de fases, vista por
 * ondas): faixa opcional no topo, coluna principal e coluna lateral de
 * eventos. Antes era um CSS Module de `live-progress` importado também por
 * `delivery` (D11); agora as duas features usam este pattern.
 */
export function ProgressLayout({ top, children, aside }: ProgressLayoutProps) {
  return (
    <div className={s.wrap}>
      {top}
      <div className={s.layout}>
        <div className={s.main}>{children}</div>
        {aside !== undefined && <div className={s.eventsColumn}>{aside}</div>}
      </div>
    </div>
  );
}
