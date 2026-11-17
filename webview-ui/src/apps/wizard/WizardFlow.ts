/**
 * WizardFlow.ts — o fluxo da jornada do Wizard, sem React (F4.3, sobre a
 * paridade da F3.10). Guarda a tela, os valores e as mensagens ao host; o
 * componente só desenha o `view` e chama os métodos. As telas e as regras de
 * avanço são do `journey.ts`; os textos, do `journeyCopy.ts`.
 *
 * O protocolo é o congelado em `src/shared/wizard-protocol.ts`, com as
 * mensagens aditivas da F4.3. Os bugs que o Wizard legado deixou pinados
 * foram corrigidos um por commit, e o fluxo os preserva:
 * - o modo troca o painel de uma vez, sem mostrar tela do outro modo (L6);
 * - a pasta obrigatória sem pasta não deixa avançar (H-BUG-52);
 * - o nome do projeto é conferido em linha, e o erro do host devolve a pessoa
 *   à tela do campo com o botão livre (H-BUG-20);
 * - trocar uma escolha de que a prévia depende descarta o manifest antigo e
 *   pede outro (H-BUG-25);
 * - a tela salva com `setState` é lida ao abrir, e a escolha do modo é uma
 *   tela da jornada, a que se volta para trocar de ideia (GAP-20).
 */

import type { HostToWizardMessage, TemplateManifest, TemplateManifestSource, WizardBoot, WizardMessage, WizardStatePartial, WizardStep } from "@shared/wizard-protocol";
import {
  hostErrorText, journeyFor, previewSignature, previewTemplateId, projectNameError, reviewModel, screenIndexOfField, screenIssue, startScreen, workspaceOf,
  type JourneyContext, type JourneyScreen, type Mode, type ReviewModel, type ScreenId, type WizardValues, type Workspace,
} from "./journey";
import { DONE_COPY, INSTALL_COPY, SCREEN_COPY } from "./journeyCopy";

/** O lado do webview que o fluxo usa: postar ao host e gravar/ler a tela (`vscode.setState`/`getState`). */
export interface WizardBridge {
  postMessage(msg: WizardMessage): void;
  setState(state: { screen: string }): void;
  /** A tela gravada antes de um recarregamento (GAP-20); `undefined` na primeira abertura. */
  getState(): { screen: string } | undefined;
}

export type Phase = "editing" | "installing" | "installed";

/** Onde a estrutura ficou, como o host a devolve quando a instalação termina (passo "Pronto"). */
export type InstalledInfo = Omit<Extract<HostToWizardMessage, { type: "installed" }>, "type">;

export interface WizardView {
  screen: ScreenId;
  mode: Mode;
  index: number;
  total: number;
  /** "Passo N de M". */
  stepLabel: string;
  title: string;
  lead: string;
  schema: readonly WizardStep[];
  values: WizardValues;
  /** O modo marcado na tela de escolha do modo; `null` antes de a pessoa escolher. */
  choice: Mode | null;
  /** Por que não dá para avançar, em uma frase; `null` quando dá. */
  issue: string | null;
  /** Erro em linha do nome do projeto, com o nome válido mais próximo (H-BUG-20). */
  fieldError: { reason: string; suggestion: string | null } | null;
  /** Sobe quando o valor do campo muda por fora da digitação: o campo não controlado recomeça com o valor novo. */
  inputEpoch: number;
  nextLabel: string;
  nextDisabled: boolean;
  backDisabled: boolean;
  phase: Phase;
  /** Erros que bloqueiam o passo (alerta), o mais recente primeiro. */
  errors: string[];
  /** Texto da região de avisos educados (progresso). */
  live: string;
  workspace: Workspace;
  /** O que será escrito, na tela de revisão. */
  review: ReviewModel | null;
  /** Prévia da estrutura (o manifest e a origem), ou `null` enquanto carrega ou fora do projeto novo. */
  manifest: { manifest: TemplateManifest; source: TemplateManifestSource } | null;
  loadingTemplate: boolean;
  /** Onde a estrutura ficou; só no passo "Pronto". */
  installed: InstalledInfo | null;
}

export class WizardFlow {
  private readonly _schema: readonly WizardStep[];
  private readonly _mode: Mode;
  private readonly _templatePrefix: string;
  private readonly _workspace: Workspace;
  private readonly _journey: readonly JourneyScreen[];
  private _values: WizardValues;
  private _index = 0;
  private _choice: Mode | null;
  private _phase: Phase = "editing";
  private _installed: InstalledInfo | null = null;
  private _switching = false;
  private _errors: string[] = [];
  private _inputEpoch = 0;
  /** Para quais escolhas o manifest da prévia foi pedido (H-BUG-25). */
  private _manifestSignature: string | null = null;
  private _manifest: { manifest: TemplateManifest; source: TemplateManifestSource } | null = null;
  private _listeners = new Set<() => void>();
  private _view: WizardView;

