import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { validateWorkspaceDir } from "../src/wizard/workspace-validation";
import { BRAND } from "../src/data/brand.pure";

/**
 * O brownfield foi invertido: antes o wizard exigia que a pasta FOSSE o
 * repositório legado (a estrutura agêntica era instalada dentro dele); agora
 * exige uma pasta VAZIA — o workspace. Os repositórios entram depois, em
 * repos/, sem serem modificados.
 *
 * Regra compartilhada pelos dois wizards (WizardController e ImportWizard),
 * para não divergirem.
 */

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-val-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("pasta vazia — o caminho feliz", () => {
  it("aceita pasta vazia", async () => {
    expect(await validateWorkspaceDir(tmpDir)).toEqual({ valid: true });
  });

  it("ignora metadados do SO (.DS_Store não é conteúdo)", async () => {
    await fs.writeFile(path.join(tmpDir, ".DS_Store"), "x");
    expect((await validateWorkspaceDir(tmpDir)).valid).toBe(true);
  });

  it("ignora Thumbs.db e desktop.ini", async () => {
    await fs.writeFile(path.join(tmpDir, "Thumbs.db"), "x");
    await fs.writeFile(path.join(tmpDir, "desktop.ini"), "x");
    expect((await validateWorkspaceDir(tmpDir)).valid).toBe(true);
  });
});

describe("INVERSÃO: o repositório legado agora é recusado", () => {
  it("recusa pasta que É um repositório — o erro mais provável", async () => {
    await fs.mkdir(path.join(tmpDir, ".git"));
    await fs.writeFile(path.join(tmpDir, "README.md"), "# legado");

    const { valid, reason } = await validateWorkspaceDir(tmpDir);
    expect(valid).toBe(false);
    expect(reason).toMatch(/repositório/i);
  });

  it("a recusa ensina o modelo novo: pasta vazia + repos/ + sem modificação", async () => {
    await fs.mkdir(path.join(tmpDir, ".git"));

    const reason = (await validateWorkspaceDir(tmpDir)).reason!;
    expect(reason).toMatch(/pasta vazia/i);
    expect(reason).toMatch(/repos\//);
    expect(reason).toMatch(/sem serem modificados/i);
  });
});

describe("pasta não vazia", () => {
  it("recusa e informa a contagem", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "x");
    await fs.writeFile(path.join(tmpDir, "b.txt"), "x");

    const { valid, reason } = await validateWorkspaceDir(tmpDir);
    expect(valid).toBe(false);
    expect(reason).toMatch(/2 itens/);
  });

  it("singulariza a contagem com um item só", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "x");
    expect((await validateWorkspaceDir(tmpDir)).reason).toMatch(/1 item\b/);
  });
});

describe("retomada — workspace Helyx existente não é erro", () => {
  it("aceita pasta com helyx.config.yaml (workspace Helyx) e avisa que retoma", async () => {
    await fs.mkdir(path.join(tmpDir, ".github"));
    await fs.writeFile(path.join(tmpDir, "helyx.config.yaml"), 'version: "1.0.0"\n');

    const { valid, reason, requiresConfirmation } = await validateWorkspaceDir(tmpDir);
    expect(valid).toBe(true);
    expect(reason).toMatch(/retomado/i);
    expect(requiresConfirmation).toBeUndefined();
  });

  it("aceita o nome legado do config (ai-sdk.config.yaml, workspaces 0.9.x)", async () => {
    await fs.mkdir(path.join(tmpDir, ".claude"));
    await fs.writeFile(path.join(tmpDir, "ai-sdk.config.yaml"), "project:\n  mode: brownfield\n");
    expect(await validateWorkspaceDir(tmpDir)).toMatchObject({ valid: true, reason: expect.stringMatching(/retomado/i) });
  });

  it("workspace já em uso, com repos/ materializados, continua válido", async () => {
    await fs.mkdir(path.join(tmpDir, ".claude"));
    await fs.mkdir(path.join(tmpDir, "repos"));
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "x");
    await fs.writeFile(path.join(tmpDir, "helyx.config.yaml"), "kit_version: \"0.9.10\"\nrepos:\n  - id: a\n");
    expect((await validateWorkspaceDir(tmpDir)).valid).toBe(true);
  });

  it("workspace Helyx vence a checagem de .git (workspace versionado é normal)", async () => {
    await fs.mkdir(path.join(tmpDir, ".claude"));
    await fs.mkdir(path.join(tmpDir, ".git"));
    await fs.writeFile(path.join(tmpDir, "helyx.config.yaml"), 'version: "1.0.0"\n');
    expect((await validateWorkspaceDir(tmpDir)).valid).toBe(true);
  });
});

