import { useState, type ReactNode } from "react";
import { Compass, FolderOpen, Rocket } from "lucide-react";
import { Badge, Button, Card, ChoiceCard, StatusGlyph } from "../../design-system/primitives";
import { StatusBadge } from "../../design-system/patterns";
import { JataiMark } from "../../design-system/brand/JataiMark";
import type { WizardStep } from "@shared/wizard-protocol";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";
import { stepOf, greenfieldDestination, REPOSITORIES_LINES } from "./journey";
import { COMMON_FACTS, DONE_COPY, FOLDER_COPY, HARNESS_FACTS, INSTALL_COPY, MODE_COPY, OPENING } from "./journeyCopy";
import type { WizardFlow, WizardView } from "./WizardFlow";
import { WizardIcon } from "./WizardIcon";
import s from "./Wizard.module.css";

interface ScreenProps {
  view: WizardView;
  flow: WizardFlow;
}

/** Opções de um campo do schema, como o grupo de cartões as desenha. */
function optionsOf(step: WizardStep | undefined, extra?: (value: string) => ReactNode): ChoiceOption[] {
  return (step?.options ?? []).map((o) => ({
    value: o.value,
    label: o.label,
    description: extra?.(o.value) ?? o.description,
    icon: o.icon ? <WizardIcon icon={o.icon} /> : undefined,
    badge: o.badge,
  }));
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Legenda visível de um grupo de opções, que dá o nome ao `radiogroup`. */
function Legend({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 className={s.groupLabel} id={id}>
      {children}
    </h2>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className={s.code}>{children}</code>;
}

export function OpeningScreen() {
  return (
    <div className={s.opening}>
      <JataiMark size={56} decorative />
      <div className={s.twoColumns}>
        <Card as="section" aria-labelledby="opening-will">
          <h2 className={s.cardTitle} id="opening-will">
            {OPENING.willTitle}
          </h2>
          <ul className={s.checks}>
            {OPENING.will.map((line) => (
              <li key={line}>
                <StatusGlyph status="done" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card as="section" aria-labelledby="opening-wont">
          <h2 className={s.cardTitle} id="opening-wont">
            {OPENING.wontTitle}
          </h2>
          <ul className={s.checks}>
            {OPENING.wont.map((line) => (
              <li key={line}>
                <StatusGlyph status="blocked" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export function ModeScreen({ view, flow }: ScreenProps) {
  const options: ChoiceOption[] = [
    { value: "greenfield", label: MODE_COPY.greenfield.title, description: MODE_COPY.greenfield.description, icon: <Rocket size={22} strokeWidth={1.75} /> },
    { value: "brownfield", label: MODE_COPY.brownfield.title, description: MODE_COPY.brownfield.description, icon: <Compass size={22} strokeWidth={1.75} /> },
  ];
  return <ChoiceGroup name="modo" labelledBy="wizard-title" options={options} value={view.choice ?? undefined} onChange={(v) => flow.chooseMode(v as "greenfield" | "brownfield")} />;
}

export function HarnessScreen({ view, flow }: ScreenProps) {
  const step = stepOf(view.schema, "hostAdapter");
  const options = optionsOf(step, (value) => {
    const facts = HARNESS_FACTS[value as keyof typeof HARNESS_FACTS];
    if (!facts) return undefined;
    return (
      <span className={s.installs}>
        <span>{facts.summary}</span>
        <span className={s.installsLabel}>O que instala e onde</span>
        <span>
          Entrada: {facts.entry} · <Code>{facts.entryFile}</Code>
        </span>
        <span>
          Skills: <Code>{facts.skills}</Code>
        </span>
        <span>
          Instruções: <Code>{facts.instructions.join(" e ")}</Code>
        </span>
        <span>
          Servidor MCP: <Code>{facts.mcp}</Code>
        </span>
        {facts.hooks && (
          <span>
            Atividade: <Code>{facts.hooks.join(" e ")}</Code>
          </span>
        )}
      </span>
    );
  });
  return (
    <div className={s.groups}>
      <ChoiceGroup name="hostAdapter" labelledBy="wizard-title" options={options} value={str(view.values.hostAdapter)} onChange={(v) => flow.choose("hostAdapter", v)} />
      <p className={s.help} data-wizard="harness-note">
        {COMMON_FACTS.kitNote} {COMMON_FACTS.guideNote}
      </p>
    </div>
  );
}

const FIELD_LEGENDS: Record<string, string> = {
  domain: "Domínio",
  backendStack: "Stack",
  backendArchitecture: "Arquitetura",
  frontendStack: "Frontend",
  frontendArchitecture: "Arquitetura do frontend",
  database: "Banco de dados",
  cloud: "Nuvem",
  cicd: "Pipeline de CI/CD",
};

/** Telas de escolha única por campo (domínio, backend, frontend, infra): um grupo por campo. */
export function FieldGroupsScreen({ view, flow, fields }: ScreenProps & { fields: readonly string[] }) {
  const frontend = str(view.values.frontendStack);
  return (
    <div className={s.groups}>
      {fields.map((key) => {
        if (key === "frontendArchitecture" && (frontend === undefined || frontend === "none")) return null;
        const step = stepOf(view.schema, key);
        const legendId = `wizard-legend-${key}`;
        return (
          <section key={key} className={s.group}>
            {fields.length > 1 && <Legend id={legendId}>{FIELD_LEGENDS[key] ?? step?.title}</Legend>}
            <ChoiceGroup
              name={key}
              labelledBy={fields.length > 1 ? legendId : "wizard-title"}
              options={optionsOf(step)}
              value={str(view.values[key])}
              onChange={(v) => flow.choose(key, v)}
              columns={step?.columns === 3 || step?.columns === 4 ? step.columns : 2}
            />
          </section>
        );
      })}
    </div>
  );
}

export function ProjectScreen({ view, flow }: ScreenProps) {
  const error = view.fieldError;
  const idea = str(view.values.startupIdea) ?? "";
  const [length, setLength] = useState(idea.length);
  return (
    <div className={s.form}>
      <div className={s.field}>
        <label className={s.label} htmlFor="wizard-project-name">
          Nome do projeto
        </label>
        <p className={s.help} id="wizard-project-name-help">
          Letras minúsculas, números e hífen. Ex.: nova-fintech.
        </p>
        <input
          key={`projectName-${view.inputEpoch}`}
          id="wizard-project-name"
          className={s.input}
          data-wizard-input="text"
          type="text"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "wizard-project-name-error" : "wizard-project-name-help"}
          defaultValue={str(view.values.projectName) ?? ""}
          onInput={(e) => flow.input("projectName", e.currentTarget.value)}
        />
        {error && (
          <div className={s.fieldError} id="wizard-project-name-error" role="status" data-wizard="field-error">
            <StatusGlyph status="blocked" />
            <span>{error.reason}</span>
            {error.suggestion && (
              <Button variant="tertiary" size="sm" data-wizard="use-suggestion" onClick={() => flow.applySuggestion()}>
                Usar {error.suggestion}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor="wizard-idea">
          Ideia do produto
        </label>
        <p className={s.help} id="wizard-idea-help">
          Uma ou duas frases. Quanto mais claro, melhor o começo.
        </p>
        <textarea
          id="wizard-idea"
          className={s.textarea}
          data-wizard-input="textarea"
          aria-describedby="wizard-idea-help"
          maxLength={500}
          defaultValue={idea}
          onInput={(e) => {
            setLength(e.currentTarget.value.length);
            flow.input("startupIdea", e.currentTarget.value);
          }}
        />
        <div className={s.charCount}>{length} / 500</div>
      </div>
    </div>
  );
}

/** Onde criar o projeto novo: a pasta aberta é o padrão; sem pasta aberta, a pessoa precisa escolher. */
export function LocalScreen({ view, flow }: ScreenProps) {
  const { folder, folderCount } = view.workspace;
  const chosen = str(view.values.targetDirectory);
  const destination = greenfieldDestination(view.values, view.workspace);
  return (
    <div className={s.folder}>
      {folderCount > 1 && (
        <p className={s.notice} data-wizard="multi-root">
          <StatusGlyph status="queue" />
          <span>{FOLDER_COPY.multiRoot}</span>
        </p>
      )}
      {folder === null && chosen === undefined && <p className={s.help}>{FOLDER_COPY.noneOpen}</p>}
      <PathBox path={destination.path} note={destination.note} empty="Nenhum lugar escolhido" />
      <div className={s.row}>
        <Button variant={chosen === undefined && folder === null ? "primary" : "secondary"} data-wizard="pick-folder" icon={<FolderOpen size={16} />} onClick={() => flow.pickFolder()}>
          {chosen === undefined && folder === null ? FOLDER_COPY.pick : FOLDER_COPY.pickOther}
        </Button>
        {chosen !== undefined && folder !== null && (
          <Button variant="tertiary" data-wizard="use-default-folder" onClick={() => flow.useDefaultFolder()}>
            {FOLDER_COPY.useDefault}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Pasta do workspace do projeto existente: obrigatória, e vazia. */
export function WorkspaceFolderScreen({ view, flow }: ScreenProps) {
  const chosen = str(view.values.targetDirectory);
  const open = view.workspace.folder;
  return (
    <div className={s.folder}>
      {view.workspace.folderCount > 1 && (
        <p className={s.notice} data-wizard="multi-root">
          <StatusGlyph status="queue" />
          <span>{FOLDER_COPY.multiRoot}</span>
        </p>
      )}
      <PathBox path={chosen ?? ""} note={null} empty="Nenhuma pasta escolhida" />
      <div className={s.row}>
        <Button variant={chosen === undefined && open === null ? "primary" : "secondary"} data-wizard="pick-folder" icon={<FolderOpen size={16} />} onClick={() => flow.pickFolder()}>
          {chosen === undefined ? FOLDER_COPY.pick : FOLDER_COPY.pickOther}
        </Button>
        {open !== null && chosen !== open && (
          <Button variant={chosen === undefined ? "primary" : "tertiary"} data-wizard="use-open-folder" onClick={() => flow.useOpenFolder()}>
            {FOLDER_COPY.useOpen}
          </Button>
        )}
      </div>
      <p className={s.help}>{FOLDER_COPY.empty}</p>
    </div>
  );
}

function PathBox({ path, note, empty }: { path: string; note: string | null; empty: string }) {
  return (
    <div className={s.pathBox} data-wizard="folder-path" data-empty={path === ""}>
      <span className={s.pathValue}>{path === "" ? empty : path}</span>
      {note && path !== "" && <span className={s.pathNote}>{note}</span>}
    </div>
  );
}

export function RepositoriesScreen() {
  return (
    <div className={s.prose}>
      {REPOSITORIES_LINES.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

export function MaturityScreen({ view, flow }: ScreenProps) {
  const step = stepOf(view.schema, "maturityFrameworks");
  const selected = Array.isArray(view.values.maturityFrameworks) ? (view.values.maturityFrameworks as string[]) : [];
  return (
    <div role="group" aria-labelledby="wizard-title" className={s.cards} data-columns={2} data-wizard-group="maturityFrameworks">
      {(step?.options ?? []).map((o) => (
        <ToggleCard key={o.value} option={o} on={selected.includes(o.value)} onToggle={() => flow.toggle("maturityFrameworks", o.value)} />
      ))}
    </div>
  );
}

function ToggleCard({ option, on, onToggle }: { option: NonNullable<WizardStep["options"]>[number]; on: boolean; onToggle(): void }) {
  return (
    <ChoiceCard
      data-wizard-option={option.value}
      selected={on}
      onClick={onToggle}
      title={option.label}
      description={option.description}
      meta={option.badge ? <Badge tone="neutral">{option.badge}</Badge> : undefined}
    />
  );
}

export function ReviewScreen({ view }: ScreenProps) {
  const review = view.review!;
  const manifest = view.manifest;
  return (
    <div className={s.review}>
      <dl className={s.summary}>
        {review.rows.map((row) => (
          <div key={row.label} className={s.summaryItem}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        <div className={s.summaryItem} data-wizard="destination">
          <dt>Pasta de destino</dt>
          <dd>
            <Code>{review.destination.path}</Code>
            {review.destination.note && <span className={s.pathNote}> {review.destination.note}</span>}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="review-writes">
        <h2 className={s.groupLabel} id="review-writes">
          {INSTALL_COPY.review.willWrite}
        </h2>
        <ul className={s.writes} data-wizard="writes">
          {review.writes.map((w) => (
            <li key={w.what}>
              <span>{w.what}</span>
              <Code>{w.where}</Code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="review-wont">
        <h2 className={s.groupLabel} id="review-wont">
          {INSTALL_COPY.review.wontDo}
        </h2>
        <ul className={s.checks}>
          {review.wont.map((line) => (
            <li key={line}>
              <StatusGlyph status="blocked" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {view.loadingTemplate && (
        <p className={s.help} role="status">
          Carregando a prévia da estrutura…
        </p>
      )}
      {manifest && (
        <details className={s.tree}>
          <summary>{INSTALL_COPY.review.tree}</summary>
          <p className={s.help}>{INSTALL_COPY.review.treeNote}</p>
          <ul className={s.treeList}>
            {manifest.manifest.generatedTree.slice(0, 32).map((path) => (
              <li key={path} data-folder={path.endsWith("/")}>
                {path}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Enquanto a instalação roda: a Jataí diz que está trabalhando e onde. */
export function InstallingScreen({ view }: ScreenProps) {
  const where = view.review?.destination.path ?? "";
  return (
    <Card className={s.progress} data-wizard="progress">
      <StatusBadge status="working" pulse label={`${INSTALL_COPY.installing}…`} />
      {where !== "" && (
        <p className={s.help}>
          Gravando em <Code>{where}</Code>.
        </p>
      )}
    </Card>
  );
}

/** "Pronto": onde a estrutura ficou e o próximo passo, no harness escolhido (ADR-0025). */
export function DoneScreen({ view }: ScreenProps) {
  const done = view.installed!;
  const harness = HARNESS_FACTS[done.hostAdapter];
  const nextStep = DONE_COPY[done.hostAdapter];
  return (
    <div className={s.review} data-wizard="done">
      <Card as="section" aria-labelledby="done-where" className={s.progress}>
        <StatusBadge status="done" />
        <h2 className={s.groupLabel} id="done-where">
          {DONE_COPY.wrote}
        </h2>
        <Code>{done.folder}</Code>
        <p className={s.help}>Harness: {harness.label}</p>
      </Card>
      <section aria-labelledby="done-next">
        <h2 className={s.groupLabel} id="done-next">
          {DONE_COPY.nextTitle}
        </h2>
        <ol className={s.nextSteps}>
          {!done.folderIsOpen && <li data-wizard="open-folder-first">{DONE_COPY.openFolderFirst}</li>}
          <li data-wizard="next-step">{nextStep}</li>
        </ol>
        <p className={s.help}>{COMMON_FACTS.guideNote}</p>
      </section>
    </div>
  );
}
