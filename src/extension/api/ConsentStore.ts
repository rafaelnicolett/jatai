/**
 * ConsentStore.ts — onde o consentimento por workspace é guardado (F2.5,
 * ADR-0023 §2). O `workspaceState` do VS Code é, por definição, por workspace
 * e por extensão: a autorização dada em "loja" não vale em "blog".
 *
 * A interface não importa `vscode`; a implementação de produção embrulha o
 * `Memento`. Os testes usam `MemoryConsentStore`.
 */

import type * as vscode from "vscode";
import type { ConsentBook } from "../../core/extension-api/api-contract.pure";
import { BRAND } from "../../core/brand/brand.pure";

export const CONSENT_STATE_KEY = `${BRAND.commandPrefix}.apiConsent`;

export interface ConsentStore {
  read(): ConsentBook;
  write(book: ConsentBook): Promise<void>;
}

export class MementoConsentStore implements ConsentStore {
  constructor(private readonly _memento: Pick<vscode.Memento, "get" | "update">) {}

  read(): ConsentBook {
    return this._memento.get<ConsentBook>(CONSENT_STATE_KEY, {}) ?? {};
  }

  write(book: ConsentBook): Promise<void> {
    return Promise.resolve(this._memento.update(CONSENT_STATE_KEY, book));
  }
}

/** Store em memória para os testes e para quem monta o hub fora do VS Code. */
export class MemoryConsentStore implements ConsentStore {
  private _book: ConsentBook = {};

  constructor(initial: ConsentBook = {}) {
    this._book = initial;
  }

  read(): ConsentBook {
    return this._book;
  }

  write(book: ConsentBook): Promise<void> {
    this._book = book;
    return Promise.resolve();
  }
}