  constructor(boot: WizardBoot, private readonly _bridge: WizardBridge) {
    this._schema = boot.schema;
    this._mode = boot.brownfield ? "brownfield" : "greenfield";
    this._templatePrefix = boot.brand.templatePrefix;
    this._workspace = workspaceOf(boot);
    this._journey = journeyFor(this._mode);
    this._values = { ...(boot.state as WizardValues) };
    // Reabre depois da escolha do modo quando o host já trocou de modo (o painel é re-renderizado nessa troca).
    const modeChosen = boot.brownfield || boot.modeChosen === true;
    this._choice = modeChosen ? this._mode : null;
    this._index = startScreen(this._journey, this._values, this._ctx(), this._bridge.getState()?.screen, modeChosen);
    this._view = this._computeView();
  }

  // ── Leitura (useSyncExternalStore) ──────────────────────────────────────

  get view(): WizardView {
    return this._view;
  }

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getView = (): WizardView => this._view;

  // ── Ações da pessoa ─────────────────────────────────────────────────────

  /** Primeiro desenho: entra na tela em que o painel abre. */
  start(): void {
    this._enter();
    this._emit();
  }

  /** Marca o modo na tela de escolha do modo; o painel só troca quando a pessoa avança. */
  chooseMode(mode: Mode): void {
    this._choice = mode;
    this._emit();
  }

  next(): void {
    if (this._phase === "installed") {
      // "Pronto": o botão principal abre o Cockpit quando a pasta é a aberta; senão só fecha.
      if (this._installed?.folderIsOpen) this.openCockpit();
      else this.cancel();
      return;
    }
    if (this._switching || this._phase === "installing" || this._view.nextDisabled) return;
    const screen = this._screen();
    if (screen.id === "modo" && this._choice !== this._mode) {
      // L6 e GAP-20: trocar de modo é re-renderizar o painel inteiro com o schema do outro modo. Pede de
      // uma vez e fica na tela até a troca chegar, sem mostrar passo de outro modo.
      this._switching = true;
      if (this._choice === "brownfield") this._bridge.postMessage({ type: "switchToBrownfield" });
      else this._bridge.postMessage({ type: "switchToGreenfield" });
      this._emit();
      return;
    }
    if (screen.id === "revisao") {
      this._phase = "installing";
      this._errors = [];
      this._bridge.postMessage({ type: "submit", keepOpen: true });
      this._emit();
      return;
    }
    this._go(this._index + 1);
    this._emit();
  }

  back(): void {
    if (this._switching || this._phase !== "editing" || this._index === 0) return;
    this._go(this._index - 1);
    this._emit();
  }

  cancel(): void {
    this._bridge.postMessage({ type: "cancel" });
  }

  /** O botão do passo "Pronto": pede ao host que abra o Cockpit. */
  openCockpit(): void {
    this._bridge.postMessage({ type: "openCockpit" });
  }

  /** Texto e área de texto: cada digitação manda o valor sem espaços nas pontas. */
  input(key: string, raw: string): void {
    this._update(key, raw.trim());
    this._emit();
  }

  /** Aceita o nome sugerido para o projeto (H-BUG-20): grava, manda ao host e refaz o campo. */
  applySuggestion(): void {
    const suggestion = this._view.fieldError?.suggestion;
    if (!suggestion) return;
    this._update("projectName", suggestion);
    this._inputEpoch++;
    this._emit();
  }

  /** Grupo de opções de escolha única. */
  choose(key: string, value: string): void {
    this._update(key, value);
    this._emit();
  }

  /** Seleção múltipla: liga ou desliga uma opção. */
  toggle(key: string, value: string): void {
    const current = Array.isArray(this._values[key]) ? [...(this._values[key] as string[])] : [];
    const at = current.indexOf(value);
    if (at === -1) current.push(value);
    else current.splice(at, 1);
    this._update(key, current);
    this._emit();
  }

  pickFolder(): void {
    this._bridge.postMessage({ type: "pickFolder" });
  }

  /** Usa a pasta aberta no editor como destino (o workspace do projeto existente). */
  useOpenFolder(): void {
    if (this._workspace.folder === null) return;
    this._update("targetDirectory", this._workspace.folder);
    this._emit();
  }

  /** Volta ao destino padrão do projeto novo: uma pasta nova dentro da pasta aberta. */
  useDefaultFolder(): void {
    this._update("targetDirectory", "");
    this._emit();
  }

  // ── Mensagens do host ───────────────────────────────────────────────────

