/**
 * VsCodeSecrets.ts — a porta `Secrets` sobre o `SecretStorage` do contexto
 * da extensão.
 */

import type * as vscode from "vscode";
import type { Secrets } from "./Secrets";

export class VsCodeSecrets implements Secrets {
  constructor(private readonly _storage: vscode.SecretStorage) {}

  async store(key: string, value: string): Promise<void> {
    // `SecretStorage.store` devolve `Thenable<void>`: o `await` o converte.
    await this._storage.store(key, value);
  }
}
