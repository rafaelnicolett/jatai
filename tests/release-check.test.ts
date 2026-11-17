import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { checkRelease, findChangelogSection, findUnreleasedSection, isIsoDate, parseSemver } from "../scripts/release-check.mjs";

/**
 * `scripts/release-check.mjs` (F7.5) confere a release antes de publicar: a tag contra o
 * package.json e o CHANGELOG. Tudo aqui usa pastas temporárias com manifestos fictícios.
 */

const SCRIPT = path.resolve(__dirname, "../scripts/release-check.mjs");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const MANIFEST = {
  name: "exemplo",
  publisher: "editora",
  version: "1.2.3",
  license: "MIT",
  repository: { type: "git", url: "https://example.invalid/exemplo.git" },
};

const CHANGELOG = `# Changelog

## [Não lançado]

### Adicionado

- Coisa em andamento.

## [1.2.3] - 2026-11-20

### Adicionado

- Primeira coisa.
- Segunda coisa.

### Corrigido

- Um erro.

## [1.2.2] - 2026-10-01

- Antiga.

[1.2.3]: https://example.invalid/compare/v1.2.2...v1.2.3
`;

function project(manifest: Record<string, unknown> | null, changelog: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-check-"));
  dirs.push(dir);
  if (manifest !== null) fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
  if (changelog !== null) fs.writeFileSync(path.join(dir, "CHANGELOG.md"), changelog);
  return dir;
}

describe("parseSemver e isIsoDate", () => {
  it("aceita semver com e sem pré-lançamento e recusa o resto", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, pre: null });
    expect(parseSemver("1.0.0-rc.1")).toEqual({ major: 1, minor: 0, patch: 0, pre: "rc.1" });
    for (const bad of ["1.2", "v1.2.3", "1.2.3.4", "", "abc"]) expect(parseSemver(bad)).toBeNull();
  });

  it("confere a data de calendário, não só o formato", () => {
    expect(isIsoDate("2026-11-20")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("20-11-2026")).toBe(false);
  });
});

describe("seções do CHANGELOG", () => {
  it("acha a seção da versão, sem o título e sem os links de referência", () => {
    const s = findChangelogSection(CHANGELOG, "1.2.3");
    expect(s?.date).toBe("2026-11-20");
    expect(s?.body).toContain("- Primeira coisa.");
    expect(s?.body).toContain("### Corrigido");
    expect(s?.body).not.toContain("1.2.2");
    expect(s?.body).not.toContain("https://example.invalid");
  });

  it("não confunde 1.2.3 com 1.2.30, e devolve null quando falta", () => {
    expect(findChangelogSection("## [1.2.30] - 2026-01-01\n- x\n", "1.2.3")).toBeNull();
    expect(findChangelogSection(CHANGELOG, "9.9.9")).toBeNull();
  });

  it("acha 'Não lançado' em pt-BR e em inglês", () => {
    expect(findUnreleasedSection(CHANGELOG)?.body).toContain("Coisa em andamento");
    expect(findUnreleasedSection("## [Unreleased]\n- a\n")?.body).toBe("- a");
  });
});

