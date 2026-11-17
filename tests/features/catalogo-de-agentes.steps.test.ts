import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { GENERATED_MARK, buildCatalog, diffCatalog, writeCatalog } from "../../scripts/gen-agent-catalog.mjs";

/**
 * Step definitions de `catalogo-de-agentes.feature` (F7.2). O gerador roda sobre
 * um kit mínimo inventado (`tests/fixtures/kit-minimo/`): um agente de cada
 * stream, um guardião, o orquestrador e o agente de Operação que muda entre as
 * edições. A conferência (`--check`) roda como subprocesso, como no CI.
 */
const FEATURE = path.join(__dirname, "catalogo-de-agentes.feature");
const SCRIPT = path.resolve(__dirname, "../../scripts/gen-agent-catalog.mjs");
const KIT_MINIMO = path.resolve(__dirname, "../fixtures/kit-minimo");
const BRAND_FILE = path.join(KIT_MINIMO, "brand.json");
const BRAND = JSON.parse(fs.readFileSync(BRAND_FILE, "utf-8")) as { name: string };

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** O kit mínimo, copiado para uma pasta que o cenário pode estragar. */
function copyKit(): string {
  const dir = tmp("jatai-kit-minimo-");
  fs.cpSync(KIT_MINIMO, dir, { recursive: true });
  return dir;
}

function generate(kitRoot = KIT_MINIMO): Map<string, string> {
  return buildCatalog({ kitRoot, brand: BRAND }).files;
}

function run(kitRoot: string, outDir: string, ...extra: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, "--kit", kitRoot, "--out", outDir, "--brand", BRAND_FILE, ...extra], { encoding: "utf-8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const page = (files: Map<string, string>, name: string): string => {
  const text = files.get(name);
  expect(text, `${name} existe`).toBeDefined();
  return text!;
};

/** Grava o catálogo do kit mínimo (ou de `kitRoot`) e devolve a pasta. */
function written(kitRoot = KIT_MINIMO): string {
  const out = path.join(tmp("jatai-catalogo-"), "agentes");
  const r = run(kitRoot, out);
  expect(r.status, r.stderr).toBe(0);
  return out;
}

const AGENTES = ["batedor", "construtor", "porteiro", "operador", "demo"];

