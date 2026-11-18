/**
 * KitInstaller.ts
 *
 * Instala, retoma e migra o kit de agentes num workspace (F3.4, passo 5).
 * Extraído do StructureGenerator, que agora só delega:
 *   - `installBrownfield`: `installAgentStructure` (Wizard brownfield), com a
 *     retomada que só acrescenta o que falta (C5 / H-BUG-08);
 *   - `installGreenfield`: o kit do projeto greenfield, dentro do staging de
 *     `generate()`;
 *   - `migrate`: `migrateKit`.
 *
 * O que muda entre Claude Code e Copilot vem do `HarnessAdapter`.
 */

import * as path from "path";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as os from "os";
import type { WizardState } from "../../types";
import { REPOS_DIR } from "../../data/repos-contract";
import { helyxCommandContent } from "../../data/foundation-prompt";
import { CONFIG_FILENAME, CONFIG_FILENAMES, LEGACY_CONFIG_FILENAMES, kitVersion, upsertKitVersion, findConfigPath, readProjectMode } from "../../data/kit-version";
import { BRAND } from "../../data/brand.pure";
import { copyKitFile } from "../kit-render";
import { legacyCliShim } from "../legacy-cli-shim";
import { copyDirIfExists, copyFileIfExists, copyMissing } from "../fs/copy";
import { ensureReposGitignored, ensureRunsGitignored, ensureStateServiceGitignored } from "../fs/gitignore";
import { harnessFor } from "../harness/harnesses";
import { KIT_ORCHESTRATOR } from "../harness/orchestrator";
import { DOCS_INPUT_README, buildAgentsReadme, buildGatesReadme } from "../content/docs";
import { buildBrownfieldConfig } from "../content/config";
import { cliBundlePath, kitRoot } from "./kit-root";
import { configureMcpServer, installMcpServer } from "./mcp-installer";
import { configureAgentActivityHooks, installAgentActivityHooks } from "./hooks-installer";
import { collectClientEdits, readKitLock, reconcileWithLock, writeKitLock, type KitMigrationReport } from "./kit-lock";
import { atomicWrite, readFileOrEmpty } from "../../state/lock/atomic-write";

/** Subpastas de `agents/` que são do kit e a migração reaplica (`KIT_OWNED`). */
const KIT_AGENT_STREAMS = ["discovery", "planning", "execution", "operation"] as const;

/**
 * Orquestrador com nome antigo que sobrou em `agentsDir` vira `<nome>.bak`
 * (A7 / BUG-11, ADR-0013): o de uma marca anterior
 * (`brand.json › legacy.orchestratorAgents`) e, desde a ADR-0025, o
 * `maestro.agent.md` que o kit instalava no Copilot. Sem isso, o workspace
 * migrado ficava com dois orquestradores: o antigo e o do kit atual
 * (`<marca>.agent.md`). O conteúdo não se perde (o time pode ter customizado
 * o arquivo), e `.bak` não é registrado como agente pelo harness. Com um
 * `.bak` já existente, nada é tocado.
 *
 * Roda antes de o orquestrador do kit ser copiado: a cópia passa por
 * `maestro.agent.md` e o sobrescreveria.
 */
