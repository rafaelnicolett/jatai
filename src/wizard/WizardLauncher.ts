/**
 * WizardLauncher.ts — abre o Wizard sem abrir dois (H-BUG-53, F4.3).
 *
 * Cada comando de abrir o Wizard criava um controller novo, e a guarda do
 * "já está aberto" era por instância: a abertura automática da primeira
 * ativação e o clique na barra lateral geravam dois painéis. Com o convite
 * "Começar com a Jataí" na barra lateral, clicar duas vezes seguidas também.
 * O lançador guarda o Wizard aberto e só cria outro depois que ele fecha,
 * então cada abertura começa do zero (estado e modo da sessão novos), como
 * sempre começou. Sem `vscode`: quem cria o Wizard entra pelo construtor.
 */

export interface WizardHandle {
  /** O painel do Wizard está aberto. */
  readonly isOpen: boolean;
  /** Abre o painel, ou o traz à frente se já está aberto. */
  start(): Promise<void>;
}

export class WizardLauncher {
  private _current: WizardHandle | undefined;

  constructor(private readonly _create: () => WizardHandle) {}

  async open(): Promise<void> {
    if (this._current === undefined || !this._current.isOpen) this._current = this._create();
    await this._current.start();
  }
}
