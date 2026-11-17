import { useRef, useState, type KeyboardEvent } from "react";

/**
 * Tabindex itinerante (DS v2 §4.2 e §4.4): só um item fica na ordem de
 * tabulação e as setas movem o foco. Home e End vão às pontas.
 *
 * - `activation: "automatic"` (a trilha, que é um tablist): a seta também
 *   seleciona o item;
 * - `activation: "manual"` (a lista de potes): a seta só move o foco e
 *   Enter ou Espaço selecionam, como num botão.
 *
 * `orientation` escolhe as setas: horizontal (←/→) ou vertical (↑/↓). A outra
 * direção não é capturada, para não roubar a rolagem da página.
 */
export function useRovingTabs(
  keys: string[],
  selected: string | null,
  onSelect: (key: string) => void,
  orientation: "horizontal" | "vertical" = "horizontal",
  activation: "automatic" | "manual" = "automatic"
) {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const fallback = selected && keys.includes(selected) ? selected : (keys[0] ?? null);
  // Ativação automática: a seleção segue o foco, então o item da tabulação é o selecionado.
  const tabbable = activation === "manual" && focused && keys.includes(focused) ? focused : fallback;

  const move = (to: string): void => {
    setFocused(to);
    if (activation === "automatic") onSelect(to);
    refs.current[to]?.focus();
  };

  return {
    /** Passe como `ref` do elemento do item `key`. */
    register: (key: string) => (el: HTMLElement | null): void => {
      refs.current[key] = el;
    },
    tabIndexFor: (key: string): 0 | -1 => (key === tabbable ? 0 : -1),
    onFocus: (key: string) => (): void => setFocused(key),
    onKeyDown: (key: string) => (e: KeyboardEvent<HTMLElement>): void => {
      const i = keys.indexOf(key);
      const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
      const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      let to: string | undefined;
      if (e.key === next) to = keys[(i + 1) % keys.length];
      else if (e.key === prev) to = keys[(i - 1 + keys.length) % keys.length];
      else if (e.key === "Home") to = keys[0];
      else if (e.key === "End") to = keys[keys.length - 1];
      if (to === undefined) return;
      e.preventDefault();
      move(to);
    },
  };
}