describe("checkRelease com tag", () => {
  it("passa quando tag, versão e CHANGELOG batem, e devolve as notas", () => {
    const r = checkRelease({ root: project(MANIFEST, CHANGELOG), tag: "v1.2.3" });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.version).toBe("1.2.3");
    expect(r.prerelease).toBe(false);
    expect(r.notes).toContain("- Segunda coisa.");
  });

  it("reprova uma tag com formato errado", () => {
    const r = checkRelease({ root: project(MANIFEST, CHANGELOG), tag: "1.2.3" });
    expect(r.ok).toBe(false);
    expect(r.problems.join("\n")).toMatch(/formato vMAJOR\.MINOR\.PATCH/);
  });

  it("reprova quando a tag e o package.json divergem", () => {
    const r = checkRelease({ root: project(MANIFEST, CHANGELOG), tag: "v1.2.4" });
    expect(r.problems.join("\n")).toMatch(/a tag diz 1\.2\.4, mas o package\.json diz 1\.2\.3/);
  });

  it("reprova quando o CHANGELOG ainda está em 'Não lançado'", () => {
    const onlyUnreleased = "# Changelog\n\n## [Não lançado]\n\n- Algo.\n";
    const r = checkRelease({ root: project(MANIFEST, onlyUnreleased), tag: "v1.2.3" });
    expect(r.ok).toBe(false);
    expect(r.problems.join("\n")).toMatch(/ainda está em "Não lançado"/);
  });

  it("reprova seção sem data, com data inválida ou sem nenhum item", () => {
    const semData = project(MANIFEST, "## [1.2.3]\n\n- x\n");
    expect(checkRelease({ root: semData, tag: "v1.2.3" }).problems.join("\n")).toMatch(/não tem data/);
    const dataRuim = project(MANIFEST, "## [1.2.3] - 2026-13-40\n\n- x\n");
    expect(checkRelease({ root: dataRuim, tag: "v1.2.3" }).problems.join("\n")).toMatch(/não é AAAA-MM-DD válida/);
    const vazia = project(MANIFEST, "## [1.2.3] - 2026-11-20\n\n### Adicionado\n\n## [1.2.2] - 2026-10-01\n- a\n");
    expect(checkRelease({ root: vazia, tag: "v1.2.3" }).problems.join("\n")).toMatch(/não tem nenhum item/);
  });

  it("marca pré-lançamento pelo sufixo da versão", () => {
    const m = { ...MANIFEST, version: "1.3.0-rc.1" };
    const log = "## [1.3.0-rc.1] - 2026-11-25\n\n- Candidata.\n";
    const r = checkRelease({ root: project(m, log), tag: "v1.3.0-rc.1" });
    expect(r.ok).toBe(true);
    expect(r.prerelease).toBe(true);
  });
});

describe("checkRelease: manifesto", () => {
  it("reprova manifesto sem publisher, sem repositório, com outra licença ou versão que não é semver", () => {
    const m = { name: "x", version: "1", license: "GPL-3.0" };
    const r = checkRelease({ root: project(m, CHANGELOG) });
    const text = r.problems.join("\n");
    expect(text).toMatch(/sem "publisher"/);
    expect(text).toMatch(/licença do package\.json é "GPL-3\.0"/);
    expect(text).toMatch(/sem "repository"/);
    expect(text).toMatch(/não é semver/);
  });

  it("reprova quando faltam o package.json ou o CHANGELOG", () => {
    expect(checkRelease({ root: project(null, CHANGELOG) }).problems.join("\n")).toMatch(/package\.json ilegível/);
    expect(checkRelease({ root: project(MANIFEST, null), tag: "v1.2.3" }).problems.join("\n")).toMatch(/CHANGELOG\.md não existe/);
  });
});

describe("checkRelease: pré-voo, sem tag", () => {
  it("não reprova quando a versão ainda não tem seção, e usa as notas de 'Não lançado'", () => {
    const m = { ...MANIFEST, version: "1.3.0" };
    const r = checkRelease({ root: project(m, CHANGELOG) });
    expect(r.ok).toBe(true);
    expect(r.warnings.join("\n")).toMatch(/segue em "Não lançado"/);
    expect(r.notes).toContain("Coisa em andamento");
  });
});

describe("linha de comando", () => {
  it("responde exit 2 a uma opção desconhecida e a uma flag sem valor", () => {
    expect(spawnSync(process.execPath, [SCRIPT, "--bogus"], { encoding: "utf8" }).status).toBe(2);
    expect(spawnSync(process.execPath, [SCRIPT, "--tag"], { encoding: "utf8" }).status).toBe(2);
  });

  it("roda o pré-voo no próprio repositório e imprime o resumo", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    expect(r.stdout).toMatch(/^release-check: versão /);
    expect([0, 1]).toContain(r.status);
  });
});
