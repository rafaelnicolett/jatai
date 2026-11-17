import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type * as vscode from "vscode";
import { CockpitNextController } from "../../src/views/CockpitNextController";
import { SystemClock } from "../../src/adapters/clock/Clock";
import { VsCodeWorkspaceRoot } from "../../src/adapters/workspace/VsCodeWorkspaceRoot";
import { VsCodeSettings } from "../../src/adapters/settings/VsCodeSettings";
import { WizardController } from "../../src/wizard/WizardController";
import { getWizardSchema } from "../../src/wizard/wizard-schema";
import type { ConfigLoader } from "../../src/adapters/config/ConfigLoader";
import { REPO_ROOT, listSourceFiles, stringLiterals } from "./helpers/source-scan";
import { BUNDLE_HOST_ALLOWLIST, FORBIDDEN_HOSTS, hostsIn } from "./helpers/egress-hosts";
import { BRAND } from "../../src/data/brand.pure";
import { YamlStateRepository } from "../../src/state/repository/StateRepository";

/**
 * Zero egress por padrão — F2.1, ADR-0015 ("Um teste de CI garante zero
 * egress de rede por padrão"). A v1 aberta é 100% local: com a configuração
 * padrão, nada sai da máquina além do State Service em 127.0.0.1.
 *
 * Parte estática (este arquivo): CSP dos webviews, URLs remotas escritas no
 * código-fonte (AST, comentário não conta) e hosts presentes nos bundles que
 * vão para o `.vsix` e para o workspace do usuário. Parte runtime:
 * `zero-egress-runtime.contract.test.ts`.
 *
 * Toda URL ou host aceito abaixo tem o motivo ao lado. Nenhum é destino de
 * requisição feita pela extensão. Um item novo só entra aqui com justificativa
 * no PR.
 */

const fakeContext = { subscriptions: [], extensionUri: { fsPath: "/fake/ext" } } as unknown as vscode.ExtensionContext;
const fakeWebview = { cspSource: "vscode-webview://csp", asWebviewUri: (u: unknown) => u } as unknown as vscode.Webview;

function cspOf(html: string): string[] {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  return csp.split(";").map((d) => d.trim()).filter(Boolean);
}

/** Fontes de uma diretiva de CSP que apontam para fora da máquina (esquema remoto, curinga ou host). */
function remoteSources(directives: string[]): string[] {
  return directives.flatMap((d) => {
    const [, ...sources] = d.split(/\s+/);
    return sources.filter((s) => /^(https?:|wss?:|\*|[a-z0-9.-]+\.[a-z]{2,})/i.test(s));
  });
}

describe("zero egress — CSP dos webviews não libera origem remota", () => {
  it("Cockpit: nenhuma diretiva aceita http:, https:, curinga ou host externo", () => {
    const controller = new CockpitNextController(fakeContext, { configLoader: {} as ConfigLoader, repository: new YamlStateRepository(), clock: new SystemClock(), workspaceRoot: new VsCodeWorkspaceRoot(), settings: new VsCodeSettings() });
    const html = (controller as unknown as { _buildShellHtml(w: vscode.Webview): string })._buildShellHtml(fakeWebview);
    expect(remoteSources(cspOf(html))).toEqual([]);
  });

  it("Wizard (app React do webview desde o W6 da F3.10): nenhuma diretiva aceita http:, https:, curinga ou host externo", async () => {
    const controller = new WizardController(fakeContext, {} as ConfigLoader);
    const html = (controller as unknown as { _renderHtml(schema: unknown, w: vscode.Webview): string })._renderHtml(await getWizardSchema(), fakeWebview);
    expect(remoteSources(cspOf(html))).toEqual([]);
  });
});

