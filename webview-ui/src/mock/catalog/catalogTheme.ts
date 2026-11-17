/**
 * Troca de tema do catálogo do DS v2 (fora do VS Code). Mexe só nos sinais
 * que o tokens.css lê (DS v2 §2.2):
 * - fora do VS Code: `data-theme` e `data-contrast` no <html>;
 * - "como no VS Code": `data-host="vscode"` no <html>, a classe de tema no
 *   <body> e algumas variáveis `--vscode-*` de um tema padrão, para ver os
 *   neutros seguindo o editor e os acentos da marca por cima;
 * - movimento reduzido: `data-motion="reduce"`.
 */

export type CatalogTheme = "dark" | "light" | "hcDark" | "hcLight";

export interface CatalogThemeState {
  theme: CatalogTheme;
  /** Simula o webview dentro do VS Code (tema padrão do editor). */
  vscode: boolean;
  reduceMotion: boolean;
}

export const CATALOG_THEMES: Array<{ id: CatalogTheme; label: string }> = [
  { id: "dark", label: "Escuro" },
  { id: "light", label: "Claro" },
  { id: "hcDark", label: "Alto contraste escuro" },
  { id: "hcLight", label: "Alto contraste claro" },
];

const BODY_CLASS: Record<CatalogTheme, string[]> = {
  dark: ["vscode-dark"],
  light: ["vscode-light"],
  hcDark: ["vscode-high-contrast"],
  // o VS Code põe as duas classes no AC claro
  hcLight: ["vscode-high-contrast", "vscode-high-contrast-light"],
};

const ALL_BODY_CLASSES = ["vscode-dark", "vscode-light", "vscode-high-contrast", "vscode-high-contrast-light"];

/** Aproximação dos temas padrão do VS Code (Dark Modern, Light Modern, AC escuro e AC claro). */
export const VSCODE_THEME_VARS: Record<CatalogTheme, Record<string, string>> = {
  dark: {
    "--vscode-editor-background": "#1F1F1F",
    "--vscode-editor-foreground": "#CCCCCC",
    "--vscode-foreground": "#CCCCCC",
    "--vscode-descriptionForeground": "#9D9D9D",
    "--vscode-focusBorder": "#0078D4",
    "--vscode-widget-border": "#313131",
    "--vscode-widget-shadow": "rgba(0, 0, 0, 0.36)",
  },
  light: {
    "--vscode-editor-background": "#FFFFFF",
    "--vscode-editor-foreground": "#3B3B3B",
    "--vscode-foreground": "#3B3B3B",
    "--vscode-descriptionForeground": "#717171",
    "--vscode-focusBorder": "#005FB8",
    "--vscode-widget-border": "#E5E5E5",
    "--vscode-widget-shadow": "rgba(0, 0, 0, 0.16)",
  },
  hcDark: {
    "--vscode-editor-background": "#000000",
    "--vscode-editor-foreground": "#FFFFFF",
    "--vscode-foreground": "#FFFFFF",
    "--vscode-descriptionForeground": "#FFFFFF",
    "--vscode-focusBorder": "#F38518",
    "--vscode-contrastBorder": "#6FC3DF",
  },
  hcLight: {
    "--vscode-editor-background": "#FFFFFF",
    "--vscode-editor-foreground": "#292929",
    "--vscode-foreground": "#292929",
    "--vscode-descriptionForeground": "#292929",
    "--vscode-focusBorder": "#006BBD",
    "--vscode-contrastBorder": "#0F4A85",
  },
};

const ALL_VSCODE_VARS = [...new Set(Object.values(VSCODE_THEME_VARS).flatMap((v) => Object.keys(v)))];

export function applyCatalogTheme(doc: Document, state: CatalogThemeState): void {
  const html = doc.documentElement;
  const body = doc.body;

  for (const name of ALL_VSCODE_VARS) html.style.removeProperty(name);
  body.classList.remove(...ALL_BODY_CLASSES);
  html.removeAttribute("data-theme");
  html.removeAttribute("data-contrast");
  html.removeAttribute("data-host");

  if (state.vscode) {
    html.setAttribute("data-host", "vscode");
    body.classList.add(...BODY_CLASS[state.theme]);
    for (const [name, value] of Object.entries(VSCODE_THEME_VARS[state.theme])) html.style.setProperty(name, value);
  } else {
    html.setAttribute("data-theme", state.theme === "light" || state.theme === "hcLight" ? "light" : "dark");
    if (state.theme === "hcDark" || state.theme === "hcLight") html.setAttribute("data-contrast", "more");
  }

  if (state.reduceMotion) html.setAttribute("data-motion", "reduce");
  else html.removeAttribute("data-motion");
}
