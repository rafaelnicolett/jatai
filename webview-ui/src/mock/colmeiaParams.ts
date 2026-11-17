/**
 * colmeiaParams.ts — os parâmetros da página do mapa no navegador
 * (`mapa.html?cenario=vivo&vista=mapa&cena=dia…`), em função pura. SÓ para o
 * harness visual; o titular roda com o Vite (README do `webview-ui`) e a
 * captura de telas usa os mesmos parâmetros.
 *
 * | Parâmetro | Valores | O que faz |
 * |---|---|---|
 * | `cenario` | `vivo` (padrão), `hotfix`, `vazio`, `estresse` | a história: a Missão em laço, o hotfix, sem iniciativa, 30 agentes |
 * | `vista` | `mapa`, `cockpit` (padrão) | qual vista abre |
 * | `cena` | `dia`, `noite` | a variante lembrada da cena |
 * | `modo` | `lista`, `mapa` | o modo lembrado |
 * | `movimento` | `reduzido` | liga o movimento reduzido (`data-motion="reduce"`) |
 * | `tema` | `claro`, `escuro` (padrão) | o tema do editor (neutros) |
 * | `contraste` | `alto` | alto contraste (a cena esquemática) |
 * | `leitor` | `1` | finge o leitor de tela (`vscode-using-screen-reader`) |
 * | `passos` | número | aplica N passos da história antes de mostrar |
 * | `parado` | `1` | a história não anda sozinha (para capturas) |
 * | `ritmo` | ms | o intervalo entre passos (padrão 1600) |
 */

export type MockScenario = "vivo" | "hotfix" | "vazio" | "estresse";

export interface MockParams {
  scenario: MockScenario;
  view: "mapa" | "cockpit";
  scene: "dia" | "noite" | null;
  mode: "lista" | "mapa" | null;
  reducedMotion: boolean;
  theme: "claro" | "escuro";
  highContrast: boolean;
  screenReader: boolean;
  steps: number;
  frozen: boolean;
  tickMs: number;
}

const SCENARIOS: readonly MockScenario[] = ["vivo", "hotfix", "vazio", "estresse"];

export function readMockParams(search: string): MockParams {
  const q = new URLSearchParams(search);
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const v = q.get(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };
  const number = (key: string, fallback: number): number => {
    const n = Number(q.get(key));
    return Number.isFinite(n) && q.get(key) !== null && q.get(key) !== "" ? n : fallback;
  };
  return {
    scenario: pick("cenario", SCENARIOS) ?? "vivo",
    view: pick("vista", ["mapa", "cockpit"] as const) ?? "cockpit",
    scene: pick("cena", ["dia", "noite"] as const),
    mode: pick("modo", ["lista", "mapa"] as const),
    reducedMotion: q.get("movimento") === "reduzido",
    theme: pick("tema", ["claro", "escuro"] as const) ?? "escuro",
    highContrast: q.get("contraste") === "alto",
    screenReader: q.get("leitor") === "1",
    steps: Math.max(0, Math.floor(number("passos", 0))),
    frozen: q.get("parado") === "1",
    tickMs: Math.max(200, number("ritmo", 1600)),
  };
}
