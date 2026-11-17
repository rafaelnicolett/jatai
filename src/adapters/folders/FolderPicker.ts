/**
 * FolderPicker.ts — porta do seletor de pasta (F4.3).
 *
 * O Wizard pede à pessoa onde criar o projeto ou o workspace (decisão do
 * titular, 2026-11-15: uma pasta por janela; sem pasta aberta, o Wizard pede
 * onde criar). Quem decide o que fazer com a pasta é a sessão; a porta só
 * abre o seletor e devolve o caminho. Sem `vscode` nem I/O.
 */

export interface FolderPickerOptions {
  /** Título do diálogo. */
  title: string;
  /** Rótulo do botão de confirmar. */
  openLabel: string;
  /** Pasta em que o diálogo abre; sem ela, vale o padrão do sistema. */
  defaultFolder?: string;
}

export interface FolderPicker {
  /** Caminho absoluto da pasta escolhida; `undefined` se a pessoa cancelar. */
  pick(options: FolderPickerOptions): Promise<string | undefined>;
}

/**
 * Seletor roteirizado, para testes: responde com as respostas na ordem e
 * guarda o que foi pedido. Sem resposta sobrando, é como cancelar.
 */
export class ScriptedFolderPicker implements FolderPicker {
  readonly asked: FolderPickerOptions[] = [];

  constructor(private readonly _answers: Array<string | undefined> = []) {}

  pick(options: FolderPickerOptions): Promise<string | undefined> {
    this.asked.push(options);
    return Promise.resolve(this._answers.shift());
  }
}
