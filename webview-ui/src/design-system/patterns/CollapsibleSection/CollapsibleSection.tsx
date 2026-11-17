import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import s from "./CollapsibleSection.module.css";

interface CollapsibleSectionProps {
  /** Aberta ou fechada — quem guarda o estado é quem usa a seção. */
  isOpen: boolean;
  onToggle: () => void;
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}

/**
 * Substituto controlado de `<details>` cru — o estado vive fora do DOM, então
 * sobrevive a qualquer patch do `CockpitStore`. Para persistir entre reloads
 * do painel, ligue no `usePersistedCollapse` do `store/`:
 * `const [isOpen, onToggle] = usePersistedCollapse("id-da-secao")`.
 * O design system não importa o `store/` (`ds-is-leaf`, F3.9), por isso a
 * seção recebe o estado em vez de lê-lo.
 */
export function CollapsibleSection({ isOpen, onToggle, title, right, children }: CollapsibleSectionProps) {
  return (
    <div className={s.wrap}>
      <button type="button" className={s.header} onClick={onToggle} aria-expanded={isOpen}>
        <span className={s.caret} data-open={isOpen}>
          <ChevronRight size={15} strokeWidth={2.25} />
        </span>
        <span className={s.title}>{title}</span>
        {right && <span className={s.right}>{right}</span>}
      </button>
      {isOpen && <div className={s.body}>{children}</div>}
    </div>
  );
}
