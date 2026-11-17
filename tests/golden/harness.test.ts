import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { StructureGenerator } from "../../src/generator/StructureGenerator";
import { BRAND } from "../../src/data/brand.pure";
import {
  CURRENT_BRAND,
  GOLDEN_BRAND,
  HELYX_BRAND,
  currentBrandNormalization,
  JATAI_BRAND_DRAFT,
  isIdentityBrand,
  normalizeBrand,
  type BrandNormalization,
} from "./lib/brand";
import { NORMALIZATION_RULES, normalize, normalizeRelPath, normalizeStderr, type NormalizeOptions } from "./lib/normalize";
import { packageVersion } from "./lib/paths";
import { cleanupSandboxes, makeSandbox } from "./lib/sandbox";
import { decodeGoldenPath, encodeGoldenPath, entryToString, isText, parseEntry, snapshotTree } from "./lib/tree";
import { TreeGoldenGroup, encodeStdout, firstDifference } from "./lib/golden-store";

/**
 * Testes do próprio harness de golden master (F0.4 lane A): as regras de
 * `normalize()`, o gancho `normalizeBrand` que a F1.3 vai ligar, o escape de
 * paths das cópias legíveis e a comparação "só mudou a marca" de ponta a
 * ponta, sobre uma instalação brownfield real.
 */

afterAll(() => cleanupSandboxes());

const BASE_OPTS: NormalizeOptions = { eol: true, roots: [], kitVersion: "0.9.10" };