const SCENARIOS: Record<string, () => void> = {
  "O catálogo traz um índice por stream e uma ficha por agente": () => {
    const files = generate();
    const index = page(files, "README.md");
    const sections = ["## Ponto de entrada", "## Descoberta (`discovery`)", "## Execução (`execution`)", "## Operação (`operation`)", "## Guardiões (`guardian`)"];
    const positions = sections.map((s) => index.indexOf(s));
    for (const [i, s] of sections.entries()) expect(positions[i], s).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // O índice lista cada agente com link para a ficha, a descrição e a edição.
    for (const id of AGENTES) {
      expect(index, id).toContain(`[@${id}](${id}.md)`);
      expect(files.has(`${id}.md`), `${id}.md`).toBe(true);
    }
    expect(index).toContain("| [@batedor](batedor.md) | Discovery: mapeia o repositório e entrega o inventário ao orquestrador. | brownfield |");
    expect(index).toContain("| [@operador](operador.md) |");
    expect(index).toContain("as duas |");
    expect(files.size).toBe(AGENTES.length + 2);
    expect([...files.values()].every((t) => t.startsWith(`${GENERATED_MARK}\n`))).toBe(true);
  },

  "A ficha diz o que o agente faz, quando entra, as skills, o que recebe e o que produz": () => {
    const ficha = page(generate(), "batedor.md");
    expect(ficha).toContain("# @batedor");
    expect(ficha).toContain("## O que faz\n\nDiscovery: mapeia o repositório e entrega o inventário ao orquestrador. Só lê.");
    expect(ficha).toContain("- Recebe o trabalho de: [@demo](demo.md) (o orquestrador).");
    expect(ficha).toContain("- Entrega para: [@construtor](construtor.md).");
    expect(ficha).toContain("## Skills\n\n- [`alfa`](skills.md#alfa): Skill de exemplo usada por vários agentes do kit mínimo.");
    // A marca é resolvida antes de o YAML ser lido: `{{brand.files.config}}` virou o nome do arquivo.
    expect(ficha).toContain("## O que recebe\n\n- `demo.config.yaml`\n- `repos/<repo-id>/**`");
    expect(ficha).toContain("## O que produz\n\n- `.github/artifacts/assessment/batedor.md`");
    expect(ficha).toContain("## Contrato de saída");
    expect(ficha).toContain("## Regras de proteção\n\n- Nunca escreva em repos/");
    expect(ficha).toContain("| Stream | Descoberta (`discovery`) |");
    expect(ficha).toContain("| Fase | `1a-mapeamento` |");
    expect(ficha).toContain("| Escopo | um repositório por vez (`repo`) |");
    expect(ficha).toContain("| Orçamento de contexto | baixo |");
    expect(ficha).toContain("| Fonte | `kit/content/agents/discovery/batedor.agent.md` |");
  },

  "O guardião entra nos gates e não executa fase": () => {
    const ficha = page(generate(), "porteiro.md");
    expect(ficha).toContain("- Entra nos gates: `gate.upstream_to_downstream` (G1, do Upstream para o Downstream), `gate.downstream_to_operation` (G2, do Downstream para a Operação).");
    expect(ficha).toContain("- Valida de ponta a ponta e não executa fase.");
    expect(ficha).toContain("- Nenhuma. O agente não carrega skill.");
  },

  "A skill de cada repositório é explicada, não procurada no kit": () => {
    const ficha = page(generate(), "batedor.md");
    expect(ficha).toContain("- `convencoes-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.");
    expect(ficha).not.toContain("[`convencoes-<repo-id>`]");
  },

  "O orquestrador e os apelidos dele aparecem com o nome da marca": () => {
    const files = generate();
    const ficha = page(files, "demo.md");
    expect(ficha).toContain("# @demo (o orquestrador)");
    expect(ficha).toContain("Demo Brownfield — único ponto de entrada para projetos existentes.");
    expect(ficha).toContain("Como chamar: Descreva a intenção");
    expect(ficha).toContain("É o ponto de entrada: a conversa começa aqui");
    // `maestro` (o nome do kit) e `velho` (uma marca anterior) são o mesmo agente.
    const batedor = page(files, "batedor.md");
    expect(batedor).toContain("Recebe o trabalho de: [@demo](demo.md) (o orquestrador).");
    expect(batedor).toContain("Escala para: [@demo](demo.md) (o orquestrador).");
    for (const [name, text] of files) expect(text, name).not.toContain("{{brand");
  },

  "O agente que muda de uma edição para outra tem a ficha das duas": () => {
    const ficha = page(generate(), "operador.md");
    const brown = ficha.indexOf("## Na edição: projeto existente (brownfield)");
    const green = ficha.indexOf("## Na edição: projeto novo (greenfield)");
    expect(brown).toBeGreaterThan(-1);
    expect(green).toBeGreaterThan(brown);
    expect(ficha).toContain("Operation: opera os repositórios existentes, um por vez, fora das iniciativas.");
    expect(ficha).toContain("Operation: opera o projeto novo, do pipeline ao release.");
    expect(ficha).toContain("| Fonte | `kit/variants/brownfield/agents/operation/operador.agent.md` |");
    expect(ficha).toContain("| Fonte | `kit/variants/greenfield/agents/operation/operador.agent.md` |");
    expect(ficha).toContain("### Quando entra");
  },

  "O catálogo de skills agrupa por família e diz quem usa cada uma": () => {
    const skills = page(generate(), "skills.md");
    const arch = skills.indexOf("## Arquitetura (`arch-*`)");
    const maturity = skills.indexOf("## Maturidade do projeto (`maturity-*`)");
    const others = skills.indexOf("## Método, qualidade e operação");
    expect(arch).toBeGreaterThan(-1);
    expect(maturity).toBeGreaterThan(arch);
    expect(others).toBeGreaterThan(maturity);
    const block = (id: string): string => {
      const start = skills.indexOf(`### \`${id}\``);
      expect(start, id).toBeGreaterThan(-1);
      const end = skills.indexOf("\n### ", start + 1);
      return skills.slice(start, end === -1 ? undefined : end);
    };
    expect(skills.indexOf("### `arch-beta`")).toBeGreaterThan(arch);
    expect(skills.indexOf("### `arch-beta`")).toBeLessThan(maturity);
    expect(skills.indexOf("### `maturity-gama`")).toBeGreaterThan(maturity);
    expect(skills.indexOf("### `alfa`")).toBeGreaterThan(others);
    expect(block("alfa")).toContain("- Usada por: [@batedor](batedor.md), [@construtor](construtor.md), [@operador](operador.md).");
    expect(block("arch-beta")).toContain("- Usada por: [@construtor](construtor.md).");
    expect(block("maturity-gama")).toContain("- Usada por: [@operador](operador.md).");
    expect(block("maturity-gama")).toContain("- Edições do kit: projeto existente (brownfield).");
    expect(block("alfa")).toContain("- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).");
    expect(block("alfa")).toContain("- Indicada para: `@batedor`, `@construtor`.");
  },

  "Gerar duas vezes dá os mesmos arquivos": () => {
    const first = generate();
    const second = generate();
    expect([...second.keys()]).toEqual([...first.keys()]);
    for (const [name, text] of first) expect(second.get(name), name).toBe(text);
    const all = [...first.values()].join("\n");
    expect(all, "horário").not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    expect(all, "caminho da máquina").not.toContain(os.tmpdir());
    expect(all, "caminho da máquina").not.toContain(KIT_MINIMO);
    expect(all, "caminho da máquina").not.toContain(os.homedir());
  },

  "A conferência passa quando o catálogo está em dia": () => {
    const out = written();
    const check = run(KIT_MINIMO, out, "--check");
    expect(check.status, check.stderr).toBe(0);
    expect(check.stdout).toContain("em dia com o kit (5 agentes, 3 skills, 7 arquivos)");
    // Gravar de novo não muda nada.
    expect(run(KIT_MINIMO, out).stdout).toContain("0 gravado(s), 7 sem mudança, 0 removido(s)");
  },

  "A conferência reprova quando o kit mudou e o catálogo não": () => {
    const kit = copyKit();
    const out = written(kit);
    const agent = path.join(kit, "content", "agents", "discovery", "batedor.agent.md");
    fs.writeFileSync(agent, fs.readFileSync(agent, "utf-8").replace("mapeia o repositório", "lê o repositório inteiro"), "utf-8");
    const check = run(kit, out, "--check");
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("batedor.md: está diferente do que o kit gera");
    expect(check.stderr).toContain("README.md: está diferente do que o kit gera");
    expect(check.stderr).not.toContain("construtor.md");
    expect(check.stderr).toContain("Rode: npm run docs:agents");
    // Regerar resolve.
    expect(run(kit, out).status).toBe(0);
    expect(run(kit, out, "--check").status).toBe(0);
  },

  "A conferência reprova arquivo editado à mão, que falta ou que sobra": () => {
    const out = written();
    fs.appendFileSync(path.join(out, "construtor.md"), "\nlinha escrita à mão\n", "utf-8");
    fs.rmSync(path.join(out, "porteiro.md"));
    fs.writeFileSync(path.join(out, "fantasma.md"), `${GENERATED_MARK}\n\n# @fantasma\n`, "utf-8");
    const check = run(KIT_MINIMO, out, "--check");
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("construtor.md: está diferente");
    expect(check.stderr).toContain("porteiro.md: falta");
    expect(check.stderr).toContain("fantasma.md: sobra");
    // O arquivo gerado que sobrou é removido ao gerar; o que alguém escreveu à mão é só avisado, nunca apagado.
    fs.writeFileSync(path.join(out, "notas.md"), "# notas de uma pessoa\n", "utf-8");
    expect(run(KIT_MINIMO, out, "--check").stderr).toContain("notas.md: não é um arquivo gerado");
    const regen = run(KIT_MINIMO, out);
    expect(regen.status).toBe(0);
    expect(regen.stdout).toContain("1 removido(s)");
    expect(regen.stderr + regen.stdout).toContain("notas.md");
    expect(fs.existsSync(path.join(out, "fantasma.md"))).toBe(false);
    expect(fs.existsSync(path.join(out, "notas.md"))).toBe(true);
    // As funções que o CLI usa dão o mesmo veredito.
    const diff = diffCatalog(generate(), out);
    expect({ missing: diff.missing, changed: diff.changed, extra: diff.extra, foreign: diff.foreign }).toEqual({ missing: [], changed: [], extra: [], foreign: ["notas.md"] });
    expect(writeCatalog(generate(), out).written).toBe(0);
  },

  "Frontmatter ilegível para a geração e diz qual arquivo": () => {
    const kit = copyKit();
    const agent = path.join(kit, "content", "agents", "execution", "construtor.agent.md");
    fs.writeFileSync(agent, fs.readFileSync(agent, "utf-8").replace('description: "Execution: implementa a mudança em código existente, em passos pequenos."', 'description: "sem fechar as aspas'), "utf-8");
    const out = path.join(tmp("jatai-catalogo-quebrado-"), "agentes");
    const r = run(kit, out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("kit/content/agents/execution/construtor.agent.md");
    expect(r.stderr).toContain("YAML inválido");
    expect(fs.existsSync(out), "nada foi gravado").toBe(false);
  },

  // O mesmo comando que o CI roda, sobre o kit de verdade e a pasta versionada.
  "O catálogo do kit real está em dia": () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--check"], { encoding: "utf-8" });
    expect(r.status, `${r.stderr}\nRode: npm run docs:agents`).toBe(0);
    expect(r.stdout).toMatch(/^resumo: docs\/agentes\/ em dia com o kit \(\d+ agentes, \d+ skills, \d+ arquivos\)/);
  },
};

describe("Funcionalidade: Catálogo de agentes e skills gerado do kit", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
