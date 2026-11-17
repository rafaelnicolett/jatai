import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import type { WizardState } from "../src/types";
import { parseInitiativesYaml } from "../src/data/initiatives-contract.pure";
import { setConfigOverride, resetConfigOverrides } from "./mocks/vscode";
import { BRAND } from "../src/data/brand.pure";

/**
 * Characterization tests — caminho GREENFIELD de `StructureGenerator`:
 * `generate()` → `_generateInto()` → `_generateLocalScaffold()` e os 6 passos
 * que ela chama (`_generateAgentStructure`, `_generateDocumentation`,
 * `_generateFeatures`, `_generateAPI`, `_generateCodeScaffold`,
 * `_generateInfrastructure`) + `_seedInitialInitiative()` + `buildAiSdkConfig()`.
 *
 * Behavior pinned on 2026-09-12; describe block de `initiatives.yaml`
 * ATUALIZADO na mesma data depois do fix de
 * `hotfix-wizard-project-detection` wave-2 item-2.1 (seed de Initiative —
 * ver `_seedInitialInitiative` em `StructureGenerator.ts`, chamada a partir
 * de `_generateInto`). Modifying these tests requires reviewing if the
 * change is intentional — ver diagnóstico completo em
 * `.github/artifacts/execution/diagnosis-report-hotfix-wizard-project-detection.md`
 * (iniciativa `hotfix-wizard-project-detection`, wave-2 item-2.1).
 *
 * Escopo deliberadamente ESTREITO (StructureGenerator.ts é god-file de
 * ~1950 LOC, débito D08 já catalogado): NÃO cobre `installAgentStructure()`
 * nem `migrateKit()` — são caminhos brownfield/migração, fora deste item.
 *
 * Seam usado — por quê NÃO é `vi.mock`: `_generateInto` já tem, em produção,
 * um fallback real para "registry indisponível" (linhas ~258-274 no momento
 * da escrita: `templateCache.getZip` retorna null porque a wizard state não
 * tem `resolvedTemplate.version`, e `RegistryClient.downloadZip` lança). Este
 * repositório não usa `vi.mock` em nenhum teste (ver comentário em
 * `tests/mcp/tools.test.ts`: "FakeMcpServer hand-written, sem vi.mock") e
 * `RegistryClient` é instanciado com `new` direto dentro do método privado —
 * sem seam de construtor para injetar um fake sem tocar produção. Em vez de
 * introduzir o primeiro `vi.mock` do repo, apontamos `helyx.apiUrl` (via o
 * override de config que `tests/mocks/vscode.ts` já expõe para casos como
 * este) para uma porta loopback fechada: `fetch("http://127.0.0.1:1/...")`
 * rejeita com ECONNREFUSED em ~dezenas de ms (medido), sem rede real, sem
 * sleep/retry/timeout de 30s. É o mesmo caminho de produção, com o único
 * ponto de I/O externo apontado para um alvo controlado.
 */

function greenfieldState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    projectName: "acme-checkout",
    hostAdapter: "claude",
    backendStack: "python-api",
    backendArchitecture: "hexagonal",
    frontendStack: "none",
    database: "postgresql",
    cloud: "none",
    cicd: "github-actions",
    deliveryMode: "full-cycle",
    ...overrides,
  };
}

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};
const read = (p: string): Promise<string> => fs.readFile(p, "utf-8");

