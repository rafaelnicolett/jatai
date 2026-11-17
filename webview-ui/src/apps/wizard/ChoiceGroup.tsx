import type { KeyboardEvent, ReactNode } from "react";
import { Badge, ChoiceCard } from "../../design-system/primitives";
import { nextRadioIndex } from "./journey";
import s from "./Wizard.module.css";

export interface ChoiceOption {
  value: string;
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: string;
}

interface ChoiceGroupProps {
  /** `id` do elemento que dá o nome ao grupo (a legenda visível). */
  labelledBy: string;
  options: readonly ChoiceOption[];
  value: string | undefined;
  onChange(value: string): void;
  columns?: 2 | 3 | 4;
  /** Marca o grupo no DOM (`data-wizard-group`), para os testes e as capturas. */
  name?: string;
}

/**
 * Grupo de cartões de escolha única, com a semântica de `radiogroup` (F4.3):
 * um só cartão na ordem de Tab (o marcado, ou o primeiro quando nada está
 * marcado) e as setas movem e marcam, como no padrão ARIA. Home e End vão às
 * pontas e as setas dão a volta. O dono do grupo é quem cuida do tabindex
 * itinerante, como a `ChoiceCard` documenta.
 */
export function ChoiceGroup({ labelledBy, options, value, onChange, columns = 2, name }: ChoiceGroupProps) {
  const checked = options.findIndex((o) => o.value === value);
  const tabStop = checked >= 0 ? checked : 0;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const current = radios.findIndex((el) => el === document.activeElement);
    const to = nextRadioIndex(radios.length, current < 0 ? tabStop : current, e.key);
    if (to === null) return;
    e.preventDefault();
    radios[to]!.focus();
    onChange(options[to]!.value);
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={s.cards} data-columns={columns} data-wizard-group={name} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <ChoiceCard
          key={o.value}
          mode="radio"
          data-wizard-option={o.value}
          tabIndex={i === tabStop ? 0 : -1}
          selected={i === checked}
          onClick={() => onChange(o.value)}
          icon={o.icon}
          title={o.label}
          description={o.description}
          meta={o.badge ? <Badge tone="neutral">{o.badge}</Badge> : undefined}
        />
      ))}
    </div>
  );
}
