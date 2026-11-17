import * as path from "path";
import type { WizardState } from "../../types";

/**
 * Pasta aberta no editor, de onde o greenfield sem destino explícito deriva o
 * seu. É a única coisa que o gerador pedia ao `vscode`; agora entra por porta
 * (F3.4, passo 6) e o gerador não importa o host.
 */
export type OpenFolderPort = () => string | undefined;

/**
 * Destino final do projeto greenfield (função pura):
 *   1. a pasta que o usuário escolheu no Wizard;
 *   2. senão, uma subpasta `<projeto>` da pasta aberta no editor;
 *   3. senão, `<home>/<projeto>`.
 */
export function resolveTargetDir(state: WizardState, openFolder: string | undefined, homeDir: string): string {
  // Explicit override from wizard step (user picked a folder)
  if (state.targetDirectory !== undefined && state.targetDirectory.trim() !== "") {
    // Normalise path separators (handles Windows backslash vs forward slash)
    return path.normalize(state.targetDirectory.trim());
  }
  if (openFolder !== undefined) {
    // Place project as a subfolder inside the open workspace, not AT the root
    return path.join(openFolder, state.projectName);
  }
  return path.join(homeDir, state.projectName);
}
