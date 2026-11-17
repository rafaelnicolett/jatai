import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import type { WizardState } from "../types";
import { NullTemplateSource, type TemplateSource } from "../adapters/templates/TemplateSource";
import { BRAND } from "../data/brand.pure";
import { atomicMove } from "./fs/copy";
import { KitInstaller } from "./install/KitInstaller";
import type { KitMigrationReport } from "./install/kit-lock";
import { GreenfieldGenerator } from "./greenfield/GreenfieldGenerator";
import { resolveTargetDir, type OpenFolderPort } from "./greenfield/target-dir";

// Reexportadas do caminho antigo: testes e outros módulos importam daqui.
export { GITIGNORE_KEEP_REPOS_MARKER, GITIGNORE_KEEP_REPOS_MARKERS, STATE_SERVICE_GITIGNORE_ENTRY } from "./fs/gitignore";
export type { OpenFolderPort } from "./greenfield/target-dir";
export type { KitMigrationReport } from "./install/kit-lock";

/** Portas do gerador que vêm do host (F3.4): sem elas, o gerador roda em Node puro. */
export interface GeneratorPorts {
  /** Pasta aberta no editor; ausente = nenhuma (o greenfield sem destino vai para a home). */
  openFolder?: OpenFolderPort;
}

/**
 * Facade do gerador (F3.4, passo 6). Mantém a API que a extensão chama e
 * delega:
 *   - `generate` / `resolveTargetDir` → `GreenfieldGenerator` (template em
 *     zip ou scaffold local, harness, seed, config), com staging e troca
 *     atômica aqui. Falha = rollback total (nenhum arquivo parcial criado);
 *   - `installAgentStructure` / `migrateKit` → `KitInstaller`.
 *
 * O que muda entre Claude Code e Copilot vem do `HarnessAdapter`; o texto
 * gerado vem das funções puras de `content/`. O gerador não importa `vscode`:
 * o que precisa do host entra por `GeneratorPorts`.
 */
export class StructureGenerator {
  private readonly _kit = new KitInstaller();
  private readonly _greenfield: GreenfieldGenerator;

  /**
   * @param templateSource De onde vêm os templates prontos (zip); sem template,
   *   o scaffold é local. A edição aberta não tem registry (ADR-0015): o padrão
   *   é a `NullTemplateSource`.
   * @param ports O que vem do host (pasta aberta no editor).
   */
  constructor(
    templateSource: TemplateSource = new NullTemplateSource(),
    private readonly _ports: GeneratorPorts = {}
  ) {
    this._greenfield = new GreenfieldGenerator(templateSource, this._kit);
  }

  /**
   * Returns true if generated from local scaffold (no registry zip),
   * false if generated from registry/cache zip.
   */
  async generate(state: WizardState): Promise<boolean> {
    const targetDir = this.resolveTargetDir(state);
    // Keep tmpDir on the same drive as targetDir to avoid cross-device rename
    // (fs.rename fails with EXDEV on Linux/macOS and EPERM on Windows across drives)
    const tmpDir = path.join(path.dirname(targetDir), `.${BRAND.name}-tmp-${Date.now()}`);

    try {
      await fs.mkdir(tmpDir, { recursive: true });
      const isLocal = await this._greenfield.generateInto(tmpDir, state);

      // Atomic move: tmp → target
      await atomicMove(tmpDir, targetDir);
      return isLocal;
    } catch (err) {
      // Rollback — remove tmp artifacts (target is untouched)
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  /** Resolves and returns the final target directory path. */
  resolveTargetDir(state: WizardState): string {
    return resolveTargetDir(state, this._ports.openFolder?.(), os.homedir());
  }

  /**
   * Brownfield: installs only the agentic structure (.github/agents, skills, chatmodes,
   * copilot-instructions.md or CLAUDE.md, AGENTS.md, o config da marca) into an
   * existing repository directory without touching the existing code.
   */
  installAgentStructure(
    targetDir: string,
    projectName: string,
    hostAdapter: string,
    maturityFrameworks?: string[]
  ): Promise<void> {
    return this._kit.installBrownfield(targetDir, projectName, hostAdapter, maturityFrameworks);
  }

  /**
   * Atualiza a estrutura do kit num workspace já existente, sem tocar no que
   * é do cliente (ver `KitInstaller.migrate`). Devolve o que a migração fez
   * com o que o time alterou nos arquivos do kit (lock do kit, ADR-0018), ou
   * `null` quando nada foi aplicado (projeto greenfield).
   */
  migrateKit(targetDir: string, projectName: string, hostAdapter: string): Promise<KitMigrationReport | null> {
    return this._kit.migrate(targetDir, projectName, hostAdapter);
  }
}
