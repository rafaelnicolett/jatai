import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BRAND } from "@data";
import { Button } from "../../primitives/Button/Button";
import { StatusGlyph } from "../../primitives/StatusGlyph/StatusGlyph";
import { VisuallyHidden } from "../../primitives/VisuallyHidden/VisuallyHidden";
import s from "./DecisionDialog.module.css";

export interface DecisionFactView {
  label: string;
  /** `null`: o dado não está registrado ("—" e "sem dado registrado"). */
  value: string | null;
}

export interface DecisionChecklistView {
  id: string;
  label: string;
  hint?: string;
  required: boolean;
  checked: boolean;
  /** Ausente: o item só se lê (a marca não tem como ser gravada daqui). */
  onToggle?: (checked: boolean) => void;
}

export interface DecisionRequirementView {
  key: string;
  status: string;
  reason?: string;
}

interface DecisionDialogProps {
  /** Gate (decisão com regra de fechamento) ou decisão simples. Só muda o selo do eyebrow. */
  variant: "gate" | "decision";
  eyebrow: string;
  /** O que se decide, como pergunta: o `h2` que recebe o foco ao abrir. */
  question: string;
  context: string;
  facts: DecisionFactView[];
  checklist: DecisionChecklistView[];
  /** A regra de fechamento: o que impede o gate e o que foi cortado. */
  closure?: { open: DecisionRequirementView[]; cancelled: DecisionRequirementView[]; closedCount: number; total: number } | null;
  evidence: Array<{ path: string; onOpen: () => void }>;
  /** O botão principal. `disabledReason` o deixa `aria-disabled`, com a ajuda em texto. */
  primary: { label: string; disabledReason?: string; onConfirm: () => void } | null;
  /** A decisão pede texto de quem decide (o que foi decidido, curto). */
  textField?: { label: string; value: string; maxLength: number; onChange: (value: string) => void } | null;
  /** O git não tem `user.name`: pede o nome de quem decide. */
  nameField?: { value: string; onChange: (value: string) => void } | null;
  submitting: boolean;
  error: string | null;
  /** Sem botão principal e sem caminho no Cockpit: por que a decisão se resolve no chat. */
  chatOnly?: string;
  onChat: () => void;
  onClose: () => void;
  /** "A resposta fica registrada com o seu nome e a data no histórico da iniciativa." */
  note: string;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Esconde do teclado e do leitor de tela tudo o que está atrás do diálogo (`inert`), e devolve o que estava. */
function useInertBackground(host: HTMLElement | null): void {
  useEffect(() => {
    if (!host) return;
    const changed: HTMLElement[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === host || !(el instanceof HTMLElement) || el.hasAttribute("inert")) continue;
      el.setAttribute("inert", "");
      changed.push(el);
    }
    return () => changed.forEach((el) => el.removeAttribute("inert"));
  }, [host]);
}

/**
 * DecisionDialog do DS v2 (§4.7): o ÚNICO lugar onde se decide (o Mapa só abre
 * este diálogo). Apresenta o que está em jogo e registra a resposta.
 *
 * Acessibilidade:
 * - `role="dialog"` + `aria-modal`, nomeado pelo `h2` e descrito pelo contexto e
 *   pela nota; o foco vai para o `h2` (`tabindex="-1"`), para a pergunta e o
 *   contexto serem lidos primeiro. O botão principal NÃO recebe foco automático,
 *   para ninguém confirmar por acidente;
 * - foco preso no diálogo (Tab e Shift+Tab em ciclo), o fundo vira `inert`, Esc
 *   fecha sem decidir nem registrar nada, e o foco volta a quem abriu;
 * - botão desabilitado fica `aria-disabled` (continua focável) e a ajuda diz o
 *   porquê em texto; enquanto registra, `aria-busy` e "Registrando…";
 * - erro em `role="alert"`, com "Tentar de novo". Nada pulsa.
 */
