import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import type { EpicStopStatus } from "../EpicStop/epicStopName";
import { useRovingTabs } from "../PhaseTrack/useRovingTabs";
import s from "./EpicPotList.module.css";

export interface PotView {
  key: string;
  n: number;
  /** "Fundação". O número e a palavra ("Epic 0 ·") vêm de `n` e `unit`. */
  label: string;
  /** 0–100, derivado de tarefas fechadas sobre o total; `null` quando o estado não permite contar. */
  progress: number | null;
  /** "18% · em andamento". */
  tag: string;
  status: EpicStopStatus;
  unit: string;
}

interface EpicPotListProps {
  pots: PotView[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Rótulo da `<nav>` ("Épicos"). */
  ariaLabel: string;
  /** Eyebrow da lista ("Potes · 9 épicos"). */
  heading: string;
  /** id do painel que a seleção controla ("epic-board"). */
  controls: string;
  /** `shelf`: prateleira horizontal com rolagem (painel dividido, §3.12). */
  layout?: "list" | "shelf";
}

const STATUS_TEXT: Partial<Record<EpicStopStatus, string>> = { done: "concluído", you: "decisão esperando você", blocked: "bloqueado", working: "em andamento", future: "depois" };

/** O pote: tampa, corpo com borda e o mel na altura do progresso, com o menisco de 2px. Sempre decorativo. */
function PotGlyph({ progress }: { progress: number | null }) {
  const pct = progress === null ? 0 : Math.min(100, Math.max(0, progress));
  return (
    <span className={s.glyph} aria-hidden="true">
      <span className={s.lid} />
      <span className={s.body}>
        <span className={s.honey} data-meniscus={pct > 0 && pct < 100 ? true : undefined} style={{ height: `${pct}%` }} />
      </span>
    </span>
  );
}

/**
 * Lista de potes do DS v2 (§4.4): o progresso de cada épico como pote de mel
 * que enche; também escolhe o épico do quadro.
 *
 * - `<nav aria-label>` com uma `<ul>` de botões; o pote é `aria-hidden`;
 * - nome: "Epic 0 · Fundação, 18% concluído, em andamento", com `aria-controls`;
 * - o selecionado leva `aria-current="true"`, borda de 2px `--jt-selected`
 *   (sem deslocar o texto) e rótulo em 600: seleção é escolha humana, o mel
 *   fica para "trabalhando";
 * - teclado: Tab entra na lista, ↑/↓ movem o foco (tabindex itinerante) e
 *   Enter ou Espaço selecionam.
 */
export function EpicPotList({ pots, selectedKey, onSelect, ariaLabel, heading, controls, layout = "list" }: EpicPotListProps) {
  const roving = useRovingTabs(
    pots.map((p) => p.key),
    selectedKey,
    onSelect,
    layout === "shelf" ? "horizontal" : "vertical",
    "manual"
  );

  return (
    <nav className={s.nav} aria-label={ariaLabel} data-layout={layout}>
      <span className={s.heading}>{heading}</span>
      <ul className={s.list}>
        {pots.map((pot) => {
          const selected = pot.key === selectedKey;
          const state = STATUS_TEXT[pot.status];
          const name = [`${pot.unit} ${pot.n} · ${pot.label}`, pot.progress === null ? null : `${Math.round(pot.progress)}% concluído`, state].filter(Boolean).join(", ");
          return (
            <li key={pot.key}>
              <button
                type="button"
                ref={roving.register(pot.key)}
                className={s.pot}
                data-selected={selected || undefined}
                aria-current={selected ? "true" : undefined}
                aria-controls={controls}
                aria-label={name}
                tabIndex={roving.tabIndexFor(pot.key)}
                onFocus={roving.onFocus(pot.key)}
                onKeyDown={roving.onKeyDown(pot.key)}
                onClick={() => onSelect(pot.key)}
              >
                <PotGlyph progress={pot.progress} />
                <span className={s.text} aria-hidden="true">
                  <span className={s.label}>
                    {pot.unit} {pot.n} · {pot.label}
                  </span>
                  <span className={s.tag}>{pot.tag}</span>
                </span>
                {pot.status === "done" && <StatusGlyph status="done" size={14} className={s.mark} />}
                {pot.status === "you" && <StatusGlyph status="you" size={10} className={s.mark} />}
                {pot.status === "blocked" && <StatusGlyph status="blocked" size={12} className={s.mark} />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