describe("normalizeBrand — gancho da troca de marca (F1.3)", () => {
  it("é identidade por padrão: sem opções, com objeto vazio e de uma marca para ela mesma", () => {
    const text = "Helyx · @helyx · /helyx · helyx.config.yaml · HELYX_CLOUD_API_URL";
    expect(normalizeBrand(text)).toBe(text);
    expect(normalizeBrand(text, {})).toBe(text);
    expect(normalizeBrand(text, { from: HELYX_BRAND, to: { ...HELYX_BRAND } })).toBe(text);
  });

  it("desde a F1.3 a marca atual vem do brand.json, e os goldens continuam na Helyx", () => {
    expect(CURRENT_BRAND).toEqual({ displayName: BRAND.displayName, slug: BRAND.name });
    expect(GOLDEN_BRAND).toEqual(HELYX_BRAND);
    expect(isIdentityBrand({ from: CURRENT_BRAND, to: GOLDEN_BRAND })).toBe(CURRENT_BRAND.slug === GOLDEN_BRAND.slug && CURRENT_BRAND.displayName === GOLDEN_BRAND.displayName);
  });

  it("o rascunho da marca nova (ADR-0013) bate com o brand.json: slug igual, e o nome de exibição é o do rascunho ou ainda o da Helyx", () => {
    expect(CURRENT_BRAND.slug).toBe(JATAI_BRAND_DRAFT.slug);
    expect([JATAI_BRAND_DRAFT.displayName, HELYX_BRAND.displayName]).toContain(CURRENT_BRAND.displayName);
  });

  it("todo nome de arquivo e id do brand.json volta ao da Helyx pela normalização (sem aliases)", () => {
    const back = { from: CURRENT_BRAND, to: GOLDEN_BRAND };
    expect(normalizeBrand(BRAND.files.config, back)).toBe("helyx.config.yaml");
    expect(normalizeBrand(BRAND.files.cli, back)).toBe("helyx-state.cjs");
    expect(normalizeBrand(BRAND.files.orchestratorAgent, back)).toBe("helyx.agent.md");
    expect(normalizeBrand(BRAND.files.slashCommand, back)).toBe("helyx.md");
    expect(normalizeBrand(BRAND.cliName, back)).toBe("helyx-state");
    expect(normalizeBrand(BRAND.mcpServerName, back)).toBe("helyx-state-service");
    expect(normalizeBrand(BRAND.envPrefix, back)).toBe("HELYX_");
    expect(normalizeBrand(BRAND.templatePrefix, back)).toBe("helyx-template-");
    expect(normalizeBrand(BRAND.gitignoreMarker, back)).toBe("helyx:repos-versionado-por-decisao-explicita");
    expect(normalizeBrand(BRAND.participant.id, back)).toBe("helyx.concierge");
    // O pacote passou a se chamar só `jatai` (ID jatai.jatai, decisão do titular em 2026-11-15):
    // igual ao slug, ele normaliza para o slug da marca do golden, sem o sufixo -vscode.
    expect(normalizeBrand(BRAND.package.name, back)).toBe("helyx");
    expect(normalizeBrand(BRAND.displayName, back)).toBe("Helyx");
  });

  it("jatai → helyx preserva a forma de cada token, inclusive o acento e a forma NFD", () => {
    const back: BrandNormalization = { from: JATAI_BRAND_DRAFT, to: HELYX_BRAND };
    expect(normalizeBrand("Gerado pelo Jataí · JataiConfigSchema · @jatai · /jatai · JATAI_CLOUD_API_URL", back)).toBe(
      "Gerado pelo Helyx · HelyxConfigSchema · @helyx · /helyx · HELYX_CLOUD_API_URL"
    );
    expect(normalizeBrand("Jataí em NFD", back)).toBe("Helyx em NFD");
    expect(normalizeBrand("jataí e JATAÍ", back)).toBe("helyx e HELYX");
  });

  it("vale para nomes de arquivo: config, CLI, comando, orquestrador, tmp e template", () => {
    const back: BrandNormalization = { from: JATAI_BRAND_DRAFT, to: HELYX_BRAND };
    for (const [novo, antigo] of [
      ["jatai.config.yaml", "helyx.config.yaml"],
      [".github/scripts/jatai-state.cjs", ".github/scripts/helyx-state.cjs"],
      [".claude/commands/jatai.md", ".claude/commands/helyx.md"],
      [".claude/agents/jatai.agent.md", ".claude/agents/helyx.agent.md"],
      [".jatai-tmp-1731600000000", ".helyx-tmp-<TS>"],
      ["jatai-template-python-api", "helyx-template-python-api"],
    ] as const) {
      expect(normalizeRelPath(novo, back)).toBe(antigo);
    }
  });

  it("helyx → jatai → helyx volta ao original (o golden não tem token da marca nova)", () => {
    const text = "Helyx: @helyx em /helyx, HELYX_X, helyx.agent.md e helyx-state.cjs";
    const ida = normalizeBrand(text, { from: HELYX_BRAND, to: JATAI_BRAND_DRAFT });
    expect(ida).toBe("Jataí: @jatai em /jatai, JATAI_X, jatai.agent.md e jatai-state.cjs");
    expect(normalizeBrand(ida, { from: JATAI_BRAND_DRAFT, to: HELYX_BRAND })).toBe(text);
  });

  it("não toca texto sem token da marca, e troca numa passada só (sem cascata)", () => {
    const back: BrandNormalization = { from: JATAI_BRAND_DRAFT, to: HELYX_BRAND };
    expect(normalizeBrand("abelha sem ferrão, kit de agentes", back)).toBe("abelha sem ferrão, kit de agentes");
    expect(normalizeBrand("helyx jatai", { from: JATAI_BRAND_DRAFT, to: HELYX_BRAND })).toBe("helyx helyx");
  });
});

