/**
 * notificationActions.ts — Onda 2: marca a central de notificações como
 * vista. Só grava um timestamp em `globalState` (nenhum YAML é tocado); o
 * próximo snapshot recalcula `notificationsLastSeenAt` a partir dele, e como
 * esse campo entra no hash do snapshot, o push acontece mesmo sem nenhuma
 * mudança em disco — o contador de não-lidas zera na hora.
 */

import type { CommandHandler } from "./CommandHandler";
import { BRAND } from "../../data/brand.pure";

/** Chave de `globalState` — única fonte, lida também por `CockpitNextController` ao montar o snapshot. */
export const NOTIFICATIONS_LAST_SEEN_KEY = `${BRAND.name}.notifications.lastSeenAt`;

export const notificationsMarkSeenHandler: CommandHandler = {
  type: "notifications/markSeen",
  async handle(_msg, ctx) {
    await ctx.extensionContext.globalState.update(NOTIFICATIONS_LAST_SEEN_KEY, new Date().toISOString());
    await ctx.requestRefresh();
  },
};
