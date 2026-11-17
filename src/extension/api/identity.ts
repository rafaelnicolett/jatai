/**
 * identity.ts — quem chamou a API, pelo que o VS Code sabe (F2.5, ADR-0023
 * §2). O id declarado não basta: a chamada tem de vir da pasta daquela
 * extensão, e o nome mostrado no pedido vem do manifesto instalado, nunca do
 * `displayName` que a extensão escreveu no registro.
 *
 * O VS Code não tem uma API de "quem chamou"; o Extension Host roda todas as
 * extensões no mesmo processo com os módulos na própria pasta, então a pilha
 * de chamada é a evidência disponível (ver `callerFromStack`).
 */

import * as vscode from "vscode";
import { callerFromStack } from "../../core/extension-api/api-contract.pure";

export interface ResolvedProvider {
  id: string;
  displayName: string;
}

export interface ProviderIdentity {
  /** `null` quando o editor não consegue dizer qual extensão chamou. */
  callerId(): string | null;
  /** O manifesto da extensão declarada; `undefined` se não existe ou não depende da Jataí. */
  describe(id: string): ResolvedProvider | undefined;
}

export function createVsCodeIdentity(context: vscode.ExtensionContext): ProviderIdentity {
  const selfId = context.extension.id;
  const selfPath = context.extensionPath;

  return {
    callerId: (): string | null =>
      callerFromStack(
        new Error().stack,
        vscode.extensions.all.map((extension) => ({ id: extension.id, path: extension.extensionPath })),
        selfPath
      ),
    describe: (id: string): ResolvedProvider | undefined => {
      const extension = vscode.extensions.getExtension(id);
      if (!extension) return undefined;
      const manifest = extension.packageJSON as
        | { displayName?: unknown; extensionDependencies?: unknown }
        | undefined;
      const dependencies = Array.isArray(manifest?.extensionDependencies) ? manifest.extensionDependencies : [];
      // ADR-0023 §Contexto: quem quer a API declara a Jataí em extensionDependencies,
      // o que garante que a Jataí já está ativa quando a companheira ativa.
      if (!dependencies.includes(selfId)) return undefined;
      const displayName =
        typeof manifest?.displayName === "string" && manifest.displayName.trim().length > 0
          ? manifest.displayName
          : id;
      return { id, displayName };
    },
  };
}