async function retireLegacyOrchestrators(agentsDir: string): Promise<void> {
  for (const legacy of [KIT_ORCHESTRATOR, ...BRAND.legacy.orchestratorAgents]) {
    if (legacy === BRAND.files.orchestratorAgent) continue;
    const file = path.join(agentsDir, legacy);
    if (!existsSync(file)) continue;
    const backup = `${file}.bak`;
    if (existsSync(backup)) {
      console.warn(`[${BRAND.name}] migrateKit: ${legacy} e ${legacy}.bak já existem; nenhum dos dois foi tocado`);
      continue;
    }
    try {
      await fs.rename(file, backup);
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao guardar o orquestrador legado ${legacy}:`, err);
    }
  }
}

export class KitInstaller {
  /**
   * Brownfield: installs only the agentic structure (.github/agents, skills, chatmodes,
   * copilot-instructions.md or CLAUDE.md, AGENTS.md, o config da marca) into an
   * existing repository directory without touching the existing code.
   */
  async installBrownfield(
    targetDir: string,
    projectName: string,
    hostAdapter: string,
    maturityFrameworks?: string[]
  ): Promise<void> {
    // Retomada (C5 / H-BUG-08): com o config na raiz, a pasta já é um workspace
    // Helyx, com Foundation e trabalho do time. O kit é instalado numa pasta
    // temporária e só o que FALTA é copiado: nada que existe é sobrescrito ou
    // apagado (config, instruções, docs/input, agents/domain, .github/artifacts/**).
    if (findConfigPath(targetDir) !== null) {
      const staging = await fs.mkdtemp(path.join(os.tmpdir(), `${BRAND.name}-resume-`));
      try {
        await this.installBrownfield(staging, projectName, hostAdapter, maturityFrameworks);
        await copyMissing(staging, targetDir, new Set([...CONFIG_FILENAMES, ".gitignore", "opencode.json", "opencode.jsonc"]));
      } finally {
        await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      }
      await ensureReposGitignored(targetDir);
      // Aditivo e idempotente como o de cima: o State Service grava o token em
      // `.github/artifacts/.state-service/` ao abrir a pasta (BUG-48).
      await ensureStateServiceGitignored(targetDir);
      await ensureRunsGitignored(targetDir);
      // ADR-0025: o servidor da marca entra nas configurações MCP que o time
      // já tinha (merge por nome); as que faltavam vieram do staging.
      await configureMcpServer(targetDir, harnessFor(hostAdapter));
      // Contrato agent-activity: os hooks do kit entram na configuração de
      // projeto do harness que o time já tinha, preservando o resto.
      await configureAgentActivityHooks(targetDir, harnessFor(hostAdapter));
      return;
    }

    const harness = harnessFor(hostAdapter);
    // __dirname = dist/ at runtime → brownfield-templates/ is one level up
    const tmplRoot = kitRoot("brownfield-templates");

    // 1. Copy brownfield-specific agents (assessment: assessor, tech-mapper, arch-discoverer)
    await copyDirIfExists(
      path.join(tmplRoot, "agents"),
      path.join(targetDir, harness.hostDir, "agents")
    );

    // Adapta os agentes ao harness (no Claude: renomeia o orquestrador e corrige paths)
    await harness.adaptAgents(path.join(targetDir, harness.hostDir, "agents"));

    // 2. Copy brownfield chatmodes — só o harness que lê chatmodes (Copilot)
    if (harness.supportsChatmodes) {
      await copyDirIfExists(
        path.join(tmplRoot, "chatmodes"),
        path.join(targetDir, ".github", "chatmodes")
      );
    }

    // 3. Copy brownfield skills (discovery subset: codebase-enrichment, arch-*, domain-driven-design...)
    await copyDirIfExists(
      path.join(tmplRoot, "skills"),
      path.join(targetDir, harness.hostDir, "skills")
    );

    // 4. Copy host instructions file
    const instructionsDest = path.join(targetDir, harness.instructionsFile);
    const instructionsSrc = path.join(tmplRoot, harness.kitInstructionsFile);
    try {
      await copyKitFile(instructionsSrc, instructionsDest);
    } catch (err) {
      // Sem o arquivo de instruções o host não sabe operar o kit — nunca falhe calado.
      console.error(`[${BRAND.name}] falha ao instalar ${path.basename(instructionsDest)} de ${instructionsSrc}:`, err);
    }

    // 5. Artifacts ALWAYS in .github/artifacts/ regardless of host
    await fs.mkdir(path.join(targetDir, ".github", "artifacts", "assessment"), { recursive: true });
    await fs.mkdir(path.join(targetDir, ".github", "artifacts", "runs"), { recursive: true });
    await fs.writeFile(
      path.join(targetDir, ".github", "artifacts", "assessment", ".gitkeep"),
      "# Assessment artefatos — gerados pelo @assessor\n"
    );

    // CLI determinístico (ver mesmo passo em `_generateAgentStructure`) —
    // sempre de `templates/`, mesmo neste fluxo brownfield que copia o resto
    // de `brownfield-templates/`, pra não ter que buildar/duplicar o `.cjs`.
    await copyFileIfExists(
      cliBundlePath(),
      path.join(targetDir, ".github", "scripts", BRAND.files.cli)
    );

    // Servidor MCP do estado (ADR-0025): bundle ao lado do CLI e as
    // configurações MCP do harness (.mcp.json/.vscode/mcp.json ou opencode.json).
    await installMcpServer(targetDir, harness);

    // Hooks de atividade de agente (contrato agent-activity §4), no harness
    // que tem hooks de projeto (Claude Code: .claude/settings.json).
    await installAgentActivityHooks(targetDir, harness);

    // 5b. Workspace multi-repo: repos/ nasce vazia e é preenchida pelo @assessor
    // ao coletar o inventário. Fica FORA do git — os repos do cliente são
    // referência agêntica, não conteúdo deste workspace.
    await fs.mkdir(path.join(targetDir, REPOS_DIR), { recursive: true });
    await ensureReposGitignored(targetDir);
    await ensureStateServiceGitignored(targetDir);
    await ensureRunsGitignored(targetDir);

    // 5b-2. docs/input/ — material do cliente que o CÓDIGO NÃO CONTA: contrato,
    // runbook, planilha de processo, deck. É o insumo que o @business-archeologist
    // mais precisa e que hoje não teria de onde tirar.
    await fs.mkdir(path.join(targetDir, "docs", "input"), { recursive: true });
    await fs.writeFile(path.join(targetDir, "docs", "input", "README.md"), DOCS_INPUT_README, "utf-8");

    // 5c. Slash command /helyx — gerado com o path de agentes do host escolhido.
    // Só o Claude Code registra slash commands a partir de .claude/commands/;
    // no Copilot o ponto de entrada é o chatmode, copiado no passo 2.
    if (harness.slashCommandsDir !== null) {
      const commandsDir = path.join(targetDir, harness.slashCommandsDir);
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(
        path.join(commandsDir, BRAND.files.slashCommand),
        helyxCommandContent(harness.name),
        "utf-8"
      );
    }

    // 6. Copy AGENTS.md (brownfield variant) — o OpenCode instala o próprio
    // `opencode-instructions.md` como AGENTS.md no passo 4; não sobrepor.
    if (harness.genericAgentsMd) {
      try {
        await copyKitFile(
          path.join(tmplRoot, "AGENTS.md"),
          path.join(targetDir, "AGENTS.md")
        );
      } catch { /* skip gracefully */ }
    }

    // 7. Config do workspace (variante brownfield, sem stacks: o assessment as
    // descobre), sob o lock do estado (ADR-0017): agente e Cockpit também o editam.
    const config = buildBrownfieldConfig({ projectName, hostAdapter: harness.name, hostDir: harness.hostDir, maturityFrameworks, now: new Date().toISOString(), kitVersion: kitVersion() });
    await atomicWrite(path.join(targetDir, CONFIG_FILENAME), () => config);

    // 8. Lock do kit (ADR-0018): versão e checksum do que o kit instalou, para
    // a migração separar o que é do kit do que o time alterar.
    await writeKitLock(targetDir, harness);
  }

  /**
   * Copies agents, chatmodes, skills from templates/ bundled inside the extension.
   * templates/ is populated at build time by scripts/copy-templates.js.
   * Adapts paths based on hostAdapter (copilot → .github/, claude → .claude/)
   */
  async installGreenfield(dir: string, state: WizardState): Promise<void> {
    const harness = harnessFor(state.hostAdapter);
    // __dirname = dist/ at runtime → templates/ is one level up
    const tmplRoot = kitRoot("templates");

    // Copy agents
    await copyDirIfExists(
      path.join(tmplRoot, "agents"),
      path.join(dir, harness.hostDir, "agents")
    );

    // Adapta os agentes ao harness (no Claude: renomeia o orquestrador e corrige paths)
    await harness.adaptAgents(path.join(dir, harness.hostDir, "agents"));

    // Copy chatmodes — só o harness que lê chatmodes (Claude Code doesn't support chatmodes)
    if (harness.supportsChatmodes) {
      await copyDirIfExists(
        path.join(tmplRoot, "chatmodes"),
        path.join(dir, ".github", "chatmodes")
      );
    }

    // Copy skills
    await copyDirIfExists(
      path.join(tmplRoot, "skills"),
      path.join(dir, harness.hostDir, "skills")
    );

    // Instruções do host (CLAUDE.md | .github/copilot-instructions.md) são GERADAS
    // pelo adapter (ver generateAgentArtifacts, acima) com a stack real do projeto.
    // Não copiar template: os arquivos de instrução deste repositório descrevem o
    // próprio Helyx e não podem vazar para o projeto do cliente.

    // Artifacts ALWAYS in .github/artifacts/ regardless of host so the
    // Helyx cockpit FileSystemWatcher always finds them.
    await fs.mkdir(path.join(dir, ".github", "artifacts", "gates"), { recursive: true });
    await fs.mkdir(path.join(dir, ".github", "artifacts", "runs"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".github", "artifacts", "gates", "README.md"),
      buildGatesReadme(state)
    );
    await fs.writeFile(
      path.join(dir, ".github", "artifacts", "runs", ".gitkeep"),
      "# Telemetry runs — JSON Lines format\n"
    );

    // CLI determinístico que os agentes chamam via Bash para atualizar
    // delivery-state.yaml/initiatives.yaml em vez de editar o YAML na mão —
    // sempre de `templates/` (nunca `brownfield-templates/`), é buildado uma
    // vez só (`npm run build:cli`) e reusado nos dois fluxos.
    await copyFileIfExists(
      cliBundlePath(),
      path.join(dir, ".github", "scripts", BRAND.files.cli)
    );

    // Servidor MCP do estado (ADR-0025) e hooks de atividade de agente
    // (contrato agent-activity), como na instalação brownfield.
    await installMcpServer(dir, harness);
    await installAgentActivityHooks(dir, harness);

    // Create AGENTS.md at project root. O OpenCode gera o dele no adapter
    // (`generateAgentArtifacts`), com o texto do harness.
    if (harness.genericAgentsMd) {
      await fs.writeFile(
        path.join(dir, "AGENTS.md"),
        buildAgentsReadme(state, harness.hostDir)
      );
    }
  }

  /**
   * Atualiza a estrutura do kit num workspace já existente.
   *
   * **O que faz:** re-copia agentes do kit (inclusive `operation/` e o
   * orquestrador), skills do kit, instruções e o comando `/helyx` da versão
   * atual do plugin.
   *
   * **Com o lock do kit** (`.github/kit.lock.json`, ADR-0018): o arquivo do
   * kit que o time alterou não é sobrescrito; a versão nova vai para
   * `<arquivo>.kit-new` e o relatório devolvido avisa (ver `kit-lock.ts`).
   *
   * **O que NUNCA toca** — e este é o ponto inteiro do método:
   *   - `<host-dir>/agents/domain/` — a LLM Wiki (1 agente por bounded context)
   *   - `<host-dir>/skills/coding-guidelines-*` — 1 skill por repositório
   *   - `.github/artifacts/` — todo o estado do delivery
   *   - `docs/input/` e `repos/` — material e código do cliente
   *
   * Esses artefatos custaram dias de assessment. Um `copyDir` ingênuo sobre o
   * host-dir os apagaria em silêncio — por isso a cópia é seletiva por pasta,
   * nunca recursiva a partir da raiz.
   */
  async migrate(targetDir: string, projectName: string, hostAdapter: string): Promise<KitMigrationReport | null> {
    // O kit abaixo é o brownfield. Num projeto greenfield ele trocaria o
    // CLAUDE.md e criaria repos/, docs/input/ e .gitignore (A6 / H-BUG-10).
    if (readProjectMode(targetDir) === "greenfield") {
      console.warn(`[${BRAND.name}] migrateKit: ${targetDir} é um projeto greenfield; o kit brownfield não é aplicado`);
      return null;
    }
    const harness = harnessFor(hostAdapter);
    const tmplRoot = kitRoot("brownfield-templates");

    // 0. Lock do kit (ADR-0018): antes de qualquer cópia, o que o time
    // alterou nos arquivos do kit. Depois da cópia, essas alterações voltam e
    // a versão nova fica ao lado (`reconcileWithLock`, no fim).
    const lock = readKitLock(targetDir);
    const clientEdits = collectClientEdits(targetDir, lock);

    // 1. Agentes do kit — copiados por SUBPASTA (discovery/planning/execution/
    // operation), nunca a partir de agents/, que também contém domain/ (do
    // cliente). operation/ e o orquestrador ficavam para trás (A7 / BUG-11).
    const agentsDir = path.join(targetDir, harness.hostDir, "agents");
    for (const stream of KIT_AGENT_STREAMS) {
      await copyDirIfExists(path.join(tmplRoot, "agents", stream), path.join(agentsDir, stream));
    }
    await retireLegacyOrchestrators(agentsDir);
    await copyFileIfExists(path.join(tmplRoot, "agents", KIT_ORCHESTRATOR), path.join(agentsDir, KIT_ORCHESTRATOR));
    await harness.adaptAgents(agentsDir);

    // 2. Skills do kit — copiadas uma a uma a partir do template. As skills do
    // cliente (coding-guidelines-<repo>) não existem no template, então
    // simplesmente não são tocadas.
    await copyDirIfExists(
      path.join(tmplRoot, "skills"),
      path.join(targetDir, harness.hostDir, "skills")
    );

    // 3. Chatmodes — só o harness que lê chatmodes (Copilot)
    if (harness.supportsChatmodes) {
      await copyDirIfExists(
        path.join(tmplRoot, "chatmodes"),
        path.join(targetDir, ".github", "chatmodes")
      );
    }

    // 4. Instruções do host + AGENTS.md
    await copyFileIfExists(
      path.join(tmplRoot, harness.kitInstructionsFile),
      path.join(targetDir, harness.instructionsFile)
    );
    if (harness.genericAgentsMd) {
      await copyFileIfExists(path.join(tmplRoot, "AGENTS.md"), path.join(targetDir, "AGENTS.md"));
    }

    // 5. Comando /helyx com os paths do host
    if (harness.slashCommandsDir !== null) {
      const commandsDir = path.join(targetDir, harness.slashCommandsDir);
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, BRAND.files.slashCommand), helyxCommandContent(harness.name), "utf-8");
      // O slash command de uma marca anterior que existir vira alias, com o
      // mesmo conteúdo: quem digita o comando antigo continua chegando ao
      // Foundation (ADR-0013). Um workspace sem ele não o ganha.
      for (const legacy of BRAND.legacy.slashCommands) {
        const file = path.join(commandsDir, legacy);
        if (existsSync(file)) await fs.writeFile(file, helyxCommandContent(harness.name), "utf-8");
      }
    }

    // 6. Estruturas que passaram a existir em versões novas
    await fs.mkdir(path.join(targetDir, REPOS_DIR), { recursive: true });
    await fs.mkdir(path.join(targetDir, "docs", "input"), { recursive: true });
    await ensureReposGitignored(targetDir);
    await ensureStateServiceGitignored(targetDir);
    await ensureRunsGitignored(targetDir);

    // 6b. CLI determinístico — workspaces migrados de uma versão anterior do
    // kit não tinham isso; re-copiar aqui é o que faz `helyx.migrateKit`
    // "curar" um workspace que ainda edita YAML na mão por falta do binário.
    await copyFileIfExists(
      cliBundlePath(),
      path.join(targetDir, ".github", "scripts", BRAND.files.cli)
    );
    await this._shimLegacyClis(targetDir);

    // 6c. Servidor MCP do estado (ADR-0025): atualiza o bundle e põe ou
    // atualiza o servidor da marca nas duas configurações MCP, sem apagar
    // os servidores que o time já declarou (merge por nome).
    await installMcpServer(targetDir, harness);

    // 6d. Hooks de atividade de agente (contrato agent-activity §4): relé
    // atualizado e hooks do kit na configuração de projeto do harness, sem
    // tocar no que o time configurou.
    await installAgentActivityHooks(targetDir, harness);

    // 7. Carimba a versão — e adota o nome canônico do config, mantendo o
    // conteúdo (o legado é removido só depois da escrita bem-sucedida).
    await this._migrateConfigFile(targetDir);

    // 8. Lock do kit: devolve ao time o que ele alterou (a versão nova vai
    // para `<arquivo>.kit-new`), tira o que o kit deixou de ter e estava
    // intacto, e grava o lock novo.
    return reconcileWithLock(targetDir, harness, lock, clientEdits);
  }

  /**
   * Grava o `kit_version` e migra o config de uma marca anterior
   * (`brand.json › legacy.configFiles`, o mais recente primeiro) para o nome
   * canônico. A escrita é cirúrgica: o config é editado por humano e por
   * agente, então comentários e ordem precisam sobreviver. E é feita sob o
   * lock do estado (`atomicWrite`, ADR-0017), contra o conteúdo mais recente.
   */
  private async _migrateConfigFile(targetDir: string): Promise<void> {
    const canonicalPath = path.join(targetDir, CONFIG_FILENAME);
    const legacyPath = LEGACY_CONFIG_FILENAMES.map((name) => path.join(targetDir, name)).find((p) => existsSync(p)) ?? null;
    const fromLegacy = !existsSync(canonicalPath) ? legacyPath : null;
    if (!existsSync(canonicalPath) && fromLegacy === null) return;

    try {
      // Sem o canônico, o conteúdo vem do legado, lido já com o lock na mão.
      await atomicWrite(canonicalPath, (current) => upsertKitVersion(fromLegacy !== null && current === "" ? readFileOrEmpty(fromLegacy) : current, kitVersion()));
      if (fromLegacy !== null) await fs.rm(fromLegacy, { force: true });
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao migrar o config:`, err);
    }
  }

  /**
   * CLI de estado de uma marca anterior (`brand.json › legacy.cliFiles`) que
   * existe no workspace vira um atalho para o CLI atual (ADR-0013). Os agentes
   * que a migração não reescreve (os de `agents/domain/`, os do usuário, os
   * que o BUG-11 deixa para trás) continuam chamando o caminho antigo e passam
   * a usar o mesmo motor. Só troca o que existe: um workspace que nunca teve o
   * caminho antigo não o ganha.
   */
  private async _shimLegacyClis(targetDir: string): Promise<void> {
    for (const legacy of BRAND.legacy.cliFiles) {
      const file = path.join(targetDir, ".github", "scripts", legacy);
      if (!existsSync(file)) continue;
      try {
        await fs.writeFile(file, legacyCliShim(legacy), "utf-8");
        await fs.chmod(file, 0o755);
      } catch (err) {
        console.error(`[${BRAND.name}] falha ao gravar o atalho do CLI legado ${legacy}:`, err);
      }
    }
  }
}
