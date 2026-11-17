import type { LucideIcon } from "lucide-react";
import s from "./StatChips.module.css";

export type StatChipTone = "accent" | "violet" | "danger" | "running" | "neutral";

export interface StatChipItem {
  icon?: LucideIcon;
  value: number | string;
  label: string;
  tone?: StatChipTone;
}

interface StatChipsProps {
  items: StatChipItem[];
}

/**
 * Tira de pílulas "N + rótulo" — mesmo estilo visual dos pills de
 * `AttentionBar` ("0 rodando agora"), reaproveitado aqui de propósito em vez
 * de inventado do zero, pra ler como o mesmo idioma da linguagem visual do
 * app, não um chip novo e mais fraco. Nasceu de um pedido do usuário: os
 * dois níveis de combo (`ContextBar` e `SecondaryCombo`) tinham uma faixa
 * vazia ao lado — aqui "aproveita o espaço" com um resumo agregado da
 * CAMADA (todas as iniciativas, ou todas as ondas/sprints/repos de UMA
 * iniciativa), nunca repetindo o item que já está selecionado no combo ao
 * lado.
 */
export function StatChips({ items }: StatChipsProps) {
  if (items.length === 0) return null;
  return (
    <div className={s.row}>
      {items.map((item, i) => (
        <span key={i} className={s.chip} data-tone={item.tone}>
          {item.icon && <item.icon size={15} strokeWidth={2} className={s.icon} />}
          <span className={s.value}>{item.value}</span>
          <span className={s.label}>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
