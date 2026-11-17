import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, type LucideIcon } from "lucide-react";
import s from "./InitiativeSwitcher.module.css";

export interface SwitcherOption {
  key: string;
  label: string;
  meta?: string;
  icon: LucideIcon;
  /** "Workspace" (a Descoberta) ou "Iniciativas": as duas seções do menu (DS v2 §4.1). */
  section: string;
}

interface InitiativeSwitcherProps {
  /** O que a tela mostra agora. */
  label: string;
  meta?: string;
  icon: LucideIcon;
  /** Nome acessível do botão: "Iniciativa: Missão Open Source, modernização". */
  accessibleName: string;
  options: SwitcherOption[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onNew: () => void;
}

/**
 * Seletor de iniciativa do DS v2 (§4.1): pílula que abre um `listbox` com
 * "Workspace › Descoberta", as iniciativas e "+ Nova iniciativa".
 *
 * Navegar é só visão (G15): escolher uma opção troca o que a tela mostra, nunca
 * o `active:` do registro. Teclado: Enter, Espaço ou ↓ abrem; ↑/↓ movem; Home
 * e End vão às pontas; digitar busca pelo nome; Enter seleciona; Esc fecha e
 * devolve o foco ao botão.
 */
export function InitiativeSwitcher({ label, meta, icon: Icon, accessibleName, options, activeKey, onSelect, onNew }: InitiativeSwitcherProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typed = useRef({ text: "", at: 0 });

  const focusOption = (i: number): void => {
    const count = options.length;
    if (count === 0) return;
    optionRefs.current[(i + count) % count]?.focus();
  };

  // Ao abrir, o foco vai para a opção ativa (ou a primeira).
  useEffect(() => {
    if (!open) return;
    const active = Math.max(0, options.findIndex((o) => o.key === activeKey));
    optionRefs.current[active]?.focus();
  }, [open, options, activeKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const current = optionRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusOption(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusOption(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusOption(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusOption(options.length - 1);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== " ") {
      // Busca por digitação: as letras seguidas em até meio segundo formam o prefixo.
      const now = e.timeStamp;
      typed.current = { text: (now - typed.current.at > 500 ? "" : typed.current.text) + e.key.toLowerCase(), at: now };
      const start = typed.current.text.length > 1 ? current : current + 1;
      for (let step = 0; step < options.length; step++) {
        const i = (start + step + options.length) % options.length;
        if (options[i]!.label.toLowerCase().startsWith(typed.current.text)) {
          focusOption(i);
          break;
        }
      }
    }
  };

  const sections = [...new Set(options.map((o) => o.section))];

  return (
    <div className={s.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={s.trigger}
        data-open={open || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-label={accessibleName}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
        <span className={s.name}>{label}</span>
        {meta && (
          <span className={s.meta} aria-hidden="true">
            {meta}
          </span>
        )}
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div className={s.menu}>
          <div id={`${uid}-list`} role="listbox" aria-label="Iniciativa" onKeyDown={onListKey}>
            {sections.map((section) => (
              <div key={section} role="group" aria-label={section}>
                <div className={s.section} aria-hidden="true">
                  {section}
                </div>
                {options
                  .filter((o) => o.section === section)
                  .map((o) => {
                    const index = options.indexOf(o);
                    const selected = o.key === activeKey;
                    return (
                      <button
                        key={o.key}
                        ref={(el) => {
                          optionRefs.current[index] = el;
                        }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        tabIndex={-1}
                        className={s.option}
                        data-selected={selected || undefined}
                        onClick={() => {
                          onSelect(o.key);
                          close();
                        }}
                      >
                        <o.icon size={14} strokeWidth={2} aria-hidden="true" />
                        <span className={s.optionBody}>
                          <span className={s.optionName}>{o.label}</span>
                          {o.meta && <span className={s.optionMeta}>{o.meta}</span>}
                        </span>
                        {selected && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          <button
            type="button"
            className={s.newButton}
            onClick={() => {
              onNew();
              setOpen(false);
            }}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" /> Nova iniciativa
          </button>
        </div>
      )}
    </div>
  );
}
