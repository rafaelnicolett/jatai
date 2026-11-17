/**
 * ContextKeys.ts — porta das context keys do editor (G9, F4.3).
 *
 * As context keys são o que as cláusulas `when` do manifesto leem (a view de
 * boas-vindas só aparece fora de workspace da marca). A porta só grava o valor;
 * quem decide o valor é o startup. Sem `vscode` nem I/O.
 */

export interface ContextKeys {
  set(key: string, value: boolean): Promise<void>;
}

/** Context keys em memória, para testes: guarda o valor atual e o histórico das gravações. */
export class RecordingContextKeys implements ContextKeys {
  readonly values = new Map<string, boolean>();
  readonly history: Array<[string, boolean]> = [];

  set(key: string, value: boolean): Promise<void> {
    this.values.set(key, value);
    this.history.push([key, value]);
    return Promise.resolve();
  }
}
