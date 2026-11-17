import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { accessSync } from "fs";
import * as yaml from "js-yaml";
import { findConfigPath, LEGACY_CONFIG_FILENAMES } from "../../data/kit-version";
import { agentsDirFor } from "../../data/foundation-prompt";
import { claudeOrchestratorFilenames } from "../../data/orchestrator-entry-prompt";
import { HelyxConfigSchema, HelyxBrownfieldConfigSchema, type HelyxConfig } from "../../types";

/**
 * Carrega e valida ai-sdk.config.yaml do workspace.
 * Nunca lança — retorna null se não encontrar ou inválido.
 */
export class ConfigLoader {
  private readonly _workspaceFolders:
    | readonly vscode.WorkspaceFolder[]
    | undefined;
  private _cache: HelyxConfig | null | undefined = undefined;

  constructor(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
  ) {
    this._workspaceFolders = workspaceFolders;
  }

  async load(): Promise<HelyxConfig | null> {
    if (this._cache !== undefined) return this._cache;

    const configPath = this._findConfigPath();
    if (configPath === null) {
      this._cache = null;
      return null;
    }

    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = yaml.load(raw);
      const result = HelyxConfigSchema.safeParse(parsed);
      this._cache = result.success ? result.data : null;
    } catch {
      this._cache = null;
    }

    return this._cache;
  }

  invalidate(): void {
    this._cache = undefined;
  }

  /**
   * Existe config válido no workspace — sob QUALQUER formato aceito
   * (single-project do wizard OU multi-repo do Foundation brownfield).
   *
   * Não reaproveita `load()`/`_cache`: `load()` só reconhece o formato
   * single-project (é o que os consumidores tipados de `HelyxConfig`
   * esperam), então um workspace brownfield "acabou de passar pelo
   * Foundation" ficaria indistinguível de "nunca configurado" para quem só
   * queria saber SE existe config — o que abria o wizard por cima de um
   * projeto já configurado.
   */
  async isConfigured(): Promise<boolean> {
    const configPath = this._findConfigPath();
    if (configPath === null) return false;

    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = yaml.load(raw);
      return (
        HelyxConfigSchema.safeParse(parsed).success ||
        HelyxBrownfieldConfigSchema.safeParse(parsed).success
      );
    } catch {
      return false;
    }
  }

  /**
   * Host do workspace, em QUALQUER formato de config (A5 / H-BUG-09).
   *
   * O Foundation regrava o config no formato multi-repo, sem `host_adapter`:
   * com `load()` (só single-project) devolvendo null, o host virava "copilot"
   * e o `migrateKit` instalava o kit Copilot num workspace Claude Code. Agora:
   * o `host_adapter` declarado vale nos dois formatos; sem ele, o disco
   * decide (o orquestrador do Claude Code em `.claude/agents/`); sem nenhum
   * dos dois, `"copilot"`, o default de sempre. Nunca lança.
   */
  async hostAdapter(): Promise<"claude" | "copilot"> {
    const configPath = this._findConfigPath();
    if (configPath !== null) {
      try {
        const parsed = yaml.load(await fs.readFile(configPath, "utf-8")) as { host_adapter?: unknown } | null;
        const declared = parsed && typeof parsed === "object" ? parsed.host_adapter : undefined;
        if (declared === "claude" || declared === "copilot") return declared;
      } catch {
        // config ilegível — o disco decide
      }
    }
    const root = configPath !== null ? path.dirname(configPath) : this._workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return "copilot";
    for (const orchestrator of claudeOrchestratorFilenames()) {
      try {
        accessSync(path.join(root, agentsDirFor("claude"), orchestrator));
        return "claude";
      } catch {
        // tenta o próximo nome (o atual primeiro, depois os de marcas anteriores)
      }
    }
    return "copilot";
  }

  private _findConfigPath(): string | null {
    const folders = this._workspaceFolders;
    if (folders === undefined || folders.length === 0) return null;

    for (const folder of folders) {
      // helyx.config.yaml é o nome canônico; ai-sdk.config.yaml é o legado.
      // Sem o fallback, todo workspace criado antes do rename ficaria órfão.
      const found = findConfigPath(folder.uri.fsPath);
      if (found !== null) return found;
      for (const legacy of LEGACY_CONFIG_FILENAMES) {
        try {
          // mantém o comportamento antigo para caminhos não cobertos acima
          const candidate = path.join(folder.uri.fsPath, legacy);
          accessSync(candidate);
          return candidate;
        } catch {
          // not found, try next
        }
      }
    }
    return null;
  }
}
