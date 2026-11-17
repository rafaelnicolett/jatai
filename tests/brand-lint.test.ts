import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { brandPattern, lintRepo, placeholderValue } from "../scripts/brand-lint.mjs";

/**
 * `scripts/brand-lint.mjs` (F1.2, ADR-0013) reprova literal de marca fora do
 * brand.json, no código e no kit. Aqui a marca é FICTÍCIA ("Zuni"/"Zunído"),
 * para o teste não depender da marca em uso.
 */

const SCRIPT = path.resolve(__dirname, "../scripts/brand-lint.mjs");

const BRAND = {
  name: "zuni",
  displayName: "Zunído",
  files: { config: "zuni.config.yaml", cli: "zuni-state.cjs", orchestratorAgent: "zuni.agent.md", slashCommand: "zuni.md" },
  cliName: "zuni-state",
  legacy: { names: ["velha"], displayNames: ["Velha"] },
};

type Finding = { file: string; line: number; kind: string; text: string };

let root: string;

function write(rel: string, content: string | Buffer): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function lint(allowlist: Array<{ path: string; reason: string }> = []): { findings: Finding[]; stale: string[] } {
  return lintRepo(root, { allowlist }) as { findings: Finding[]; stale: string[] };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-lint-"));
  write("src/data/brand.json", JSON.stringify(BRAND));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("brandPattern — as formas da marca", () => {
  const re = brandPattern(BRAND);
  it.each(["zuni", "ZUNI_X", "zuniWizard", "Zunído", "ZUNÍDO", "Zunído".normalize("NFD"), "velha.config.yaml", "VELHA_"])("casa %s", (s) => {
    expect(re.test(s)).toBe(true);
  });
  it("não casa o que não é marca", () => {
    expect(re.test("maestro.agent.md")).toBe(false);
  });
});

describe("placeholderValue — {{brand.*}}", () => {
  it("resolve caminho pontuado que termina em string", () => {
    expect(placeholderValue(BRAND, "files.cli")).toBe("zuni-state.cjs");
  });
  it("objeto, lista e caminho inexistente não resolvem", () => {
    expect(placeholderValue(BRAND, "files")).toBeUndefined();
    expect(placeholderValue(BRAND, "legacy.names")).toBeUndefined();
    expect(placeholderValue(BRAND, "nada")).toBeUndefined();
  });
});

describe("código — só o que vira dado em runtime", () => {
  it("reprova literal, template, texto JSX, regex e process.env.<MARCA>", () => {
    write(
      "src/a.ts",
      [
        'const a = "zuni.syncRepos";',
        "const b = `Zunído: ${x} pronto`;",
        "const c = /^@zuni\\b/;",
        "const d = process.env.ZUNI_WORKSPACE_ROOT;",
        'const e = "velha.config.yaml";',
      ].join("\n")
    );
    write("webview-ui/src/b.tsx", "export const B = () => <span>Zunído v1</span>;\n");
    const kinds = lint().findings.map((f) => `${f.file}:${f.line}:${f.kind}`);
    expect(kinds).toEqual([
      "src/a.ts:1:literal",
      "src/a.ts:2:literal",
      "src/a.ts:3:regex",
      "src/a.ts:4:variável de ambiente",
      "src/a.ts:5:literal",
      "webview-ui/src/b.tsx:1:texto JSX",
    ]);
  });

  it("aceita comentário, identificador, caminho de import e leitura do BRAND", () => {
    write(
      "src/a.ts",
      [
        "// Zunído: comentário não é dado",
        'import { ZuniMark } from "./ZuniMark";',
        'export type { ZuniConfig } from "../zuni-types";',
        "/** zuni */ export function isZuniWorkspace(): string { return `${BRAND.commandPrefix}.syncRepos`; }",
        'const lazy = () => import("./zuni-lazy");',
        'const req = require("./zuni-req");',
      ].join("\n")
    );
    expect(lint().findings).toEqual([]);
  });

  it("CSS: reprova fora de comentário", () => {
    write("webview-ui/src/x.css", "/* Studio Zunído */\n.a { content: \"zuni\"; }\n");
    expect(lint().findings.map((f) => `${f.line}:${f.kind}`)).toEqual(["2:css"]);
  });
});

describe("kit — texto inteiro, caminho e placeholders", () => {
  it("reprova marca escrita à mão, no texto e no caminho", () => {
    write("kit/content/agents/a.agent.md", "use o @zuni\nleia {{brand.files.config}}\n");
    write("kit/variants/brownfield/zuni-notas.md", "nada\n");
    const kinds = lint().findings.map((f) => `${f.file}:${f.line}:${f.kind}`);
    expect(kinds).toEqual(["kit/content/agents/a.agent.md:1:marca no kit", "kit/variants/brownfield/zuni-notas.md:0:marca no caminho"]);
  });

  it("reprova placeholder que não resolve para string", () => {
    write("kit/content/x.md", "{{brand.files.cli}} {{brand.nada}} {{brand.files}}\n");
    expect(lint().findings.map((f) => f.text)).toEqual(["{{brand.nada}}", "{{brand.files}}"]);
  });

  it("pula os bundles do CLI e do servidor MCP (gerados de src/) e arquivo binário", () => {
    write("kit/scripts/zuni-state.cjs", 'console.log("zuni");\n');
    write("kit/scripts/zuni-state.cjs.map", '{"zuni":1}');
    write("kit/scripts/zuni-mcp.cjs", 'console.log("zuni");\n');
    write("kit/content/media/x.bin", Buffer.from([0x00, 0x7a, 0x75, 0x6e, 0x69]));
    expect(lint().findings).toEqual([]);
  });
});

describe("allowlist explícita", () => {
  it("arquivo na allowlist não reprova; entrada sem achado é obsoleta", () => {
    write("src/legado.ts", 'export const X = "velha";\n');
    const result = lint([
      { path: "src/legado.ts", reason: "teste" },
      { path: "src/sumiu.ts", reason: "teste" },
    ]);
    expect(result.findings).toEqual([]);
    expect(result.stale).toEqual(["src/sumiu.ts"]);
  });
});

describe("CLI", () => {
  it("o pacote real está limpo (exit 0)", () => {
    const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
    expect(run.stdout).toMatch(/^resumo: nenhum literal de marca fora do brand.json/m);
    expect(run.status).toBe(0);
  });

  it("achado sai como path:linha e exit 1", () => {
    write("src/a.ts", 'const a = "Zunído";\n');
    const run = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf-8" });
    expect(run.stdout).toContain("src/a.ts:1: literal:");
    expect(run.status).toBe(1);
  });
});
