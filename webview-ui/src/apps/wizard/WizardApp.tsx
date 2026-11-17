import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { JataiMark } from "../../design-system/brand/JataiMark";
import { Button, StatusGlyph, VisuallyHidden } from "../../design-system/primitives";
import { keyIntent, type KeyTarget } from "./journey";
import { DONE_COPY } from "./journeyCopy";
import type { WizardFlow, WizardView } from "./WizardFlow";
import {
  DoneScreen, FieldGroupsScreen, HarnessScreen, InstallingScreen, LocalScreen, MaturityScreen, ModeScreen, OpeningScreen, ProjectScreen, RepositoriesScreen, ReviewScreen, WorkspaceFolderScreen,
} from "./screens";
import s from "./Wizard.module.css";

interface WizardAppProps {
  flow: WizardFlow;
}

function Screen({ view, flow }: { view: WizardView; flow: WizardFlow }) {
  if (view.phase === "installed") return <DoneScreen view={view} flow={flow} />;
  if (view.phase === "installing") return <InstallingScreen view={view} flow={flow} />;
  switch (view.screen) {
    case "abertura":
      return <OpeningScreen />;
    case "modo":
      return <ModeScreen view={view} flow={flow} />;
    case "harness":
      return <HarnessScreen view={view} flow={flow} />;
    case "projeto":
      return <ProjectScreen view={view} flow={flow} />;
    case "dominio":
      return <FieldGroupsScreen view={view} flow={flow} fields={["domain"]} />;
    case "backend":
      return <FieldGroupsScreen view={view} flow={flow} fields={["backendStack", "backendArchitecture"]} />;
    case "frontend":
      return <FieldGroupsScreen view={view} flow={flow} fields={["frontendStack", "frontendArchitecture"]} />;
    case "infra":
      return <FieldGroupsScreen view={view} flow={flow} fields={["database", "cloud", "cicd"]} />;
    case "local":
      return <LocalScreen view={view} flow={flow} />;
    case "pasta":
      return <WorkspaceFolderScreen view={view} flow={flow} />;
    case "repositorios":
      return <RepositoriesScreen />;
    case "maturidade":
      return <MaturityScreen view={view} flow={flow} />;
    case "revisao":
      return <ReviewScreen view={view} flow={flow} />;
  }
}

/** Que tipo de controle recebeu a tecla: decide o que Enter faz (`keyIntent`). */
function targetKind(el: EventTarget | null): KeyTarget {
  if (!(el instanceof HTMLElement)) return "other";
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLInputElement) return "text";
  if (el.closest('[role="radio"]')) return "radio";
  if (el.closest("button, a, summary, select")) return "button";
  return "other";
}

/**
 * Wizard em React (F3.10, ADR-0019) como jornada guiada (F4.3), com o design
 * system v2. A lógica mora no `WizardFlow` e no `journey.ts`; aqui é o DOM e o
 * que é de teclado e de leitor de tela:
 * - o foco vai para o título ao trocar de tela (e ao começar e terminar a
 *   instalação), para o leitor ler o passo antes dos controles;
 * - Enter avança e Esc volta, sem tomar o Enter de um botão;
 * - o progresso é anunciado numa região de avisos educados, e o erro que
 *   bloqueia o passo, como alerta.
 */
export function WizardApp({ flow }: WizardAppProps) {
  const view = useSyncExternalStore(flow.subscribe, flow.getView);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [view.screen, view.phase]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.defaultPrevented) return;
    const intent = keyIntent({ key: e.key, target: targetKind(e.target), ctrlKey: e.ctrlKey, metaKey: e.metaKey });
    if (intent === null) return;
    if (intent === "back") {
      if (view.backDisabled) return;
      e.preventDefault();
      flow.back();
      return;
    }
    e.preventDefault();
    // Enter num cartão de opção marca o cartão e avança, como Enter num formulário.
    (e.target as HTMLElement).closest<HTMLElement>('[role="radio"]')?.click();
    flow.next();
  }

  const installing = view.phase === "installing";
  const installed = view.phase === "installed";
  const blockedWithReason = view.nextDisabled && !installing && view.issue !== null;

  return (
    <div className={s.shell} data-phase={view.phase} onKeyDown={onKeyDown}>
      <header className={s.header}>
        <JataiMark size={26} wordmark />
        <p className={s.stepLabel} data-wizard="step-label">
          {view.stepLabel}
        </p>
      </header>

      <main className={s.body}>
        <h1 className={s.stepTitle} id="wizard-title" ref={titleRef} tabIndex={-1} data-wizard="step-title">
          {view.title}
        </h1>
        <p className={s.stepLead} data-wizard="step-lead">
          {view.lead}
        </p>
        {view.errors.map((error, i) => (
          <div key={`${i}-${error}`} className={s.error} role="alert" data-wizard="error">
            <StatusGlyph status="blocked" />
            <span>{error}</span>
          </div>
        ))}
        <div className={s.content} data-wizard="step-content" key={view.screen}>
          <Screen view={view} flow={flow} />
        </div>
      </main>

      <div role="status" aria-live="polite" data-wizard="live">
        <VisuallyHidden>{view.live}</VisuallyHidden>
      </div>

      <footer className={s.footer}>
        <Button variant={installed && !view.installed?.folderIsOpen ? "primary" : "tertiary"} data-wizard="cancel" onClick={() => flow.cancel()}>
          {installed ? DONE_COPY.close : "Cancelar"}
        </Button>
        {installed && view.installed?.folderIsOpen && (
          <Button variant="primary" data-wizard="open-cockpit" onClick={() => flow.openCockpit()}>
            {DONE_COPY.cockpit}
          </Button>
        )}
        {!installed && <div className={s.navRight}>
          <Button variant="secondary" data-wizard="back" disabled={view.backDisabled} onClick={() => flow.back()}>
            Voltar
          </Button>
          <Button
            variant="primary"
            data-wizard="next"
            disabledReason={blockedWithReason ? (view.issue ?? undefined) : undefined}
            disabled={view.nextDisabled && !installing && !blockedWithReason}
            loading={installing}
            loadingLabel="Instalando…"
            onClick={() => flow.next()}
          >
            {view.nextLabel}
          </Button>
        </div>}
      </footer>
    </div>
  );
}