describe("normalize() — regras documentadas, uma a uma", () => {
  it("as regras e a ordem são exatamente as documentadas no README", () => {
    expect(NORMALIZATION_RULES.map((r) => r.id)).toEqual([
      "eol",
      "roots",
      "brand",
      "generated-by-ts",
      "resolved-at-ts",
      "run-event-ts",
      "kit-version",
      "temp-names",
      "node-pid",
    ]);
  });

  it("timestamps só no formato exato que o código emite hoje", () => {
    const out = normalize('# Generated by Helyx on 2026-11-14T10:20:30.123Z\n    resolvedAt: "2026-11-14T10:20:30.123Z"\n', BASE_OPTS);
    expect(out).toBe('# Generated by Helyx on <TS>\n    resolvedAt: "<TS>"\n');
    expect(normalize("# Generated by Helyx on 2026-11-14\n", BASE_OPTS)).toBe("# Generated by Helyx on 2026-11-14\n");
    expect(normalize('completed_at: "2026-11-14T10:20:30.123Z"\n', BASE_OPTS)).toBe('completed_at: "2026-11-14T10:20:30.123Z"\n');
  });

  it("kit_version só vira placeholder quando é a versão exata do package.json", () => {
    expect(normalize('kit_version: "0.9.10"   # comentário\n', BASE_OPTS)).toBe('kit_version: "<KIT_VERSION>"   # comentário\n');
    expect(normalize('kit_version: "0.0.0"\n', BASE_OPTS)).toBe('kit_version: "0.0.0"\n');
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("pasta temporária absoluta vira <SANDBOX>, inclusive pelo realpath", () => {
    const sandbox = makeSandbox("harness");
    const real = fs.realpathSync(sandbox);
    const opts: NormalizeOptions = { ...BASE_OPTS, roots: [{ path: sandbox, placeholder: "<SANDBOX>" }] };
    expect(normalize(`${sandbox}/ws/a.yaml e ${real}/ws/b.yaml`, opts)).toBe("<SANDBOX>/ws/a.yaml e <SANDBOX>/ws/b.yaml");
  });

  it("CRLF vira LF só quando a regra eol está ligada (o CLI é pinado com \\r)", () => {
    expect(normalize("a\r\nb\r\n", BASE_OPTS)).toBe("a\nb\n");
    expect(normalize("a\r\nb\r\n", { ...BASE_OPTS, eol: false })).toBe("a\r\nb\r\n");
  });

  it("nomes temporários e pid do Node viram placeholders", () => {
    expect(normalize(".helyx-tmp-1731600000000 .initiatives.yaml.tmp-4242-a1b2c3d4 (node:777)", BASE_OPTS)).toBe(
      ".helyx-tmp-<TS> .initiatives.yaml.tmp-<PID>-<RAND> (node:<PID>)"
    );
  });

  it("stderr de crash vira assinatura; log comum fica, sem frames de stack", () => {
    const crash = [
      "node:internal/util/parse_args/parse_args:102",
      "      throw new ERR_PARSE_ARGS_UNKNOWN_OPTION(",
      "            ^",
      "",
      "TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '--help'",
      "    at checkOptionUsage (node:internal/util/parse_args/parse_args:102:13)",
      "    at main (/tmp/x/helyx-state.cjs:1:2) {",
      "  code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION'",
      "}",
      "",
      "Node.js v25.6.1",
      "",
    ].join("\n");
    expect(normalizeStderr(crash, BASE_OPTS)).toBe("<UNCAUGHT> TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '--help'\n");
    expect(normalizeStderr("[helyx] aviso fictício\n    at f (x.js:1:1)\n", BASE_OPTS)).toBe("[helyx] aviso fictício\n");
    expect(normalizeStderr("", BASE_OPTS)).toBe("");
  });
});

describe("tree/golden-store — formato e escape", () => {
  it("nomes que git e agentes interpretam em subpastas ganham sufixo .golden, de forma reversível", () => {
    const cases = ["ws/.claude/skills/x/SKILL.md", "ws/CLAUDE.md", "ws/AGENTS.md", "ws/.gitignore", "a/.git/HEAD", "x/arquivo.golden", "ws/.github/agents/a.md"];
    for (const p of cases) expect(decodeGoldenPath(encodeGoldenPath(p))).toBe(p);
    expect(encodeGoldenPath("ws/.claude/CLAUDE.md")).toBe("ws/.claude.golden/CLAUDE.md.golden");
    expect(encodeGoldenPath("ws/.github/agents/a.md")).toBe("ws/.github/agents/a.md");
  });

  it("entradas de árvore fazem ida e volta pela forma compacta", () => {
    for (const s of ["dir", "symlink -> ../x", "file 100755 kit-cli-bundle", "file 100755 kit-mcp-bundle", `file 100644 12 ${"a".repeat(64)} text`, `file 100755 3 ${"b".repeat(64)} binary`]) {
      expect(entryToString(parseEntry(s))).toBe(s);
    }
    expect(() => parseEntry("file 100600 1 x text")).toThrow();
  });

  it("detecção de texto: UTF-8 válido sem NUL", () => {
    expect(isText(Buffer.from("olá\n"))).toBe(true);
    expect(isText(Buffer.from([0x89, 0x50, 0x00]))).toBe(false);
    expect(isText(Buffer.from([0xff, 0xfe]))).toBe(false);
  });

  it("stdout de uma linha JSON vira objeto só quando a reserialização é byte-idêntica", () => {
    expect(encodeStdout('{"ok":true}\n')).toEqual({ ok: true });
    expect(encodeStdout('{ "ok": true }\n')).toBe('{ "ok": true }\n');
    expect(encodeStdout("")).toBe("");
  });

  it("relatório de falha aponta a primeira linha divergente", () => {
    expect(firstDifference("a\nb\nc", "a\nB\nc")).toContain("linha 2");
  });
});

describe("comparação 'só mudou a marca' de ponta a ponta (instalação brownfield real)", () => {
  const swapTo: BrandNormalization = { from: HELYX_BRAND, to: JATAI_BRAND_DRAFT };
  const back: BrandNormalization = { from: JATAI_BRAND_DRAFT, to: HELYX_BRAND };

  /** Simula a saída de um gerador já trocado para Jataí: copia a árvore trocando a marca em paths e textos. */
  function writeSwapped(src: string, dest: string, rel = ""): void {
    for (const dirent of fs.readdirSync(path.join(src, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${dirent.name}` : dirent.name;
      const target = path.join(dest, ...normalizeBrand(childRel, swapTo).split("/"));
      if (dirent.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        writeSwapped(src, dest, childRel);
        continue;
      }
      const raw = fs.readFileSync(path.join(src, childRel));
      // Os bundles do CLI e do servidor MCP são comparados por identidade com os do kit: ficam com os bytes originais.
      const bytes = isText(raw) && !childRel.endsWith("-state.cjs") && !childRel.endsWith("-mcp.cjs") ? Buffer.from(normalizeBrand(raw.toString("utf-8"), swapTo), "utf-8") : raw;
      fs.writeFileSync(target, bytes);
      fs.chmodSync(target, fs.statSync(path.join(src, childRel)).mode & 0o777);
    }
  }

  async function setup(): Promise<{ group: TreeGoldenGroup; swapped: string; opts: (b?: BrandNormalization) => NormalizeOptions }> {
    const origin = makeSandbox("brand-a");
    const swapped = makeSandbox("brand-b");
    const store = makeSandbox("brand-golden");
    await new StructureGenerator().installAgentStructure(path.join(origin, "workspace"), "orbita-ws", "claude");
    const opts = (b?: BrandNormalization): NormalizeOptions => ({ eol: true, roots: [], kitVersion: packageVersion(), brand: b });
    const group = new TreeGoldenGroup(path.join(store, "grupo"), ["caso"]);
    // O golden é gravado na marca do golden (Helyx), como os de __golden__/: a
    // instalação de hoje já sai com a marca do brand.json (F1.3).
    group.record({ id: "caso", base: null, input: null, outcome: null, calls: null, snapshot: await snapshotTree(origin, { normalize: opts(currentBrandNormalization()) }) });
    group.writeAll();
    writeSwapped(origin, swapped);
    return { group, swapped, opts };
  }

  it("árvore trocada para Jataí bate com o golden Helyx quando normalizada jatai → helyx, e lista o que mudou só por marca", async () => {
    const { group, swapped, opts } = await setup();
    expect(fs.existsSync(path.join(swapped, "workspace", ".claude", "commands", "jatai.md"))).toBe(true);
    const snapshot = await snapshotTree(swapped, { normalize: opts(back) });
    const { differences, brandOnly } = group.compare({ id: "caso", base: null, input: null, outcome: null, calls: null, snapshot });
    expect(differences).toEqual([]);
    expect(brandOnly).toContain("workspace/CLAUDE.md");
    expect(brandOnly).toContain("workspace/.claude/commands/helyx.md");
  });

  it("sem a normalização de marca, a mesma árvore diverge (o gancho é quem faz o trabalho)", async () => {
    const { group, swapped, opts } = await setup();
    const snapshot = await snapshotTree(swapped, { normalize: opts() });
    expect(group.compare({ id: "caso", base: null, input: null, outcome: null, calls: null, snapshot }).differences.length).toBeGreaterThan(0);
  });

  it("uma mudança que não é de marca continua reprovando, mesmo com a normalização ligada", async () => {
    const { group, swapped, opts } = await setup();
    const victim = path.join(swapped, "workspace", ".claude", "skills", "qa-strategy", "SKILL.md");
    fs.appendFileSync(victim, "\nlinha extra que não é marca\n");
    const snapshot = await snapshotTree(swapped, { normalize: opts(back) });
    const { differences } = group.compare({ id: "caso", base: null, input: null, outcome: null, calls: null, snapshot });
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatch(/^~ workspace\/\.claude\/skills\/qa-strategy\/SKILL\.md: /);
  });
});