export function DecisionDialog({ variant, eyebrow, question, context, facts, checklist, closure, evidence, primary, textField, nameField, submitting, error, chatOnly, onChat, onClose, note }: DecisionDialogProps) {
  const uid = useId();
  // O diálogo mora num nó próprio do `body` (portal), criado uma vez.
  const [host] = useState<HTMLDivElement | null>(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  // Entra no `body`; o resto da página vira inert enquanto ele existe.
  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host);
    return () => {
      host.remove();
    };
  }, [host]);
  useInertBackground(host);

  // Ao abrir, o foco vai para a pergunta; ao fechar, volta a quem abriu.
  useEffect(() => {
    titleRef.current?.focus();
    const opener = openerRef.current;
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  // Pediu o nome: o campo recebe o foco.
  const asksName = !!nameField;
  useEffect(() => {
    if (asksName) nameRef.current?.focus();
  }, [asksName]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!submitting) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === titleRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const required = checklist.filter((c) => c.required);
  const help = primary?.disabledReason;
  const label = error && primary ? "Tentar de novo" : primary?.label;

  const body = (
    <div className={s.scrim}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-context ${uid}-note`}
        aria-busy={submitting || undefined}
        className={s.dialog}
        data-variant={variant}
        onKeyDown={onKeyDown}
      >
        <div className={s.head}>
          <span className={s.eyebrow}>
            <StatusGlyph status="you" size={10} color="inherit" /> {eyebrow}
          </span>
          <Button variant="icon" aria-label="Fechar" aria-disabled={submitting || undefined} onClick={() => !submitting && onClose()}>
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>

        <h2 id={`${uid}-title`} ref={titleRef} tabIndex={-1} className={s.question}>
          {question}
        </h2>
        <p id={`${uid}-context`} className={s.context}>
          {context}
        </p>

        {facts.length > 0 && (
          <dl className={s.facts}>
            {facts.map((f) => (
              <div key={f.label} className={s.fact}>
                <dt>{f.label}</dt>
                <dd>
                  {f.value ?? (
                    <>
                      <span aria-hidden="true">—</span>
                      <VisuallyHidden>sem dado registrado</VisuallyHidden>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {closure && (
          <section className={s.closure} aria-labelledby={`${uid}-closure`}>
            <h3 id={`${uid}-closure`} className={s.sectionTitle}>
              Para fechar o gate
              <span className={s.count}>
                {" "}
                · {closure.closedCount} de {closure.total} fechadas
              </span>
            </h3>
            {closure.open.length === 0 ? (
              <p className={s.allClosed}>
                <StatusGlyph status="done" size={14} /> Tudo fechado: o gate pode ser aprovado.
              </p>
            ) : (
              <ul className={s.requirements} aria-label="O que falta">
                {closure.open.map((r) => (
                  <li key={r.key}>
                    <StatusGlyph status={/bloquead|falhou/.test(r.status) ? "blocked" : "queue"} size={14} />
                    <span>
                      <strong>{r.key}</strong>: {r.status}
                      {r.reason ? ` (${r.reason})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {closure.cancelled.length > 0 && (
              <>
                <h4 className={s.subTitle}>Cortadas do escopo</h4>
                <ul className={s.requirements} aria-label="Canceladas">
                  {closure.cancelled.map((r) => (
                    <li key={r.key} className={s.cancelled}>
                      <StatusGlyph status="cancelled" size={14} />
                      <span>
                        <strong>{r.key}</strong>: cancelada{r.reason ? `: ${r.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {checklist.length > 0 && (
          <fieldset className={s.checklist}>
            <legend className={s.sectionTitle}>
              Seu checklist
              {required.length > 0 && <span className={s.count}> · {required.filter((c) => c.checked).length} de {required.length} obrigatórios</span>}
            </legend>
            {checklist.map((c) => (
              <label key={c.id} className={s.check} data-readonly={!c.onToggle || undefined}>
                <input type="checkbox" checked={c.checked} disabled={!c.onToggle || submitting} onChange={(e) => c.onToggle?.(e.target.checked)} aria-describedby={c.hint ? `${uid}-${c.id}-hint` : undefined} />
                <span>
                  {c.label}
                  {c.required && <span className={s.required}> (obrigatório)</span>}
                  {c.hint && (
                    <span id={`${uid}-${c.id}-hint`} className={s.hint}>
                      {c.hint}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {evidence.length > 0 && (
          <ul className={s.evidence} aria-label="Evidências">
            {evidence.map((e) => (
              <li key={e.path}>
                <button type="button" className={s.link} onClick={e.onOpen}>
                  {e.path}
                </button>
              </li>
            ))}
          </ul>
        )}

        {textField && (
          <label className={s.field}>
            <span>{textField.label}</span>
            <input type="text" value={textField.value} maxLength={textField.maxLength} disabled={submitting} onChange={(e) => textField.onChange(e.target.value)} />
          </label>
        )}
        {nameField && (
          <label className={s.field}>
            <span>Seu nome (o git deste workspace não tem user.name)</span>
            <input ref={nameRef} type="text" autoComplete="name" value={nameField.value} disabled={submitting} onChange={(e) => nameField.onChange(e.target.value)} />
          </label>
        )}

        {chatOnly && <p className={s.chatOnly}>{chatOnly}</p>}

        {error && (
          <div role="alert" className={s.alert}>
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}

        <div className={s.actions}>
          {primary && (
            <Button
              variant="primary"
              size="lg"
              loading={submitting}
              loadingLabel="Registrando…"
              disabledReason={help}
              aria-describedby={help ? `${uid}-help` : undefined}
              onClick={primary.onConfirm}
            >
              {label}
            </Button>
          )}
          <Button variant="secondary" size="lg" aria-disabled={submitting || undefined} onClick={() => !submitting && onClose()}>
            {primary ? "Decidir depois" : "Fechar"}
          </Button>
          <Button variant="tertiary" size="lg" aria-disabled={submitting || undefined} onClick={() => !submitting && onChat()}>
            Conversar no @{BRAND.participant.name}
          </Button>
        </div>
        {help && (
          <p id={`${uid}-help`} className={s.help}>
            {help}
          </p>
        )}

        <p id={`${uid}-note`} className={s.note}>
          {note}
        </p>
      </div>
    </div>
  );

  return host ? createPortal(body, host) : null;
}
