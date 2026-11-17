#!/usr/bin/env node
/**
 * Captura as telas do README (F7.5) com o Chrome em modo
 * headless, falando o protocolo DevTools (CDP) pelo WebSocket do Node. Não
 * instala nada: só precisa do Chrome (ou do Chromium) e do mock já construído.
 *
 *   npx vite build -c vite.config.mock.ts          # gera webview-ui/mock-dist
 *   node scripts/capture-cockpit-scenarios.mjs --out <pasta> [--only <trecho>]
 *
 * Variáveis: CHROME_PATH aponta para o executável (o padrão é o do macOS).
 *
 * Cada captura abre `mock.html?scenario=<id>&theme=<tema>` num servidor local
 * efêmero, espera o Cockpit assentar, roda os passos de clique (se houver) e
 * grava um PNG. Ao final grava `capturas.json` com o que cada arquivo mostra e
 * quantos erros de console houve (só o cenário "erro" deve ter).
 *
 * Isto é o mock num navegador, NÃO o VS Code: o webview real pode diferir em
 * fonte, tema do editor e variáveis `--vscode-*`.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../mock-dist");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const outDir = argValue("--out");
const only = argValue("--only");
if (!outDir) {
  console.error("uso: node scripts/capture-cockpit-scenarios.mjs --out <pasta> [--only <trecho do nome>]");
  process.exit(2);
}

/** Clica no primeiro elemento do seletor cujo texto (ou aria-label) contém o trecho. */
const click = (selector, text) =>
  `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => (e.textContent || "").includes(${JSON.stringify(text)}) || (e.getAttribute("aria-label") || "").includes(${JSON.stringify(text)})); if (!el) throw new Error("não achei ${text}"); el.click(); return true; })()`;

/**
 * file: nome do PNG; scenario: id do cenário do mock; theme: dark | light | hcDark | hcLight;
 * forcedColors: emula o Alto Contraste do Windows; width/height: viewport; settle: espera em ms;
 * steps: expressões JS rodadas na página antes da captura; about: o que a captura mostra.
 */
const SHOTS = [
  { file: "cockpit-escuro", url: "mock.html?scenario=execucao&theme=dark", theme: "dark", width: 1440, height: 900, settle: 2200, about: "Cockpit no tema escuro: a tela Agora, a trilha da fase, o quadro do épico e o que espera você" },
  { file: "cockpit-claro", url: "mock.html?scenario=execucao&theme=light", theme: "light", width: 1440, height: 900, settle: 2200, about: "O mesmo Cockpit no tema claro" },
  { file: "decisoes-escuro", url: "mock.html?scenario=decisoes&theme=dark", theme: "dark", width: 1440, height: 900, settle: 2200, about: "As decisões que esperam você, com o gate primeiro" },
  { file: "mapa-escuro", url: "mapa.html?cenario=vivo&vista=mapa&parado=1&passos=5&tema=escuro", theme: "dark", width: 1440, height: 900, settle: 4500, about: "O mapa da colmeia: ilhas, pontes, abelhas e potes" },
  { file: "mapa-claro", url: "mapa.html?cenario=vivo&vista=mapa&parado=1&passos=5&tema=claro&cena=dia", theme: "light", width: 1440, height: 900, settle: 4500, about: "O mapa no tema claro, com a cena de dia" },
  { file: "wizard-escuro", url: "wizard.html?screen=abertura&theme=dark", theme: "dark", width: 1440, height: 900, settle: 2200, about: "O Wizard: a primeira tela da jornada de preparação" },
  { file: "wizard-claro", url: "wizard.html?screen=abertura&theme=light", theme: "light", width: 1440, height: 900, settle: 2200, about: "O Wizard no tema claro" },
].filter((s) => !only || s.file.includes(only));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

function serve() {
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const file = join(DIST, path === "/" ? "mock.html" : path);
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    try {
      if (!statSync(file).isFile()) throw new Error("não é arquivo");
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function launchChrome(profile) {
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((ok, fail) => {
    let buffer = "";
    chrome.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) ok({ chrome, wsUrl: match[1] });
    });
    chrome.on("exit", (code) => fail(new Error(`o Chrome terminou antes de abrir o DevTools (código ${code})`)));
  });
}

/** Um cliente CDP mínimo sobre o WebSocket global do Node. */
function connect(wsUrl) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    const listeners = new Set();
    ws.onerror = () => fail(new Error("não consegui falar com o Chrome"));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve: done, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else done(msg.result);
      } else {
        for (const listener of listeners) listener(msg);
      }
    };
    ws.onopen = () =>
      ok({
        send: (method, params = {}, sessionId) =>
          new Promise((done, reject) => {
            const id = ++nextId;
            pending.set(id, { resolve: done, reject });
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          }),
        on: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
        close: () => ws.close(),
      });
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const { server, port } = await serve();
  const profile = mkdtempSync(join(tmpdir(), "cockpit-capture-"));
  const { chrome, wsUrl } = await launchChrome(profile);
  const cdp = await connect(wsUrl);
  const report = [];
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => cdp.send(method, params, sessionId);
    await page("Page.enable");
    await page("Runtime.enable");

    let errors = [];
    cdp.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? "exceção");
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    });

    for (const shot of SHOTS) {
      errors = [];
      const width = shot.width ?? 1280;
      const height = shot.height ?? 1100;
      await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await page("Emulation.setEmulatedMedia", {
        media: "",
        features: [
          { name: "prefers-color-scheme", value: shot.theme === "light" || shot.theme === "hcLight" ? "light" : "dark" },
          { name: "forced-colors", value: shot.forcedColors ? "active" : "none" },
        ],
      });
      const loaded = new Promise((ok) => {
        const stop = cdp.on((msg) => {
          if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") (stop(), ok());
        });
      });
      const target = shot.url ?? `mock.html?scenario=${shot.scenario}&theme=${shot.theme}`;
      await page("Page.navigate", { url: `http://127.0.0.1:${port}/${target}` });
      await loaded;
      await sleep(shot.settle ?? 1200);
      for (const expression of shot.steps ?? []) {
        const result = await page("Runtime.evaluate", { expression, returnByValue: true });
        if (result.exceptionDetails) throw new Error(`${shot.file}: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
        await sleep(500);
      }
      // A tela foca o título ao abrir; o anel de foco não é conteúdo do README.
      await page("Runtime.evaluate", { expression: "document.activeElement instanceof HTMLElement && document.activeElement.blur()" });
      await sleep(120);
      const { data } = await page("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(outDir, `${shot.file}.png`), Buffer.from(data, "base64"));
      report.push({ file: `${shot.file}.png`, scenario: shot.scenario ?? shot.file, theme: shot.theme, forcedColors: !!shot.forcedColors, viewport: `${width}x${height}`, about: shot.about, consoleErrors: errors.length });
      console.log(`${shot.file}.png  (${width}x${height}, ${errors.length} erro(s) de console)`);
    }
  } finally {
    cdp.close();
    const exited = new Promise((ok) => chrome.once("exit", ok));
    chrome.kill();
    await exited; // o Chrome ainda escreve no perfil enquanto encerra
    server.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  writeFileSync(join(outDir, "capturas.json"), `${JSON.stringify(report, null, 2)}\n`);
  const unexpected = report.filter((r) => r.consoleErrors > 0 && r.scenario !== "erro");
  if (unexpected.length) {
    console.error(`erros de console fora do cenário "erro": ${unexpected.map((r) => r.file).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