/** Lista recursivamente todo arquivo sob `root` (paths absolutos). */
async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("StructureGenerator — greenfield: scaffold local quando o registry está indisponível", () => {
  let sandboxDir: string;
  let targetDir: string;
  let isLocal: boolean;
  let allFiles: string[];

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-greenfield-"));
    targetDir = path.join(sandboxDir, "acme-checkout");
    setConfigOverride("helyx", "apiUrl", "http://127.0.0.1:1");

    const gen = new StructureGenerator();
    isLocal = await gen.generate(greenfieldState({ targetDirectory: targetDir }));
    allFiles = await walk(targetDir);
  });

  afterAll(async () => {
    resetConfigOverrides();
    await fs.rm(sandboxDir, { recursive: true, force: true });
  });

  it("generate() retorna true (isLocal) quando o registry não responde", () => {
    expect(isLocal).toBe(true);
  });

  it("materializa o projeto direto no targetDirectory resolvido — sem tmp residual no sandbox", async () => {
    const siblings = await fs.readdir(sandboxDir);
    expect(siblings).toEqual(["acme-checkout"]);
  });

  describe("_generateAgentStructure — .claude/, .github/artifacts/{gates,runs}, AGENTS.md", () => {
    it("copia os agentes do template para .claude/agents/ (host claude)", async () => {
      expect(await exists(path.join(targetDir, ".claude/agents"))).toBe(true);
      expect(await exists(path.join(targetDir, ".claude/agents/upstream"))).toBe(true);
      expect(await exists(path.join(targetDir, ".claude/agents/downstream"))).toBe(true);
      expect(await exists(path.join(targetDir, ".claude/agents/operation"))).toBe(true);
    });

    it("renomeia maestro.agent.md para helyx.agent.md no host claude", async () => {
      expect(await exists(path.join(targetDir, ".claude/agents/maestro.agent.md"))).toBe(false);
      expect(await exists(path.join(targetDir, `.claude/agents/${BRAND.files.orchestratorAgent}`))).toBe(true);
    });

    it("copia skills do template para .claude/skills/", async () => {
      const skills = await fs.readdir(path.join(targetDir, ".claude/skills"));
      expect(skills.length).toBeGreaterThan(0);
    });

    it("cria .github/artifacts/gates/README.md com os gates G1/G2", async () => {
      const readme = await read(path.join(targetDir, ".github/artifacts/gates/README.md"));
      expect(readme).toContain("G1: Upstream → Downstream");
      expect(readme).toContain("G2: Downstream → Operation");
    });

    it("cria .github/artifacts/runs/.gitkeep", async () => {
      expect(await exists(path.join(targetDir, ".github/artifacts/runs/.gitkeep"))).toBe(true);
    });

    it("copia o CLI determinístico helyx-state.cjs para .github/scripts/", async () => {
      expect(await exists(path.join(targetDir, `.github/scripts/${BRAND.files.cli}`))).toBe(true);
    });

    it("cria AGENTS.md na raiz do projeto mencionando o backend stack escolhido", async () => {
      const agentsMd = await read(path.join(targetDir, "AGENTS.md"));
      expect(agentsMd).toContain("backend-python-api");
    });
  });

  describe("_generateDocumentation — docs/adr, docs/architecture, docs/domain, docs/README.md", () => {
    it("copia ADRs de referência para docs/adr/", async () => {
      const adrs = await fs.readdir(path.join(targetDir, "docs/adr"));
      expect(adrs.length).toBeGreaterThan(0);
    });

    it("cria docs/architecture/ vazio (a fase @architecture preenche depois)", async () => {
      const entries = await fs.readdir(path.join(targetDir, "docs/architecture"));
      expect(entries).toEqual([]);
    });

    it("gera docs/domain/{bounded-contexts,context-map,event-storming}.md com o nome do projeto", async () => {
      for (const f of ["bounded-contexts.md", "context-map.md", "event-storming.md"]) {
        const content = await read(path.join(targetDir, "docs/domain", f));
        expect(content).toContain("acme-checkout");
      }
    });

    it("copia docs/delivery-flow.md, docs/hierarchy.md, docs/routing-rules.md do template", async () => {
      for (const f of ["delivery-flow.md", "hierarchy.md", "routing-rules.md"]) {
        expect(await exists(path.join(targetDir, "docs", f))).toBe(true);
      }
    });

    it("gera docs/README.md", async () => {
      expect(await exists(path.join(targetDir, "docs/README.md"))).toBe(true);
    });
  });

  describe("_generateFeatures — features/ com cenário BDD exemplo", () => {
    it("cria features/support/README.md", async () => {
      expect(await exists(path.join(targetDir, "features/support/README.md"))).toBe(true);
    });

    it("gera features/acme-checkout.feature em português com um cenário exemplo", async () => {
      const feature = await read(path.join(targetDir, "features/acme-checkout.feature"));
      expect(feature).toContain("# language: pt");
      expect(feature).toContain("Funcionalidade: acme-checkout");
      expect(feature).toContain("Cenário: Operação básica");
    });
  });

  describe("_generateAPI — api/openapi.yaml", () => {
    it("gera um contrato OpenAPI 3.1 mínimo com /health", async () => {
      const openapi = await read(path.join(targetDir, "api/openapi.yaml"));
      expect(openapi).toContain('openapi: "3.1.0"');
      expect(openapi).toContain("title: acme-checkout API");
      expect(openapi).toContain("/health:");
    });
  });

  describe("_generateCodeScaffold — code/services/{slug}-api (backend python-api, default no fallback do switch)", () => {
    it("cria os diretórios hexagonais em src/ e tests/ (backendArchitecture=hexagonal)", async () => {
      const base = "code/services/acme-checkout-api";
      const dirs = [
        "src/domain/model",
        "src/domain/ports",
        "src/application/use_cases",
        "src/infrastructure/adapters",
        "src/infrastructure/config",
        "src/api/routes",
        "tests/unit",
        "tests/integration",
      ];
      for (const d of dirs) {
        expect(await exists(path.join(targetDir, base, d))).toBe(true);
      }
    });

    it("gera README.md, Dockerfile (python:3.12-slim) e pyproject.toml do backend", async () => {
      const base = "code/services/acme-checkout-api";
      expect(await exists(path.join(targetDir, base, "README.md"))).toBe(true);
      expect(await exists(path.join(targetDir, base, "pyproject.toml"))).toBe(true);
      const dockerfile = await read(path.join(targetDir, base, "Dockerfile"));
      expect(dockerfile).toContain("FROM python:3.12-slim");
    });

    it("NÃO cria code/apps/ quando frontendStack é 'none'", async () => {
      expect(await exists(path.join(targetDir, "code/apps"))).toBe(false);
    });
  });

  describe("_generateInfrastructure — infrastructure/ e pipelines/", () => {
    it("gera infrastructure/docker-compose.local.yml referenciando o serviço backend e o postgres", async () => {
      const compose = await read(path.join(targetDir, "infrastructure/docker-compose.local.yml"));
      expect(compose).toContain("code/services/acme-checkout-api");
      expect(compose).toContain("postgres:16-alpine");
    });

    it("gera pipelines/ci.yaml referenciando o mesmo serviço", async () => {
      const ci = await read(path.join(targetDir, "pipelines/ci.yaml"));
      expect(ci).toContain("code/services/acme-checkout-api");
    });
  });

  describe("host adapter claude — CLAUDE.md, comando /helyx, config da marca", () => {
    it("gera CLAUDE.md na raiz com o ponto de entrada @helyx", async () => {
      const claudeMd = await read(path.join(targetDir, "CLAUDE.md"));
      expect(claudeMd).toContain(`@${BRAND.participant.name}`);
    });

    it("gera .claude/commands/helyx.md", async () => {
      expect(await exists(path.join(targetDir, `.claude/commands/${BRAND.files.slashCommand}`))).toBe(true);
    });

    it("gera .claude/agents/backend-python-api.agent.md (stub do adapter, além dos agentes copiados do template)", async () => {
      expect(await exists(path.join(targetDir, ".claude/agents/backend-python-api.agent.md"))).toBe(true);
    });

    it("escreve o config da marca na raiz com a stack e o host_adapter resolvidos", async () => {
      const cfg = await read(path.join(targetDir, BRAND.files.config));
      expect(cfg).toContain('backend: "python-api"');
      expect(cfg).toContain('host_adapter: "claude"');
    });

    // O orquestrador do kit manda os agentes lerem `{{brand.files.config}}` para achar a stack que o
    // Wizard registrou. O gerador gravava `ai-sdk.config.yaml`, então o arquivo lido não existia.
    it("o config que o orquestrador do kit manda ler existe na raiz, e o nome antigo não é mais escrito", async () => {
      const orchestrator = await fs.readFile(path.resolve(__dirname, "../kit/variants/greenfield/agents/maestro.agent.md"), "utf-8");
      expect(orchestrator).toContain("{{brand.files.config}}");
      expect(await exists(path.join(targetDir, BRAND.files.config))).toBe(true);
      expect(await exists(path.join(targetDir, "ai-sdk.config.yaml"))).toBe(false);
    });

    // Behavior pinned on 2026-09-12. NÃO é o bug investigado nesta iniciativa
    // (já descartado como causa do empty-state do Cockpit — ver diagnóstico),
    // mas é um gap real do buildAiSdkConfig() e fica documentado aqui: o
    // bloco `project:` do ai-sdk.config.yaml greenfield nunca ganha um campo
    // `mode`, ao contrário do `installAgentStructure()` brownfield, que
    // escreve `project.mode: brownfield` explicitamente. Note que existe SIM
        // um `mode:` no arquivo — mas é `delivery.mode` (deliveryMode do
    // wizard), um campo diferente; o assert abaixo isola o bloco `project:`
    // para não confundir os dois.
    it("@known-bug: o config do greenfield não grava project.mode (bloco project: só tem name/slug)", async () => {
      const cfg = await read(path.join(targetDir, BRAND.files.config));
      const projectBlock = cfg.match(/project:\n([\s\S]*?)\nstacks:/);
      expect(projectBlock).not.toBeNull();
      expect(projectBlock![1]).toContain('name: "acme-checkout"');
      expect(projectBlock![1]).toContain('slug: "acme-checkout"');
      expect(projectBlock![1]).not.toContain("mode");
    });

    // Achado durante a validação da wave-3 de hotfix-wizard-project-detection
    // (item-3.2): usuário gerou um projeto greenfield NOVO com o .vsix 0.9.7 e
    // o Cockpit mostrou "este workspace usa a estrutura anterior ao
    // versionamento" com botão "Migrar agora" — num projeto recém-criado.
    // Causa raiz confirmada lendo getKitStatus()/readKitVersion()
    // (src/data/kit-version.ts): `installed: null` (kit_version ausente do
    // config) conta SEMPRE como `outdated: true`, por design ("é justamente a
    // mais defasada de todas"). buildAiSdkConfig() (usado só pelo caminho
    // greenfield) nunca escrevia `kit_version`, ao contrário de
    // installAgentStructure() (brownfield), que grava
    // `kit_version: "${kitVersion()}"` explicitamente. Todo projeto greenfield
    // nascia órfão de versão, e portanto sempre marcado como desatualizado.
    it("REGRESSÃO: o config do greenfield grava kit_version — sem isso o Cockpit oferece 'Migrar agora' num projeto recém-criado", async () => {
      const cfg = await read(path.join(targetDir, BRAND.files.config));
      expect(cfg).toMatch(/^kit_version:\s*"[^"]+"/m);
    });
  });

  describe("vocabulário de iniciativa — Initiative seedada no greenfield (fix aplicado)", () => {
    // Behavior pinned on 2026-09-12, ATUALIZADO na mesma data depois do fix.
    // Gap original catalogado em
    // diagnosis-report-hotfix-wizard-project-detection.md (Sintoma 1): nenhum
    // passo do caminho greenfield gravava `.github/artifacts/initiatives.yaml`
    // — todo projeto novo gerado pelo wizard caía no empty-state de
    // vocabulário brownfield ("Vamos começar sua primeira iniciativa") no
    // Cockpit, mesmo tendo acabado de nascer corretamente. Este describe
    // block era `@known-bug`; o marcador foi removido porque o fix (seed de
    // Initiative em `_generateInto` → `_seedInitialInitiative`) já está
    // aplicado — ver `feature-report-helyx-vscode-seed-greenfield-initiative.md`.
    it("initiatives.yaml nasce com a Initiative seedada — id/name derivados de projectName, mode greenfield, status planned, sem type (feature implícito), active apontando pra ela", async () => {
      const hits = allFiles.filter((f) => path.basename(f) === "initiatives.yaml");
      expect(hits).toEqual([path.join(targetDir, ".github/artifacts/initiatives.yaml")]);

      const raw = await read(path.join(targetDir, ".github/artifacts/initiatives.yaml"));
      const { state, errors } = parseInitiativesYaml(raw);
      expect(errors).toEqual([]);
      expect(state?.active).toBe("acme-checkout");
      expect(state?.initiatives).toEqual([
        { id: "acme-checkout", name: "acme-checkout", status: "planned", mode: "greenfield" },
      ]);
    });

    it("nenhum delivery-state.yaml é criado — o Cockpit sintetiza o estado das fases a partir de current_phase (synthesizeDeliveryStateFromPhase) sem precisar do arquivo em disco", () => {
      const hits = allFiles.filter((f) => path.basename(f) === "delivery-state.yaml");
      expect(hits).toEqual([]);
    });

    it(".github/artifacts/ ganha gates/, initiatives.yaml e runs/ — sem assessment/ (que é só do installAgentStructure brownfield)", async () => {
      const entries = (await fs.readdir(path.join(targetDir, ".github/artifacts"))).sort();
      expect(entries).toEqual(["gates", "initiatives.yaml", "runs"]);
    });
  });
});