// C4 / H-BUG-07: `.github/` ou `.claude/` sozinhos não provam que a pasta é um
// workspace Helyx — quase todo repositório GitHub tem `.github/`. O kit era
// instalado dentro do repo do cliente, sobrescrevendo CLAUDE.md e AGENTS.md.
describe("REGRESSÃO C4 / H-BUG-07 — .github/.claude sem helyx.config.yaml não é workspace Helyx", () => {
  it("REGRESSÃO: repositório GitHub (.git + .github/workflows) é recusado como repositório", async () => {
    await fs.mkdir(path.join(tmpDir, ".git"));
    await fs.mkdir(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".github", "workflows", "ci.yml"), "on: push\n");

    const { valid, reason } = await validateWorkspaceDir(tmpDir);
    expect(valid).toBe(false);
    expect(reason).toMatch(/repositório/i);
  });

  it("REGRESSÃO: repositório com .claude/ (projeto que já usa Claude Code) é recusado como repositório", async () => {
    await fs.mkdir(path.join(tmpDir, ".git"));
    await fs.mkdir(path.join(tmpDir, ".claude"));
    await fs.writeFile(path.join(tmpDir, "CLAUDE.md"), "# instruções do cliente\n");
    expect(await validateWorkspaceDir(tmpDir)).toMatchObject({ valid: false, reason: expect.stringMatching(/repositório/i) });
  });

  it("REGRESSÃO: .github/ com código ao lado, sem .git, é recusado como pasta não vazia", async () => {
    await fs.mkdir(path.join(tmpDir, ".github"));
    await fs.mkdir(path.join(tmpDir, "src"));
    expect(await validateWorkspaceDir(tmpDir)).toMatchObject({ valid: false, reason: expect.stringMatching(/não está vazia \(2 itens\)/) });
  });

  it("só .github/ e/ou .claude/, sem config e sem .git: válido, mas exige confirmação explícita antes de escrever", async () => {
    for (const dirs of [[".github"], [".claude"], [".github", ".claude"]]) {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-val-host-"));
      try {
        for (const d of dirs) await fs.mkdir(path.join(dir, d));
        await fs.writeFile(path.join(dir, ".DS_Store"), "x");
        const check = await validateWorkspaceDir(dir);
        expect(check, dirs.join("+")).toMatchObject({ valid: true, requiresConfirmation: true });
        expect(check.reason, dirs.join("+")).toMatch(new RegExp(`não é um workspace ${BRAND.displayName}`, "i"));
        expect(check.reason, dirs.join("+")).toMatch(/sobrescrever/i);
        for (const d of dirs) expect(check.reason, dirs.join("+")).toContain(`${d}/`);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("pasta vazia e workspace Helyx não pedem confirmação", async () => {
    expect((await validateWorkspaceDir(tmpDir)).requiresConfirmation).toBeUndefined();
  });
});

describe("erros de leitura", () => {
  it("pasta inexistente devolve inválido com motivo, sem lançar", async () => {
    const { valid, reason } = await validateWorkspaceDir(path.join(tmpDir, "nao-existe"));
    expect(valid).toBe(false);
    expect(reason).toMatch(/não foi possível ler a pasta/i);
  });
});
