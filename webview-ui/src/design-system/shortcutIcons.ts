import { RefreshCw, ArrowUpCircle, FolderOpen, RotateCw, MessageSquare, UserPlus, CircleHelp, type LucideIcon } from "lucide-react";
import type { ShortcutIconSlug } from "@data";

/**
 * Ícone de cada `ShortcutAction` (o catálogo em `@data` guarda só o slug, para
 * não acoplar o núcleo a `lucide-react`). Command Deck e painel de Operações
 * usam o mesmo mapa. Veio de `features/command-deck/shortcutDispatch.ts`
 * (F3.9): é vocabulário visual compartilhado, então mora no design system,
 * como o `phaseIcons.tsx`.
 */
export const ICON_BY_SLUG: Record<ShortcutIconSlug, LucideIcon> = {
  "refresh-cw": RefreshCw,
  "arrow-up-circle": ArrowUpCircle,
  "folder-open": FolderOpen,
  "rotate-cw": RotateCw,
  "message-square": MessageSquare,
  "user-plus": UserPlus,
  "help-circle": CircleHelp,
};