describe("StructureGenerator — greenfield: _generateCodeScaffold cria code/apps/ quando frontendStack != 'none'", () => {
  let sandboxDir: string;
  let targetDir: string;

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-greenfield-fe-"));
    targetDir = path.join(sandboxDir, "lumen-store");
    setConfigOverride("helyx", "apiUrl", "http://127.0.0.1:1");

    const gen = new StructureGenerator();
    await gen.generate(
      greenfieldState({
        projectName: "lumen-store",
        frontendStack: "react-vite",
        frontendArchitecture: "feature-based",
        targetDirectory: targetDir,
      })
    );
  });

  afterAll(async () => {
    resetConfigOverrides();
    await fs.rm(sandboxDir, { recursive: true, force: true });
  });

  it("cria code/apps/lumen-store-web/ com o scaffold React quando frontendStack é react-vite", async () => {
    const base = path.join(targetDir, "code/apps/lumen-store-web");
    expect(await exists(path.join(base, "package.json"))).toBe(true);
    expect(await exists(path.join(base, "src/main.tsx"))).toBe(true);
    expect(await exists(path.join(base, "src/App.tsx"))).toBe(true);
  });

  it("ainda gera o backend normalmente em code/services/lumen-store-api/ (frontend é aditivo, não substitui)", async () => {
    expect(await exists(path.join(targetDir, "code/services/lumen-store-api/README.md"))).toBe(true);
  });
});

