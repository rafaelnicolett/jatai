import type { ShortcutAction } from "@data";
import { postMessage } from "./vscodeApi";

/**
 * Dispatch único para qualquer `ShortcutAction` — Command Deck
 * (`features/command-deck/commandCatalog.ts`) e painel de Operações
 * (`features/operations/OperationsView.tsx`, ver `OPERATIONS_N1_ACTIONS`)
 * usam o mesmo, nunca uma cópia que pode divergir. Mora no `store/` (a ponte
 * com o host) e não numa das duas features: uma feature não importa outra
 * (`no-cross-feature`, F3.9). O ícone de cada atalho fica no design system
 * (`design-system/shortcutIcons.ts`).
 */
export function dispatchShortcutAction(action: ShortcutAction): void {
  if (action.kind === "command" && action.command) postMessage({ type: "runCommand", command: action.command });
  else if (action.kind === "prompt" && action.prompt) postMessage({ type: "injectRaw", prompt: action.prompt });
  else if (action.kind === "refresh") postMessage({ type: "refresh" });
}
