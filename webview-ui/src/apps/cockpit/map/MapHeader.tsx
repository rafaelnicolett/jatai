import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Info, List, Map as MapIcon, Moon, Pause, Play, Sun } from "lucide-react";
import { JataiMark } from "../../../design-system/brand/JataiMark";
import { Button } from "../../../design-system/primitives";
import { liveChip } from "./copy";
import type { MapMode, SceneVariant } from "./mapPrefs";
import s from "./MapHeader.module.css";

export interface InitiativeOption {
  id: string;
  name: string;
}

interface HeaderProps {
  /** A iniciativa que o mapa mostra, as outras e o que escolher uma delas faz. */
  initiative: { id: string | null; name: string | null; options: InitiativeOption[] };
  onSelectInitiative: (id: string) => void;
  /** "Execução · Epic 0 · Fundação": onde a iniciativa está agora. */
  where: string | null;
  working: number;
  waiting: number;
  paused: boolean;
  onTogglePause: () => void;
  mode: MapMode;
  onMode: (mode: MapMode) => void;
  variant: SceneVariant;
  onVariant: () => void;
  onBack: () => void;
  /** Só abaixo de 1080 px: a legenda vira um botão. */
  legendButton?: { open: boolean; onToggle: () => void };
}

/** Escolher a iniciativa do mapa (HS-02): um botão com um `listbox`, como o seletor do Cockpit. Trocar troca o mapa inteiro. */
function InitiativePicker({ initiative, onSwitch }: { initiative: HeaderProps["initiative"]; onSwitch: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent): void => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const name = initiative.name ?? "Sem iniciativa";
  if (initiative.options.length < 2) return <span className={s.initiativeName}>{name}</span>;

  return (
    <div className={s.picker} ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={s.pickerButton}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Iniciativa: ${name}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className={s.initiativeName}>{name}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <ul className={s.menu} role="listbox" aria-label="Iniciativas">
          {initiative.options.map((o) => (
            <li key={o.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={o.id === initiative.id}
                className={s.option}
                data-initiative={o.id}
                onClick={() => {
                  setOpen(false);
                  if (o.id !== initiative.id) onSwitch(o.id);
                  trigger.current?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOpen(false);
                    trigger.current?.focus();
                  }
                }}
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * O cabeçalho do mapa (DS v2 §4.8, MapHeader + LiveChip): o título, de onde a
 * iniciativa é, o chip "ao vivo" e as ações: Mapa | Lista, Pausar, a cena de
 * dia ou de noite e "Voltar ao Cockpit". Os botões ficam sobre a cena, com o
 * fundo do HUD.
 */
export function MapHeader(props: HeaderProps) {
  const { initiative, where, working, waiting, paused, mode, variant } = props;
  const chip = liveChip({ paused, waiting, working });
  return (
    <header className={s.header}>
      <div className={s.identity}>
        <div className={s.titleRow}>
          <span className={s.mark}>
            <JataiMark size={28} decorative />
          </span>
          <h1 className={s.title} tabIndex={-1} data-map-title>
            Mapa da colmeia
          </h1>
        </div>
        <nav className={s.where} aria-label="Onde a iniciativa está">
          <InitiativePicker initiative={initiative} onSwitch={props.onSelectInitiative} />
          {where && <span className={s.whereText}>· {where}</span>}
        </nav>
        <span className={s.live} role="status" data-live={chip.state}>
          <span className={s.dot} aria-hidden="true" />
          {chip.text}
        </span>
      </div>
      <div className={s.actions}>
        <div className={s.group} role="group" aria-label="Vista do mapa">
          <Button variant="secondary" size="md" pressed={mode === "scene"} icon={<MapIcon size={16} aria-hidden="true" />} onClick={() => props.onMode("scene")}>
            Mapa
          </Button>
          <Button variant="secondary" size="md" pressed={mode === "list"} icon={<List size={16} aria-hidden="true" />} onClick={() => props.onMode("list")}>
            Lista
          </Button>
        </div>
        <Button variant="secondary" size="md" pressed={paused} icon={paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />} onClick={props.onTogglePause}>
          {paused ? "Retomar" : "Pausar"}
        </Button>
        {mode === "scene" && (
          <Button variant="secondary" size="md" pressed={variant === "day"} icon={variant === "day" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />} onClick={props.onVariant}>
            {variant === "day" ? "Dia" : "Noite"}
          </Button>
        )}
        {props.legendButton && mode === "scene" && (
          <Button variant="secondary" size="md" pressed={props.legendButton.open} aria-expanded={props.legendButton.open} icon={<Info size={16} aria-hidden="true" />} onClick={props.legendButton.onToggle}>
            Como ler
          </Button>
        )}
        <Button variant="accent" size="md" icon={<ArrowLeft size={16} aria-hidden="true" />} onClick={props.onBack}>
          Voltar ao Cockpit
        </Button>
      </div>
    </header>
  );
}