describe("StructureGenerator — greenfield: host adapter copilot (.github/, sem .claude/)", () => {
  let sandboxDir: string;
  let targetDir: string;

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-greenfield-copilot-"));
    targetDir = path.join(sandboxDir, "acme-copilot");
    setConfigOverride("helyx", "apiUrl", "http://127.0.0.1:1");

    const gen = new StructureGenerator();
    await gen.generate(
      greenfieldState({ projectName: "acme-copilot", hostAdapter: "copilot", targetDirectory: targetDir })
    );
  });

  afterAll(async () => {
    resetConfigOverrides();
    await fs.rm(sandboxDir, { recursive: true, force: true });
  });

  it("agentes e skills vão para .github/, .claude/ nunca é criado", async () => {
    expect(await exists(path.join(targetDir, ".github/agents"))).toBe(true);
    expect(await exists(path.join(targetDir, ".claude"))).toBe(false);
  });

  it("gera .github/copilot-instructions.md (não CLAUDE.md)", async () => {
    expect(await exists(path.join(targetDir, ".github/copilot-instructions.md"))).toBe(true);
    expect(await exists(path.join(targetDir, "CLAUDE.md"))).toBe(false);
  });

  it("o conteúdo final de .github/chatmodes/maestro.chatmode.md é o do adapter (dinâmico), não a cópia estática do template", async () => {
    // _generateAgentStructure copia templates/chatmodes/maestro.chatmode.md (estático,
    // sem nome de projeto) e SÓ DEPOIS o host adapter roda e sobrescreve o mesmo
    // caminho com conteúdo gerado por projeto — a ordem importa e é o que este
    // teste pina: se a ordem inverter num refactor futuro, o conteúdo genérico do
    // template vence e este assert quebra.
    const chatmode = await read(path.join(targetDir, ".github/chatmodes/maestro.chatmode.md"));
    expect(chatmode).toContain("@maestro — Orquestrador de acme-copilot");
  });

  it("não gera .claude/commands/helyx.md (o comando /helyx é exclusivo do host claude)", async () => {
    expect(await exists(path.join(targetDir, `.claude/commands/${BRAND.files.slashCommand}`))).toBe(false);
  });
});
