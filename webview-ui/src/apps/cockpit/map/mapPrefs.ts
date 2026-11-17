/**
 * mapPrefs.ts — o que a pessoa escolhe no mapa e o que vale quando ela ainda
 * não escolheu (F5.3). Puro: o DOM só entrega os sinais.
 *
 * - Modo (cena ou lista): a escolha lembrada vale sempre. Sem escolha, abre em
 *   lista quando o VS Code informa leitor de tela (`vscode-using-screen-reader`)
 *   ou o painel é estreito (menos de 600 px), como manda o DS v2 §3.12 e §4.8;
 *   senão, em cena. É a resposta à questão aberta 4 do DS v2: com leitor de
 *   tela a lista é o padrão, e a pessoa troca quando quiser.
 * - Variante da cena (noite ou dia): padrão noite, que é o crepúsculo do DS v2.
 *   Quem escolhe dia fica com dia. A variante que segue o tema do editor
 *   (claro → dia) é uma decisão do titular e vem pronta em `followTheme`.
 * - Movimento: reduzido vence a pausa, e a pausa vence o ao vivo. A aba oculta
 *   também pausa (DS v2 §3.11: renderização suspensa com a aba oculta).
 */

export type MapMode = "scene" | "list";
export type SceneVariant = "night" | "day";
export type MotionState = "live" | "paused" | "reduced";

/** Abaixo desta largura (px) do painel, a lista é o padrão (DS v2 §3.12). */
export const LIST_BELOW_WIDTH = 600;

export function resolveMapMode(input: { stored?: MapMode; screenReader: boolean; width: number }): MapMode {
  if (input.stored) return input.stored;
  return input.screenReader || (input.width > 0 && input.width < LIST_BELOW_WIDTH) ? "list" : "scene";
}

export interface ThemeSignals {
  /** `body.vscode-light` ou `body.vscode-high-contrast-light`, ou o tema claro avulso. */
  light: boolean;
}

/** `followTheme` liga a decisão pendente do titular: o dia acompanha o tema claro do editor. */
export function resolveSceneVariant(input: { stored?: SceneVariant; followTheme?: boolean; theme?: ThemeSignals }): SceneVariant {
  if (input.stored) return input.stored;
  return input.followTheme && input.theme?.light ? "day" : "night";
}

export interface MotionSignals {
  /** `prefers-reduced-motion`, `body.vscode-reduce-motion` ou `:root[data-motion="reduce"]`. */
  reducedMotion: boolean;
  /** A pessoa apertou "Pausar". */
  userPaused: boolean;
  /** A aba (ou o painel) está oculta. */
  hidden: boolean;
}

export function resolveMotion(s: MotionSignals): MotionState {
  if (s.reducedMotion) return "reduced";
  return s.userPaused || s.hidden ? "paused" : "live";
}

/** Lê os sinais do documento. Fica à parte da lógica acima para o teste montar qualquer combinação. */
export interface DocumentSignals {
  matchMedia?: (query: string) => { matches: boolean };
  bodyClasses: DOMTokenList | { contains(name: string): boolean };
  rootMotion?: string | null;
  visibility?: string;
}

export function readReducedMotion(doc: DocumentSignals): boolean {
  return (
    doc.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    doc.bodyClasses.contains("vscode-reduce-motion") ||
    doc.rootMotion === "reduce"
  );
}

export function readScreenReader(doc: Pick<DocumentSignals, "bodyClasses">): boolean {
  return doc.bodyClasses.contains("vscode-using-screen-reader");
}

export function readLightTheme(doc: DocumentSignals & { rootTheme?: string | null }): boolean {
  if (doc.bodyClasses.contains("vscode-light") || doc.bodyClasses.contains("vscode-high-contrast-light")) return true;
  if (doc.rootTheme === "light") return true;
  return doc.matchMedia?.("(prefers-color-scheme: light)").matches === true && !doc.bodyClasses.contains("vscode-dark");
}
