import type { DeckCommand } from "../../../../features/command-deck/commandCatalog";

/** Substring, sem acento-sensível nem fuzzy — previsível é melhor que "esperto" numa paleta pequena (dezenas de itens, não milhares). */
export function filterCommands(commands: DeckCommand[], query: string): DeckCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
}
