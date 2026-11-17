import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bell, Ban, CircleCheck, Hand, ShieldCheck, type LucideIcon } from "lucide-react";
import type { CockpitNotification, NotificationKind } from "@shared/cockpit-protocol";
import { BRAND } from "@data";
import { postMessage } from "../../../../store/vscodeApi";
import { formatRelativeTime } from "./formatRelativeTime";
import { Button } from "../../../../design-system/primitives";
import s from "./NotificationCenter.module.css";

interface NotificationCenterProps {
  notifications: CockpitNotification[];
  lastSeenAt: string | null;
  /** Decisões que esperam o operador (DS v2 §4.1): o ponto acende e o nome do botão diz quantas. */
  pendingDecisions?: number;
  /** Kit desatualizado: o aviso do antigo rodapé, com a ação de migrar. */
  kitNotice?: { installed: string; current: string } | null;
}

const ICON_BY_KIND: Record<NotificationKind, LucideIcon> = {
  "gate-approved": CircleCheck,
  "item-approved": ShieldCheck,
  blocked: Ban,
  "agent-done": Hand,
};

/**
 * Sino no ContextBar (Onda 2) — o toast do `ToastLayer` é efêmero E some se
 * você não estava olhando a aba naquele instante; isto é o "e se eu tivesse
 * perdido?". Mesma fonte (`notifications`, derivada de `runEvents` no host),
 * só que persiste até você abrir o sino — não até o toast expirar sozinho.
 */
export function NotificationCenter({ notifications, lastSeenAt, pendingDecisions = 0, kitNotice = null }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unseenCount = lastSeenAt
    ? notifications.filter((n) => n.timestamp > lastSeenAt).length
    : notifications.length;

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && unseenCount > 0) postMessage({ type: "notifications/markSeen" });
  };

  // Esc fecha o painel (não modal) e devolve o foco ao sino, de onde a pessoa estiver dentro dele.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    setOpen(false);
    bellRef.current?.focus();
  };

  return (
    <div className={s.wrap} ref={wrapRef} onKeyDown={onKeyDown}>
      <Button
        ref={bellRef}
        variant="icon"
        className={s.bell}
        title="Notificações"
        aria-label={
          pendingDecisions > 0
            ? `Notificações: ${pendingDecisions} ${pendingDecisions === 1 ? "decisão esperando" : "decisões esperando"}`
            : unseenCount > 0
              ? `Notificações: ${unseenCount} ${unseenCount === 1 ? "nova" : "novas"}`
              : "Notificações: nada novo"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        {(unseenCount > 0 || pendingDecisions > 0) && <span className={s.dot} aria-hidden="true" />}
      </Button>
      {open && (
        <div className={s.panel} role="dialog" aria-label="Central de notificações">
          <div className={s.panelHeader}>Notificações</div>
          {kitNotice && (
            <div className={s.kit}>
              <span>
                <span aria-hidden="true">⚠ </span>Kit desatualizado: {kitNotice.installed} → {kitNotice.current}
              </span>
              <Button variant="tertiary" size="sm" onClick={() => postMessage({ type: "runCommand", command: `${BRAND.commandPrefix}.migrateKit` })}>
                Migrar o kit
              </Button>
            </div>
          )}
          {notifications.length === 0 ? (
            <p className={s.empty}>Nenhuma notificação ainda.</p>
          ) : (
            <ul className={s.list}>
              {notifications.map((n) => {
                const Icon = ICON_BY_KIND[n.kind];
                return (
                  <li key={n.id} className={s.row} data-kind={n.kind}>
                    <Icon size={15} strokeWidth={2} className={s.icon} />
                    <span className={s.text}>{n.text}</span>
                    <span className={s.time}>{formatRelativeTime(n.timestamp)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