  receive(msg: HostToWizardMessage): void {
    switch (msg.type) {
      case "folderPicked":
        this._update("targetDirectory", msg.folder);
        break;
      case "templateManifest":
        this._values = { ...this._values, resolvedTemplate: msg.manifest };
        this._bridge.postMessage({ type: "stepUpdate", payload: { resolvedTemplate: msg.manifest } as WizardStatePartial });
        this._manifest = { manifest: msg.manifest, source: msg.source || "registry" };
        break;
      case "validationError": {
        // H-BUG-20: o botão volta, a pessoa vai à tela do campo recusado e lê o motivo ali.
        const key = Object.keys(msg.errors)[0];
        this._phase = "editing";
        if (key) {
          const text = hostErrorText(key, msg.errors[key]?.[0], this._values);
          const target = screenIndexOfField(this._journey, key);
          if (target !== -1 && target !== this._index) this._go(target);
          this._errors = [text, ...this._errors];
        }
        break;
      }
      case "installed":
        this._phase = "installed";
        this._errors = [];
        this._installed = { mode: msg.mode, folder: msg.folder, hostAdapter: msg.hostAdapter, folderIsOpen: msg.folderIsOpen };
        break;
      case "generationError":
        this._phase = "editing";
        this._errors = [`${INSTALL_COPY.failed} ${msg.message}`, ...this._errors];
        break;
    }
    this._emit();
  }

  // ── Interno ─────────────────────────────────────────────────────────────

  private _ctx(): JourneyContext {
    return { schema: this._schema, workspace: this._workspace };
  }

  private _screen(): JourneyScreen {
    return this._journey[this._index]!;
  }

  /** `update(key, val)` do legado: grava e manda o campo ao host. */
  private _update(key: string, value: unknown): void {
    this._values = { ...this._values, [key]: value };
    this._bridge.postMessage({ type: "stepUpdate", payload: { [key]: value } as WizardStatePartial });
  }

  private _go(index: number): void {
    this._index = Math.max(0, Math.min(index, this._journey.length - 1));
    this._errors = [];
    this._bridge.setState({ screen: this._screen().id });
    this._enter();
  }

  /** Efeitos de entrar numa tela. */
  private _enter(): void {
    const screen = this._screen();
    if (screen.id === "maturidade") {
      const selected = this._values.maturityFrameworks;
      const options = this._schema.find((step) => step.key === "maturityFrameworks")?.options ?? [];
      if ((!Array.isArray(selected) || selected.length === 0) && options.length > 0) this._update("maturityFrameworks", [options[0]!.value]);
    } else if (screen.id === "revisao" && this._mode === "greenfield") {
      const signature = previewSignature(this._values);
      if (this._values.resolvedTemplate && this._manifestSignature === signature) return;
      // Sem manifest, ou com um pedido para outras escolhas: pede de novo e descarta o antigo (H-BUG-25).
      // O host troca o dele quando o novo chega, pelo `stepUpdate`; até lá "Instalar" fica desabilitado.
      this._manifestSignature = signature;
      this._manifest = null;
      const fresh = { ...this._values };
      delete fresh.resolvedTemplate;
      this._values = fresh;
      this._bridge.postMessage({ type: "fetchTemplate", templateId: previewTemplateId(this._templatePrefix, this._values) });
    }
  }

  private _computeView(): WizardView {
    const screen = this._screen();
    const copy = SCREEN_COPY[screen.id];
    const isReview = screen.id === "revisao";
    const loadingTemplate = isReview && this._mode === "greenfield" && !this._values.resolvedTemplate;
    let issue = screenIssue(screen, this._values, this._ctx());
    if (screen.id === "modo" && this._choice === null) issue = "Escolha como você quer começar.";
    if (loadingTemplate) issue = "Carregando a prévia da estrutura.";
    const installing = this._phase === "installing";
    const installed = this._phase === "installed";
    const review = isReview || installing ? reviewModel(this._mode, this._values, this._workspace) : null;
    const blocked = installing || this._switching || issue !== null;
    return {
      screen: screen.id,
      mode: this._mode,
      index: this._index,
      total: this._journey.length,
      stepLabel: installed ? DONE_COPY.stepLabel : `Passo ${this._index + 1} de ${this._journey.length}`,
      title: installed ? DONE_COPY.title : copy.title,
      lead: installed ? DONE_COPY.lead : copy.lead,
      schema: this._schema,
      values: this._values,
      choice: this._choice,
      issue: installing || installed ? null : issue,
      fieldError: screen.id === "projeto" ? projectNameError(this._values) : null,
      inputEpoch: this._inputEpoch,
      nextLabel: installed
        ? this._installed?.folderIsOpen
          ? DONE_COPY.cockpit
          : DONE_COPY.close
        : isReview
          ? this._errors.length > 0
            ? INSTALL_COPY.retry
            : this._mode === "brownfield"
              ? "Instalar na pasta"
              : "Criar o projeto"
          : copy.next,
      nextDisabled: installed ? false : blocked,
      backDisabled: this._index === 0 || this._phase !== "editing" || this._switching,
      phase: this._phase,
      errors: this._errors,
      live: installing ? `${INSTALL_COPY.installing}…` : installed ? DONE_COPY.announce : "",
      workspace: this._workspace,
      review,
      manifest: this._manifest,
      loadingTemplate,
      installed: this._installed,
    };
  }

  private _emit(): void {
    this._view = this._computeView();
    for (const listener of this._listeners) listener();
  }
}
