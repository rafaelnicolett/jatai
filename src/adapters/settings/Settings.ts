/**
 * Settings.ts — porta das configurações da extensão (F3.6).
 *
 * As chaves são relativas à seção da marca (`<configSection>.<chave>`, ver
 * `brand.json`): quem lê pede `approvalFriction.riskFields`, não o nome
 * completo. Lida a cada chamada, porque o usuário muda a configuração sem
 * recarregar a extensão. Sem `vscode` nem I/O.
 */

export interface Settings {
  /** Valor da chave na seção da marca, ou `defaultValue` quando não definido. */
  get<T>(key: string, defaultValue: T): T;
}

/** Configuração em memória, para testes. */
export class InMemorySettings implements Settings {
  constructor(private readonly _values: Readonly<Record<string, unknown>> = {}) {}

  get<T>(key: string, defaultValue: T): T {
    return Object.prototype.hasOwnProperty.call(this._values, key) ? (this._values[key] as T) : defaultValue;
  }
}
