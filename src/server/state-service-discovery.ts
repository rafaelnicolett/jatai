/**
 * state-service-discovery.ts
 *
 * Descoberta do State Service local (`.github/artifacts/.state-service/server.json`
 * — porta + token, ver `state-service-info.ts`), extraída de
 * `src/mcp/state-service-client.ts` (roadmap `mod-state-service`, item 3.1)
 * pra ser reusada também pelo cliente de ESCRITA do CLI
 * (`src/cli/lib/state-service-cli-client.ts`). Nenhum dos dois duplica a
 * lógica de resolver `root`/ler `server.json` — ambos chamam
 * `discoverStateService`.
 */
import { readStateServiceInfo, type StateServiceInfo } from "./state-service-info";
import { readBrandEnv } from "../data/brand.pure";
import { claudeProjectDir } from "../state/workspace-root";

export interface StateServiceDiscoveryOptions {
  /**
   * Raiz do workspace onde `.github/artifacts/.state-service/server.json` deve
   * existir. Default: `<PREFIXO>_WORKSPACE_ROOT` (o da marca, depois os
   * legados), depois `CLAUDE_PROJECT_DIR` (a pasta do projeto que o Claude Code
   * informa ao servidor MCP e aos hooks, F5.2), depois `process.cwd()`.
   */
  root?: string;
  /** Ambiente lido para o default de `root`. Injetável para teste — default `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Injetável para teste — default `readStateServiceInfo`. */
  readInfo?: (root: string) => StateServiceInfo | null;
}

export function resolveStateServiceRoot(options?: StateServiceDiscoveryOptions): string {
  const env = options?.env ?? process.env;
  return options?.root ?? readBrandEnv(env, "WORKSPACE_ROOT") ?? claudeProjectDir(env) ?? process.cwd();
}

/** `null` = `server.json` ausente/corrompido — sinal de "State Service não está no ar" pra quem chama. */
export function discoverStateService(options?: StateServiceDiscoveryOptions): StateServiceInfo | null {
  const root = resolveStateServiceRoot(options);
  const readInfo = options?.readInfo ?? readStateServiceInfo;
  return readInfo(root);
}
