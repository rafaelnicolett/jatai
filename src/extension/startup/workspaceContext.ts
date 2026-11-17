/**
 * workspaceContext.ts — liga a context key `<marca>.isWorkspace` (G9, F4.3).
 *
 * A barra lateral da marca decide o que mostrar por ela: fora de workspace da
 * marca, a view de boas-vindas convida a começar; dentro, a view principal
 * assume. A key vale `true` quando a pasta aberta tem o config da marca (ou o
 * de uma marca anterior, o mesmo critério de `shouldStartWorkspaceServices`) e
 * `false` sem pasta ou com uma pasta qualquer. Ela é regravada quando as
 * pastas abertas mudam e quando o Wizard termina de instalar na pasta aberta,
 * para o convite sumir sem recarregar a janela.
 *
 * Sem `vscode` nem I/O: as portas e a leitura da pasta entram pelo
 * construtor (`extension.ts` passa as do VS Code).
 */

import type { ContextKeys } from "../../adapters/context/ContextKeys";
import type { WorkspaceRoot } from "../../adapters/workspace/WorkspaceRoot";
import { isHelyxWorkspace, type WorkspaceActivationFacts } from "../../data/workspace-activation";
import { BRAND } from "../../data/brand.pure";

/** A key que as cláusulas `when` do manifesto leem. */
export const IS_WORKSPACE_KEY = `${BRAND.name}.isWorkspace`;

export interface WorkspaceContext {
  /** Lê a pasta aberta de novo e regrava a key. */
  refresh(): Promise<void>;
  dispose(): void;
}

export interface WorkspaceContextDeps {
  contextKeys: ContextKeys;
  workspaceRoot: WorkspaceRoot;
  /** O que a casca lê do disco sobre a pasta (`readWorkspaceActivationFacts`). */
  readFacts(root: string | undefined): WorkspaceActivationFacts;
}

export function bindWorkspaceContext(deps: WorkspaceContextDeps): WorkspaceContext {
  const refresh = (): Promise<void> => {
    const facts = deps.readFacts(deps.workspaceRoot.current());
    return deps.contextKeys.set(IS_WORKSPACE_KEY, facts.hasFolder && isHelyxWorkspace(facts.rootEntries));
  };
  const subscription = deps.workspaceRoot.onDidChange(() => void refresh());
  void refresh();
  return {
    refresh,
    dispose: (): void => subscription.dispose(),
  };
}
