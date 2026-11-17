#!/usr/bin/env node
/**
 * build-tokens.mjs: gera `src/design-system/tokens/tokens.css` a partir de
 * `src/design-system/tokens/tokens.json` (design system v2, F4.2).
 *
 * O JSON é a fonte da verdade; o CSS é derivado e nunca se edita à mão. Um
 * teste do webview (`tests/tokens.test.ts`) confere que o arquivo gravado é
 * igual ao que este script gera, então esquecer de rodar reprova o CI.
 *
 * Blocos gerados, na ordem:
 *   1. escalas sem tema (tipo, espaço, raio, camadas, movimento, tamanhos)
 *   2. tema escuro (padrão fora do VS Code)
 *   3. tema claro (data-theme="light" ou prefers-color-scheme: light)
 *   4. alto contraste fora do VS Code (data-contrast="more" ou prefers-contrast: more)
 *   5. derivados (feedback e elevação), declarados de novo em cada elemento que redefine cor
 *   6. no VS Code (html[data-host="vscode"]): neutros seguem o tema do usuário, acentos da marca por cima
 *   7. cena do Mapa ([data-scene]), a variante de dia e o modo esquemático no alto contraste
 *   8. movimento reduzido e pausa
 *   9. forced-colors
 *
 * Uso:
 *   node scripts/build-tokens.mjs           grava o tokens.css
 *   node scripts/build-tokens.mjs --check   só confere (exit 1 se estiver desatualizado)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOKENS_JSON = path.resolve(HERE, "../src/design-system/tokens/tokens.json");
export const TOKENS_CSS = path.resolve(HERE, "../src/design-system/tokens/tokens.css");

const THEMES = ["dark", "light", "hcDark", "hcLight"];
const HC = new Set(["hcDark", "hcLight"]);

const VSCODE_BODY = 'html[data-host="vscode"] body';
const VSCODE_SELECTOR = {
  dark: VSCODE_BODY,
  light: `${VSCODE_BODY}.vscode-light`,
  hcDark: `${VSCODE_BODY}.vscode-high-contrast`,
  // o VS Code põe as duas classes (high-contrast e high-contrast-light) no AC claro
  hcLight: `${VSCODE_BODY}.vscode-high-contrast-light`,
};
const COLOR_SCHEME = { dark: "dark", light: "light", hcDark: "dark", hcLight: "light" };

function isToken(node) {
  return node !== null && typeof node === "object" && typeof node.css === "string" && "value" in node;
}

/** Tokens de um grupo, na ordem do JSON (desce em subgrupos, como os status). */
function tokensOf(group) {
  const out = [];
  for (const node of Object.values(group ?? {})) {
    if (isToken(node)) out.push(node);
    else if (node && typeof node === "object" && !Array.isArray(node)) out.push(...tokensOf(node));
  }
  return out;
}

function str(v) {
  return typeof v === "number" ? String(v) : v;
}

function decl(name, value) {
  return `  ${name}: ${str(value)};`;
}

