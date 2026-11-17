import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { createRequire } from "module";

/**
 * Kit fonte única (F3.5, ADR-0018): `kit/` + `kit/kit.manifest.yaml` geram as
 * duas edições que o gerador lê (`templates/`, `brownfield-templates/`).
 * O build confere o mesmo (`copy-templates.js`); aqui a suíte pega o drift
 * antes do build.
 */

const require_ = createRequire(import.meta.url);
interface Edition { name: string; out: string; keep: string[]; plan: Map<string, string>; problems: string[] }
const kit = require_("../scripts/kit.js") as {
  loadManifest(p?: string): { editions: Record<string, { out: string; skills?: string[] }> };
  planEdition(m: unknown, name: string, kitRoot?: string): Omit<Edition, "name">;
  diffEdition(e: Omit<Edition, "name">, pkgRoot?: string): string[];
  writeEdition(e: Omit<Edition, "name">, pkgRoot?: string): void;
  editions(): Edition[];
  checkAll(): string[];
  KIT_ROOT: string;
  OUT_ROOT: string;
};
const { validateKit, BROWNFIELD_COPY_MAP } = require_("../scripts/copy-templates.js") as { validateKit(): { problems: string[] }; BROWNFIELD_COPY_MAP: string[] };

const PKG_ROOT = path.resolve(__dirname, "..");
const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full);
      else if (e.name !== ".DS_Store") out.push(full);
    }
  };
  visit(dir);
  return out;
}

describe("kit fonte única — as edições estão em dia com kit/", () => {
  it("as edições materializadas em dist/kit/ são exatamente o que o manifesto produz (sem drift)", () => {
    expect(kit.checkAll()).toEqual([]);
  });

  it("ADR-0018: as edições saem do git; o pacote fonte não tem mais templates/ nem brownfield-templates/", () => {
    expect(fs.existsSync(path.join(PKG_ROOT, "templates"))).toBe(false);
    expect(fs.existsSync(path.join(PKG_ROOT, "brownfield-templates"))).toBe(false);
    expect(kit.OUT_ROOT).toBe(path.join(PKG_ROOT, "dist", "kit"));
  });

  it("o validador do build (copy-templates.js) passa, inclusive a checagem de drift", () => {
    expect(validateKit().problems).toEqual([]);
  });

  it("nenhum arquivo de kit/ fica órfão: todo arquivo de content/ e variants/ chega a alguma edição", () => {
    const used = new Set(kit.editions().flatMap((e) => [...e.plan.values()]));
    // Só content/ e variants/ são conteúdo; kit.manifest.yaml e schema/ são do build.
    const orphans = ["content", "variants"]
      .flatMap((d) => walk(path.join(kit.KIT_ROOT, d)))
      .filter((f) => !used.has(f))
      .map((f) => path.relative(kit.KIT_ROOT, f).split(path.sep).join("/"));
    expect(orphans).toEqual([]);
  });

  it("as listas curadas concordam: skills greenfield = registry.yaml; skills brownfield = BROWNFIELD_COPY_MAP", () => {
    const m = kit.loadManifest();
    const registry = yaml.load(fs.readFileSync(path.join(kit.KIT_ROOT, "content/skills/registry.yaml"), "utf-8")) as { skills: Array<{ id: string }> };
    expect([...(m.editions.greenfield!.skills ?? [])].sort()).toEqual(registry.skills.map((s) => s.id).sort());
    const copyMap = BROWNFIELD_COPY_MAP.filter((r) => r.startsWith("skills/")).map((r) => r.slice("skills/".length));
    expect([...(m.editions.brownfield!.skills ?? [])].sort()).toEqual(copyMap.sort());
  });

  it("um arquivo comum às duas edições existe uma vez só em kit/ (sem cópia duplicada)", () => {
    const [g, b] = ["greenfield", "brownfield"].map((n) => kit.editions().find((e) => e.name === n)!);
    const sharedPaths = [...g!.plan.keys()].filter((rel) => b!.plan.has(rel));
    expect(sharedPaths.length).toBeGreaterThan(20);
    for (const rel of sharedPaths) {
      if (g!.plan.get(rel) !== b!.plan.get(rel)) expect(fs.readFileSync(g!.plan.get(rel)!).equals(fs.readFileSync(b!.plan.get(rel)!)), rel).toBe(false);
    }
  });
});