/** `URL remota → motivo`, por arquivo de origem. Loopback (127.0.0.1, localhost) é sempre aceito. */
const SOURCE_URL_ALLOWLIST: Record<string, Record<string, string>> = {
  // F3.4: os geradores de texto saíram do StructureGenerator para src/generator/content/.
  "src/generator/content/backend.ts": {
    "http://maven.apache.org/POM/4.0.0": "namespace do pom.xml gerado no projeto do usuário",
    "http://www.w3.org/2001/XMLSchema-instance": "namespace do pom.xml gerado",
    "https://maven.apache.org/xsd/maven-4.0.0.xsd": "schemaLocation do pom.xml gerado",
  },
  "src/generator/greenfield/GreenfieldScaffolder.ts": {
    "http://schemas.android.com/apk/res/android": "namespace do AndroidManifest.xml gerado",
    "https://github.com/pointfreeco/swift-composable-architecture": "dependência do Package.swift gerado (quem baixa é o build do projeto do usuário)",
  },
  "src/core/methodology/phase-contracts.ts": {
    "https://12factor.net": "referência em texto de um item de checklist",
  },
};

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/;

function remoteUrlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"'`<>)\\]+/g)].map((m) => m[0]).filter((u) => !LOOPBACK.test(u));
}

// O namespace SVG do Wizard legado (`http://www.w3.org/2000/svg`) saiu da allowlist junto com o
// legado (W6 da F3.10): o app React desenha SVG em JSX, sem a URL em literal.
describe("zero egress — nenhuma URL remota nova no código-fonte (src/ e webview-ui/src/)", () => {
  const found = ["src", "webview-ui/src"].flatMap((dir) =>
    listSourceFiles(dir).flatMap((f) => stringLiterals(f).flatMap((l) => remoteUrlsIn(l.value).map((url) => ({ file: l.file, line: l.line, url }))))
  );

  it("toda URL remota em literal de string está na allowlist do arquivo, com motivo", () => {
    const unexpected = found.filter((u) => SOURCE_URL_ALLOWLIST[u.file]?.[u.url] === undefined).map((u) => `${u.file}:${u.line} ${u.url}`);
    expect(unexpected).toEqual([]);
  });

  it("a allowlist não guarda entrada que não existe mais no código", () => {
    const present = new Set(found.map((u) => `${u.file} ${u.url}`));
    const stale = Object.entries(SOURCE_URL_ALLOWLIST).flatMap(([file, urls]) => Object.keys(urls).filter((url) => !present.has(`${file} ${url}`)).map((url) => `${file} ${url}`));
    expect(stale).toEqual([]);
  });
});

describe("zero egress — hosts nos bundles (extensão, servidor MCP e CLI do kit)", () => {
  async function bundle(entry: string): Promise<string> {
    const esbuild = await import("esbuild");
    const result = await esbuild.build({
      entryPoints: [entry],
      absWorkingDir: REPO_ROOT,
      bundle: true,
      write: false,
      outfile: "zero-egress.js",
      format: "cjs",
      platform: "node",
      target: "node18",
      external: ["vscode"],
      logLevel: "silent",
    });
    return result.outputFiles[0]!.text;
  }

  it("extensão (src/extension.ts), servidor MCP (src/mcp/server.ts) e CLI e servidor MCP instalados no workspace (kit/scripts/) só citam hosts da allowlist", async () => {
    const bundles: Record<string, string> = {
      "src/extension.ts": await bundle("src/extension.ts"),
      "src/mcp/server.ts": await bundle("src/mcp/server.ts"),
      [`kit/scripts/${BRAND.files.cli}`]: fs.readFileSync(path.join(REPO_ROOT, `kit/scripts/${BRAND.files.cli}`), "utf-8"),
      // ADR-0025: o kit instala o servidor MCP como instala o CLI.
      [`kit/scripts/${BRAND.name}-mcp.cjs`]: fs.readFileSync(path.join(REPO_ROOT, `kit/scripts/${BRAND.name}-mcp.cjs`), "utf-8"),
    };
    const unexpected = Object.entries(bundles).flatMap(([name, text]) => [...hostsIn(text)].filter((h) => BUNDLE_HOST_ALLOWLIST[h] === undefined).map((h) => `${name}: ${h}`));
    expect(unexpected).toEqual([]);
    const forbidden = Object.entries(bundles).flatMap(([name, text]) => [...hostsIn(text)].filter((h) => FORBIDDEN_HOSTS.test(h)).map((h) => `${name}: ${h}`));
    expect(forbidden).toEqual([]);
  }, 60_000);
});
