import { useEffect, useRef } from "react";
import { CircleCheck, Ban, Hand, ArrowUpCircle, X, type LucideIcon } from "lucide-react";
import type { CockpitToast } from "@shared/cockpit-protocol";
import { Button } from "../../primitives/Button/Button";
import s from "./ToastLayer.module.css";

interface ToastLayerProps {
  toasts: CockpitToast[];
  onDismiss: (id: string) => void;
}

const ICON_BY_KIND: Record<CockpitToast["kind"], LucideIcon> = {
  "gate-approved": CircleCheck,
  "blocked": Ban,
  "agent-done": Hand,
  "kit-outdated": ArrowUpCircle,
};

/** Quanto tempo um toast fica visível antes de sumir sozinho — tempo o bastante pra ler, curto o bastante pra não empilhar e travar o canto da tela. */
const AUTO_DISMISS_MS = 6000;

/**
 * Notificações efêmeras que importam independente de qual aba está aberta —
 * é o que faz "progresso do agente" chegar até o operador mesmo quando ele
 * está na aba de Analítico ou Aprendizado. "Efêmero" de verdade: cada toast
 * some sozinho depois de `AUTO_DISMISS_MS`, sem exigir clique — um timer por
 * `id` (não um `useEffect` só em `[toasts]`, que reiniciaria o timer de TODO
 * toast visível sempre que um novo chegasse). Fechar antes (botão X) ou o
 * toast sair da janela dos últimos 20 do store cancela o timer correspondente.
 */
export function ToastLayer({ toasts, onDismiss }: ToastLayerProps) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const active = new Set(toasts.map((t) => t.id));

    for (const t of toasts) {
      if (timers.current.has(t.id)) continue;
      timers.current.set(t.id, setTimeout(() => onDismiss(t.id), AUTO_DISMISS_MS));
    }

    for (const [id, timer] of timers.current) {
      if (!active.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  if (toasts.length === 0) return null;
  return (
    <div className={s.layer} role="status" aria-live="polite">
      {toasts.slice(-4).map((t) => {
        const Icon = ICON_BY_KIND[t.kind];
        return (
          <div key={t.id} className={s.toast} data-kind={t.kind}>
            <Icon size={18} strokeWidth={2} className={s.icon} />
            <span className={s.text}>{t.text}</span>
            <Button variant="icon" size="sm" aria-label="Dispensar" onClick={() => onDismiss(t.id)}>
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