describe("scripts/kit.js — materialização", () => {
  function fixture(manifest: string, files: Record<string, string>): { root: string; kitRoot: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-manifest-"));
    tmpDirs.push(root);
    const kitRoot = path.join(root, "kit");
    fs.mkdirSync(kitRoot, { recursive: true });
    fs.writeFileSync(path.join(kitRoot, "kit.manifest.yaml"), manifest);
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return { root, kitRoot };
  }

  const MANIFEST = [
    "schema: 1",
    "editions:",
    "  ed:",
    "    out: saida",
    "    keep: [scripts]",
    "    units:",
    "      - agents/a",
    "      - { from: variants/ed/agents/orq.agent.md, to: agents/orq.agent.md }",
    "    skills: [s1]",
    "",
  ].join("\n");

  // Corrida achada na integração da onda 5b: o globalSetup de um vitest (ou o copy-templates.js) rodava
  // writeAll() com outro processo lendo o kit gerado. O copyFileSync truncava o destino antes de
  // preenchê-lo, mesmo quando o arquivo já estava igual, e um teste chegou a ler um bundle de 0 bytes.
  it("materializar de novo não toca no arquivo que já está igual (sem janela de leitura truncada)", () => {
    const { root, kitRoot } = fixture(MANIFEST, {
      "kit/content/agents/a/x.agent.md": "x\n",
      "kit/variants/ed/agents/orq.agent.md": "orq da edição\n",
      "kit/content/skills/s1/SKILL.md": "skill\n",
    });
    const ed = kit.planEdition(kit.loadManifest(path.join(kitRoot, "kit.manifest.yaml")), "ed", kitRoot);
    kit.writeEdition(ed, root);
    const dest = path.join(root, "saida", "agents", "a", "x.agent.md");
    const passado = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(dest, passado, passado);

    kit.writeEdition(ed, root);

    expect(fs.statSync(dest).mtime.getTime(), "o arquivo igual foi reescrito").toBe(passado.getTime());
    expect(kit.diffEdition(ed, root)).toEqual([]);
  });

  it("quando o conteúdo muda, a escrita é atômica: não sobra arquivo temporário e o destino nunca fica vazio", () => {
    const { root, kitRoot } = fixture(MANIFEST, {
      "kit/content/agents/a/x.agent.md": "versão 1\n",
      "kit/variants/ed/agents/orq.agent.md": "orq\n",
      "kit/content/skills/s1/SKILL.md": "skill\n",
    });
    const ed = kit.planEdition(kit.loadManifest(path.join(kitRoot, "kit.manifest.yaml")), "ed", kitRoot);
    kit.writeEdition(ed, root);
    const dest = path.join(root, "saida", "agents", "a", "x.agent.md");
    fs.writeFileSync(dest, "alterado à mão\n");

    // Um leitor concorrente vê sempre o conteúdo antigo ou o novo, nunca vazio.
    const lido = new Set<string>();
    const watcher = fs.watch(path.dirname(dest), () => {
      try {
        lido.add(fs.readFileSync(dest, "utf8"));
      } catch {
        /* o arquivo pode estar sendo trocado */
      }
    });
    kit.writeEdition(ed, root);
    watcher.close();

    expect(fs.readFileSync(dest, "utf8")).toBe("versão 1\n");
    expect(lido.has("")).toBe(false);
    expect(fs.readdirSync(path.dirname(dest)).filter((n) => n.includes(".tmp"))).toEqual([]);
  });

  it("escreve só o que o manifesto manda, remove o que sobra, preserva keep e depois confere sem diferença", () => {
    const { root, kitRoot } = fixture(MANIFEST, {
      "kit/content/agents/a/x.agent.md": "x\n",
      "kit/variants/ed/agents/orq.agent.md": "orq da edição\n",
      "kit/content/skills/s1/SKILL.md": "skill\n",
      "saida/agents/velho.agent.md": "sobra\n",
      "saida/scripts/cli.cjs": "bundle\n",
    });
    const m = kit.loadManifest(path.join(kitRoot, "kit.manifest.yaml"));
    const ed = kit.planEdition(m, "ed", kitRoot);
    expect(ed.problems).toEqual([]);
    expect(kit.diffEdition(ed, root).length).toBeGreaterThan(0);
    kit.writeEdition(ed, root);
    expect(kit.diffEdition(ed, root)).toEqual([]);
    expect(walk(path.join(root, "saida")).map((f) => path.relative(path.join(root, "saida"), f).split(path.sep).join("/")).sort()).toEqual([
      "agents/a/x.agent.md",
      "agents/orq.agent.md",
      "scripts/cli.cjs",
      "skills/s1/SKILL.md",
    ]);
    expect(fs.readFileSync(path.join(root, "saida/agents/orq.agent.md"), "utf-8")).toBe("orq da edição\n");
  });

  it("fonte ausente e dois arquivos no mesmo destino são erro de plano", () => {
    const { kitRoot } = fixture(MANIFEST.replace("    skills: [s1]", "    skills: [s1, s2]").replace("      - agents/a\n", "      - agents/a\n      - { from: content/agents/a/x.agent.md, to: agents/orq.agent.md }\n"), {
      "kit/content/agents/a/x.agent.md": "x\n",
      "kit/variants/ed/agents/orq.agent.md": "orq\n",
      "kit/content/skills/s1/SKILL.md": "skill\n",
    });
    const ed = kit.planEdition(kit.loadManifest(path.join(kitRoot, "kit.manifest.yaml")), "ed", kitRoot);
    expect(ed.problems.some((p) => p.includes("fonte ausente kit/content/skills/s2"))).toBe(true);
    expect(ed.problems.some((p) => p.includes("agents/orq.agent.md vem de duas unidades"))).toBe(true);
    expect(() => kit.writeEdition(ed, path.dirname(kitRoot))).toThrow();
  });
});

describe("kit/ não vai no .vsix; as edições materializadas vão", () => {
  it(".vscodeignore exclui kit/ e leva dist/kit/", () => {
    const lines = fs.readFileSync(path.join(PKG_ROOT, ".vscodeignore"), "utf-8").split("\n");
    expect(lines).toContain("kit/");
    expect(lines).toContain("!dist/kit/**");
  });
});
