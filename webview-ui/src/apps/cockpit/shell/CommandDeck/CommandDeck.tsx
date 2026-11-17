import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { DeckCommand } from "../../../../features/command-deck/commandCatalog";
import { filterCommands } from "./filterCommands";
import s from "./CommandDeck.module.css";

interface CommandDeckProps {
  commands: DeckCommand[];
  run: (id: string) => void;
  /** Aberto ou não: controlado pela casca, para o botão ⌘K da barra superior abrir a mesma paleta (F4.2). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Onda 5 (Mecanismo E parcial — "combinar" fica pro Canvas dividido) —
 * ⌘K/Ctrl+K sobre um catálogo que já existia (ver `commandCatalog.ts`).
 * Fica montado sempre (dentro de `AppShell`), só decide sozinho quando abrir
 * — igual `NotificationCenter` (Onda 2), nenhum estado global novo pra
 * "paleta aberta".
 */
export function CommandDeck({ commands, run, open, onOpenChange }: CommandDeckProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();

  /** Fechar zera a busca: a próxima abertura (⌘K ou o botão da barra) começa limpa. */
  const setOpen = (next: boolean): void => {
    if (!next) {
      setQuery("");
      setSelected(0);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          setQuery("");
          setSelected(0);
        }
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        setQuery("");
        setSelected(0);
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    // Quem tinha o foco ao abrir (o botão ⌘K da barra, ou o corpo da página) é para onde ele volta ao fechar.
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Foco só depois do paint — o input acabou de montar quando `open` virou true.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      opener.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const filtered = filterCommands(commands, query);

  const runSelected = (index: number): void => {
    const cmd = filtered[index];
    if (!cmd) return;
    run(cmd.id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runSelected(selected);
    }
  };

  let rowIndex = -1;

  return (
    <div className={s.backdrop} onClick={() => setOpen(false)}>
      <div className={s.panel} role="dialog" aria-label="Paleta de comandos" onClick={(e) => e.stopPropagation()}>
        <div className={s.searchRow}>
          <Search size={16} strokeWidth={2} className={s.searchIcon} />
          <input
            ref={inputRef}
            className={s.input}
            role="combobox"
            aria-label="Buscar comando"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={filtered[selected] ? `${listId}-${filtered[selected]!.id}` : undefined}
            placeholder="Digite um comando…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
          />
          <kbd className={s.kbd}>Esc</kbd>
        </div>
        <div className={s.list} id={listId} role="listbox" aria-label="Comandos">
          {filtered.length === 0 && <p className={s.empty} role="status">Nenhum comando bate com "{query}".</p>}
          {Object.entries(groupBy(filtered)).map(([group, items]) => (
            <div key={group} className={s.group} role="group" aria-label={group}>
              <span className={s.groupLabel} aria-hidden="true">{group}</span>
              {items.map((cmd) => {
                rowIndex++;
                const idx = rowIndex;
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    id={`${listId}-${cmd.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === selected}
                    tabIndex={-1}
                    className={s.row}
                    data-active={idx === selected}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => runSelected(idx)}
                  >
                    <Icon size={15} strokeWidth={2} className={s.rowIcon} />
                    <span className={s.rowLabel}>{cmd.label}</span>
                    {cmd.hint && <span className={s.rowHint}>{cmd.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupBy(commands: DeckCommand[]): Record<string, DeckCommand[]> {
  const out: Record<string, DeckCommand[]> = {};
  for (const cmd of commands) {
    (out[cmd.group] ??= []).push(cmd);
  }
  return out;
}
