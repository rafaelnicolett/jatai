import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import s from "./KPITile.module.css";

export type KPITone = "accent" | "success" | "warning" | "danger" | "info" | "violet";

interface KPITileTrend {
  direction: "up" | "down";
  label: string;
}

interface KPITileProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: KPITone;
  /** Só passar quando houver dado real de variação — nunca inventar uma tendência. */
  trend?: KPITileTrend;
  onClick?: () => void;
}

function Inner({ icon: Icon, value, label, tone, trend }: Required<Pick<KPITileProps, "icon" | "value" | "label">> & Pick<KPITileProps, "tone" | "trend">) {
  return (
    <>
      <div className={s.top}>
        <div className={s.iconBadge} data-tone={tone}>
          <Icon size={18} strokeWidth={2} />
        </div>
        {trend && (
          <span className={s.trend} data-direction={trend.direction}>
            {trend.direction === "up" ? <TrendingUp size={13} strokeWidth={2.25} /> : <TrendingDown size={13} strokeWidth={2.25} />}
            {trend.label}
          </span>
        )}
      </div>
      <span className={s.value}>{value}</span>
      <span className={s.label}>{label}</span>
    </>
  );
}

/** Número + rótulo com identidade visual (faixa colorida, badge de ícone, tendência) — o bloco básico dos strips de KPI. */
export function KPITile({ label, value, icon, tone = "accent", trend, onClick }: KPITileProps) {
  if (onClick) {
    return (
      <button type="button" className={s.tile} data-tone={tone} data-clickable="true" onClick={onClick}>
        <Inner icon={icon} value={value} label={label} tone={tone} trend={trend} />
      </button>
    );
  }
  return (
    <div className={s.tile} data-tone={tone}>
      <Inner icon={icon} value={value} label={label} tone={tone} trend={trend} />
    </div>
  );
}