function block(selector, lines, indent = "") {
  const body = lines.map((l) => indent + l).join("\n");
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

/** Busca um token por caminho (`color.neutral.bg`). */
function at(tokens, dotted) {
  const node = dotted.split(".").reduce((o, k) => (o ? o[k] : undefined), tokens);
  if (!isToken(node)) throw new Error(`tokens.json: ${dotted} não é um token`);
  return node;
}

/** Cores com um valor por tema: marca, neutros, status e feedback (o que não é derivado). */
function themedColors(tokens) {
  const groups = [tokens.color.brand, tokens.color.neutral, tokens.color.status, tokens.color.feedback];
  return groups.flatMap(tokensOf).filter((t) => t.value && typeof t.value === "object");
}

/** Cores derivadas (um var() só, igual em todo tema): feedback de perigo, sucesso e informação. */
function derivedColors(tokens) {
  return tokensOf(tokens.color.feedback).filter((t) => typeof t.value === "string");
}

function themeLines(tokens, theme) {
  return themedColors(tokens).map((t) => decl(t.css, t.value[theme]));
}

/**
 * Valor de um token no VS Code: o mapeamento para `--vscode-*` (neutros e
 * fundos de status) ou o valor literal do tema (acentos da marca). Toda
 * `var(--vscode-x)` sem fallback ganha o valor do tema, para o webview nunca
 * ficar sem cor se o VS Code deixar de mandar uma variável.
 */
function vscodeValue(tokens, token, theme) {
  const v = token.vscode;
  if (!v || typeof v !== "object" || !("mapping" in v)) return token.value[theme];
  const expr = HC.has(theme) ? v.highContrast : v.mapping;
  const from = tokens.meta.vscodeFallbacks?.from ?? {};
  return expr.replace(/var\((--vscode-[A-Za-z0-9-]+)\)/g, (_, name) => {
    const source = from[name] ? at(tokens, from[name]) : token;
    return `var(${name}, ${source.value[theme]})`;
  });
}

function vscodeLines(tokens, theme) {
  return themedColors(tokens).map((t) => decl(t.css, vscodeValue(tokens, t, theme)));
}

function sceneLines(tokens, variant) {
  const lines = [];
  for (const t of tokensOf(tokens.color.scene)) {
    if (variant === "default") lines.push(decl(t.css, t.value));
    else if (variant === "day") {
      // Variante de dia (F5.3): só os tokens que mudam; o resto da cena herda o crepúsculo.
      if (t.day !== undefined) lines.push(decl(t.css, t.day));
    } else if (t.highContrast) lines.push(decl(t.css, t.highContrast[variant]));
  }
  return lines;
}

function scaleLines(tokens) {
  const f = tokens.font;
  const lines = [];
  for (const t of tokensOf(f.family)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(f.weight)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(f.size)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(f.lineHeight)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(f.letterSpacing)) lines.push(decl(t.css, t.value));
  lines.push("  /* estilos compostos: font: var(--jt-type-*); tracking e caixa ficam à parte (ver tokens.json) */");
  for (const t of tokensOf(tokens.typography)) {
    const v = t.value;
    lines.push(decl(t.css, `${v.weight} ${v.size}/${v.lineHeight} ${v.family}`));
  }
  lines.push("", "  /* espaço: base 4px */");
  for (const t of tokensOf(tokens.space)) lines.push(decl(t.css, t.value));
  lines.push("", "  /* raio */");
  for (const t of tokensOf(tokens.radius)) lines.push(decl(t.css, t.value));
  lines.push("", "  /* camadas */");
  for (const t of tokensOf(tokens.zIndex)) lines.push(decl(t.css, t.value));
  lines.push("", "  /* movimento */");
  for (const t of tokensOf(tokens.motion.duration)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(tokens.motion.easing)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(tokens.motion.iterations)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(tokens.motion.distance)) lines.push(decl(t.css, t.value));
  lines.push(decl(tokens.motion.paused.css, "running"));
  lines.push("", "  /* tamanhos e grade */");
  for (const t of tokensOf(tokens.size)) lines.push(decl(t.css, t.value));
  for (const t of tokensOf(tokens.layout)) lines.push(decl(t.css, t.value));
  const bps = tokensOf(tokens.breakpoint)
    .map((t) => `${t.css.replace("--jt-bp-", "")} ${t.value}`)
    .join(" · ");
  lines.push(`  /* breakpoints (custom property não funciona em @media; use o literal): ${bps} */`);
  return lines;
}

function reducedMotionLines(tokens) {
  const rm = tokens.motion.reducedMotion.value;
  const lines = [];
  for (const [key, value] of Object.entries(rm)) {
    if (key.endsWith("-*")) {
      const prefix = `--jt-${key.slice(0, -1)}`;
      const group = key.startsWith("iterations") ? tokens.motion.iterations : tokens.motion.distance;
      for (const t of tokensOf(group)) {
        if (!t.css.startsWith(prefix)) throw new Error(`reducedMotion: ${t.css} fora de ${key}`);
        lines.push(decl(t.css, value));
      }
    } else {
      lines.push(decl(`--jt-${key}`, value));
    }
  }
  return lines;
}

/** Gera o tokens.css inteiro (string). Pura: mesma entrada, mesma saída. */
export function buildTokensCss(tokens) {
  const parts = [];
  parts.push(`/* =====================================================================
   tokens.css · design system v2 (prefixo ${tokens.meta.cssPrefix})
   GERADO por webview-ui/scripts/build-tokens.mjs a partir de tokens.json.
   Não edite à mão: mude o tokens.json e rode \`npm run tokens\`.

   Regra: componentes só usam --jt-*. Nunca --vscode-* direto (o mapeamento
   vive só aqui) e nunca hex cru.
   Fontes: nenhuma embutida; o webview usa a fonte de interface e a de código
   do VS Code (ver font.files no tokens.json).
   ===================================================================== */`);

  parts.push("/* ---------- 1. Escalas sem tema ---------- */");
  parts.push(block(":root", scaleLines(tokens)));

  parts.push("/* ---------- 2. Tema escuro (padrão fora do VS Code) ---------- */");
  parts.push(block(":root", [decl("color-scheme", "dark"), ...themeLines(tokens, "dark")]));

  parts.push("/* ---------- 3. Tema claro ---------- */");
  const light = [decl("color-scheme", "light"), ...themeLines(tokens, "light")];
  parts.push(block(':root[data-theme="light"]', light));
  parts.push(`@media (prefers-color-scheme: light) {\n${block(":root:not([data-theme])", light, "  ")}\n}`);

  parts.push("/* ---------- 4. Alto contraste fora do VS Code (texto ≥ 7:1, sem tintas nem sombras) ---------- */");
  const hcDark = [decl("color-scheme", "dark"), ...themeLines(tokens, "hcDark")];
  const hcLight = [decl("color-scheme", "light"), ...themeLines(tokens, "hcLight")];
  parts.push(block(':root[data-contrast="more"]', hcDark));
  parts.push(block(':root[data-theme="light"][data-contrast="more"]', hcLight));
  parts.push(
    `@media (prefers-contrast: more) {\n${block(":root:not([data-contrast])", hcDark, "  ")}\n${block(
      ':root[data-theme="light"]:not([data-contrast])',
      hcLight,
      "  ",
    )}\n}`,
  );
  parts.push(
    `@media (prefers-contrast: more) and (prefers-color-scheme: light) {\n${block(
      ":root:not([data-theme]):not([data-contrast])",
      hcLight,
      "  ",
    )}\n}`,
  );

  parts.push(`/* ---------- 5. Derivados ----------
   Declarados de novo em cada elemento que redefine cor (raiz, body no VS
   Code, cena): uma custom property com var() resolve onde é declarada. */`);
  const derived = [
    ...derivedColors(tokens).map((t) => decl(t.css, t.value)),
    ...tokensOf(tokens.elevation).map((t) => decl(t.css, t.value)),
  ];
  parts.push(block(`:root,\n${VSCODE_BODY},\n[data-scene]`, derived));

  parts.push(`/* ---------- 6. No VS Code ----------
   O webview põe data-host="vscode" no <html>. O VS Code injeta as variáveis
   --vscode-* no <html> e as classes de tema no <body>. Neutros seguem o tema
   do usuário; acentos da marca vêm por cima, um conjunto por tipo de tema. */`);
  for (const theme of THEMES) {
    parts.push(block(VSCODE_SELECTOR[theme], [decl("color-scheme", COLOR_SCHEME[theme]), ...vscodeLines(tokens, theme)]));
  }

  parts.push(`/* ---------- 7. Cena do Mapa ----------
   A cena é crepúsculo em qualquer tema; só o alto contraste a troca pelo
   modo esquemático. */`);
  parts.push(block("[data-scene]", [decl("color-scheme", "dark"), ...themeLines(tokens, "dark"), ...sceneLines(tokens, "default")]));
  parts.push(`/* Variante de dia (F5.3): a cena com a paleta clara e os neutros e status do tema claro.
   Fica fora de forced-colors, e o alto contraste (seletores mais específicos) vence por cima. */`);
  parts.push(
    `@media (forced-colors: none) {\n${block('[data-scene][data-scene-variant="day"]', [
      decl("color-scheme", "light"),
      ...themeLines(tokens, "light"),
      ...sceneLines(tokens, "day"),
    ], "  ")}\n}`,
  );
  parts.push(
    block(`:root[data-contrast="more"] [data-scene],\n${VSCODE_SELECTOR.hcDark} [data-scene]`, [
      decl("color-scheme", "dark"),
      ...themeLines(tokens, "hcDark"),
      ...sceneLines(tokens, "hcDark"),
    ]),
  );
  parts.push(
    block(`:root[data-theme="light"][data-contrast="more"] [data-scene],\n${VSCODE_SELECTOR.hcLight} [data-scene]`, [
      decl("color-scheme", "light"),
      ...themeLines(tokens, "hcLight"),
      ...sceneLines(tokens, "hcLight"),
    ]),
  );
  parts.push(
    `@media (prefers-contrast: more) {\n${block(":root:not([data-contrast]):not([data-host]) [data-scene]", [
      decl("color-scheme", "dark"),
      ...themeLines(tokens, "hcDark"),
      ...sceneLines(tokens, "hcDark"),
    ], "  ")}\n}`,
  );

  parts.push(`/* ---------- 8. Movimento reduzido e pausa ----------
   Nada se move; o estado continua visível. Cor e opacidade em até 120 ms. */`);
  const rm = reducedMotionLines(tokens);
  parts.push(`@media (prefers-reduced-motion: reduce) {\n${block(":root", rm, "  ")}\n}`);
  parts.push(block(`:root[data-motion="reduce"],\n${VSCODE_BODY}.vscode-reduce-motion`, rm));
  parts.push(block('[data-motion="paused"]', [decl(tokens.motion.paused.css, "paused")]));

  parts.push(`/* ---------- 9. forced-colors (Windows Alto Contraste) ----------
   Seletores com especificidade igual ou maior que a dos blocos de AC acima
   (vence por vir depois). */`);
  const fc = Object.entries(tokens.forcedColors.value).map(([k, v]) => decl(k, v));
  parts.push(
    `@media (forced-colors: active) {\n${block(
      [
        ":root",
        `${VSCODE_BODY}[class]`,
        "[data-scene]",
        `${VSCODE_BODY}[class] [data-scene]`,
        ":root[data-theme][data-contrast] [data-scene]",
        ":root:not([data-contrast]):not([data-host]) [data-scene]",
      ].join(",\n  "),
      fc,
      "  ",
    )}\n}`,
  );

  return parts.join("\n\n") + "\n";
}

export function readTokens(file = TOKENS_JSON) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function main(argv) {
  const css = buildTokensCss(readTokens());
  if (argv.includes("--check")) {
    const current = fs.existsSync(TOKENS_CSS) ? fs.readFileSync(TOKENS_CSS, "utf-8") : "";
    if (current !== css) {
      console.error("tokens.css desatualizado: rode `npm run tokens` no webview-ui.");
      return 1;
    }
    console.log("tokens.css em dia.");
    return 0;
  }
  fs.writeFileSync(TOKENS_CSS, css);
  console.log(`tokens.css gerado (${css.split("\n").length} linhas).`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
