/**
 * LanguageModel.ts — porta do modelo de linguagem do editor (F3.7, passo CH6
 * da análise: `LanguageModelPort`).
 *
 * O chat pede um modelo; sem modelo (`null`), segue só com o que é
 * determinístico. Sem `vscode` nem I/O.
 */

export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
}

export interface LanguageModelSession {
  /** Manda o prompt como uma mensagem do usuário e devolve os pedaços da resposta. Pode rejeitar. */
  send(prompt: string, cancel: CancellationSignal): Promise<AsyncIterable<string>>;
}

export interface LanguageModel {
  /** O modelo disponível, ou `null` quando não há nenhum. Nunca rejeita. */
  select(): Promise<LanguageModelSession | null>;
}

/** Sem modelo nenhum: o que um editor sem Copilot entrega. */
export class NoLanguageModel implements LanguageModel {
  select(): Promise<LanguageModelSession | null> {
    return Promise.resolve(null);
  }
}

/** Modelo que responde com pedaços fixos e grava os prompts, para testes. */
export class ScriptedLanguageModel implements LanguageModel {
  readonly prompts: string[] = [];

  constructor(private readonly _chunks: readonly string[]) {}

  select(): Promise<LanguageModelSession | null> {
    return Promise.resolve({
      send: (prompt: string): Promise<AsyncIterable<string>> => {
        this.prompts.push(prompt);
        const chunks = this._chunks;
        return Promise.resolve(
          (async function* (): AsyncGenerator<string> {
            for (const c of chunks) yield await Promise.resolve(c);
          })()
        );
      },
    });
  }
}
