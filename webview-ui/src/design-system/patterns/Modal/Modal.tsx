import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "../../primitives/Button/Button";
import s from "./Modal.module.css";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Rótulo curto/mono acima do título — ex.: `itemKey` ("item-1.1"). Opcional. */
  eyebrow?: string;
  title: string;
  children: ReactNode;
}

/**
 * Modal genérico do design system — mesmo padrão de overlay já usado em
 * `CommandDeck` (backdrop com `onClick` pra fechar, painel para propagação
 * com `stopPropagation`, `Escape` fecha, `z-index: 200`). Não sabe nada
 * sobre o conteúdo — quem chama decide o `children`.
 *
 * `open` controla montagem (retorna `null` quando fechado) em vez de
 * esconder via CSS — mesma escolha que `CommandDeck` já fazia, evita
 * manter listeners de teclado vivos sem necessidade.
 */
export function Modal({ open, onClose, eyebrow, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div className={s.panel} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.headerText}>
            {eyebrow && <div className={s.eyebrow}>{eyebrow}</div>}
            <div className={s.title}>{title}</div>
          </div>
          <Button variant="icon" title="Fechar" aria-label="Fechar" onClick={onClose}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
        <div className={s.body}>{children}</div>
      </div>
    </div>
  );
}
