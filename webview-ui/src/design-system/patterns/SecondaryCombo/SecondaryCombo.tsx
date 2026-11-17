import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, type LucideIcon } from "lucide-react";
import type { PlanItemStatus } from "@data";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import s from "./SecondaryCombo.module.css";

export interface SecondaryComboOption {
  key: string;
  label: string;
  meta?: string;
  status?: PlanItemStatus;
}

export type SecondaryComboTone = "accent" | "danger" | "violet";

interface SecondaryComboProps {
  icon: LucideIcon;
  tone: SecondaryComboTone;
  /** Rótulo grande do gatilho — ex.: "Sprint 3 de 5", "helyx-vscode", "Wave 2 de 3". */
  activeLabel: string;
  activeMeta?: string;
  /** Ex.: "@refactor-agent rodando" — mesmo idioma de "ao vivo" do resto do Cockpit. */
  liveHint?: string;
  options: SecondaryComboOption[];
  activeKey: string;
  onSelect: (key: string) => void;
  emptyLabel?: string;
}

/**
 * Combo secundário genérico (wave-3, `mod-cockpit-flow-model`) — mesma
 * mecânica do combo de Iniciativas em `ContextBar.tsx` (open/close/
 * click-outside), 3 vocabulários diferentes por cima do mesmo componente:
 * Discovery → Repositórios, Feature (Downstream) → Sprints, Hotfix/
 * Modernização → Ondas. Nunca decide o quê listar — só apresenta o que o
 * chamador já resolveu (`options`/`activeKey`).
 */
export function SecondaryCombo({ icon: Icon, tone, activeLabel, activeMeta, liveHint, options, activeKey, onSelect, emptyLabel }: SecondaryComboProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (options.length === 0) {
    return (
      <div className={s.combo} data-tone={tone} style={{ cursor: "default" }}>
        <span className={s.icon} data-tone={tone}>
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className={s.body}>
          <span className={s.label}>{emptyLabel ?? activeLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap} ref={wrapRef}>
      <button type="button" className={[s.combo, open && s["combo--open"]].filter(Boolean).join(" ")} data-tone={tone} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={s.icon} data-tone={tone}>
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className={s.body}>
          <span className={s.label}>{activeLabel}</span>
          {liveHint ? (
            <span className={s.liveMeta}>
              <span className={`${s.liveDot} hx-pulse`} data-tone={tone} /> {liveHint}
            </span>
          ) : (
            activeMeta && <span className={s.meta}>{activeMeta}</span>
          )}
        </div>
        <ChevronDown size={16} strokeWidth={2} className={s.chev} />
      </button>

      {open && (
        <div className={s.menu} role="listbox">
          {options.map((opt) => {
            const isActive = opt.key === activeKey;
            return (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={isActive}
                className={[s.menuItem, isActive && s["menuItem--active"]].filter(Boolean).join(" ")}
                onClick={() => { onSelect(opt.key); setOpen(false); }}
              >
                <span className={s.menuBody}>
                  <span className={s.menuName}>{opt.label}</span>
                  {opt.meta && <span className={s.menuMeta}>{opt.meta}</span>}
                </span>
                {opt.status && <StatusBadge status={opt.status} compact />}
                {isActive && <Check size={14} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
