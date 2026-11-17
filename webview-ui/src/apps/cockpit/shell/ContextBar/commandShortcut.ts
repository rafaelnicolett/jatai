/** "⌘K" no macOS e "Ctrl K" no Windows e no Linux (DS v2 §4.1). */
export function commandShortcutLabel(platform: string): string {
  return /Mac|iPhone|iPad/i.test(platform) ? "⌘K" : "Ctrl K";
}
