import type { ReactNode } from "react";
import { cockpitStore } from "../../../../store/CockpitStore";
import { useCockpitSelector } from "../../../../store/useCockpitSelector";
import { ToastLayer } from "../../../../design-system/patterns/ToastLayer/ToastLayer";
import s from "./AppShell.module.css";

interface AppShellProps {
  /** A barra superior (`<header>`): a marca, o seletor de iniciativa, "Mapa", ⌘K e o sino. */
  bar: ReactNode;
  /** Aviso de dados degradados, logo abaixo da barra. */
  banner?: ReactNode;
  /** A paleta de comandos (⌘K). */
  deck: ReactNode;
  /** A região viva dos anúncios. */
  live: ReactNode;
  children: ReactNode;
}

/**
 * A casca persistente do Cockpit (DS v2): só o layout. A barra, a paleta e a
 * região viva chegam prontas; o `<main>` guarda a tela. A ordem do DOM é a
 * ordem de foco: barra → aviso → conteúdo. É o ponto estrutural que resolve o
 * bug original: `webview.html` é setado UMA VEZ (ver `CockpitNextController`),
 * então esta árvore nunca é desmontada por um evento não relacionado.
 */
export function AppShell({ bar, banner, deck, live, children }: AppShellProps) {
  const toasts = useCockpitSelector((st) => st.toasts);
  return (
    <div className={s.shell}>
      {bar}
      {banner}
      <main className={s.content} id="cockpit-main">
        {children}
      </main>
      <ToastLayer toasts={toasts} onDismiss={(id) => cockpitStore.removeToast(id)} />
      {deck}
      {live}
    </div>
  );
}
