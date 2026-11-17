/**
 * workspace-root.ts — onde fica o workspace quando o CLI de estado ou o
 * servidor MCP rodam fora do VS Code (F5.2, alinhamento com os hooks do kit).
 *
 * O Claude Code informa a pasta do projeto em `CLAUDE_PROJECT_DIR` aos hooks
 * e aos servidores MCP que ele sobe. Os hooks do kit chamam
 * `jatai-state runs append` a partir de onde a sessão estiver, inclusive de
 * uma subpasta (ex.: `repos/<repo>/`); sem esta regra, o evento cairia num
 * `.github/artifacts/` paralelo dentro da subpasta (a mesma classe do
 * BUG-32, que continua pinado para quando a variável não existe).
 */

/** Variável com a pasta do projeto, que o Claude Code passa aos hooks e aos servidores MCP. */
export const CLAUDE_PROJECT_DIR_ENV = "CLAUDE_PROJECT_DIR";

type Env = Readonly<Record<string, string | undefined>>;

/** A pasta do projeto do Claude Code, se a variável existir e não estiver vazia. */
export function claudeProjectDir(env: Env = process.env): string | undefined {
  const value = env[CLAUDE_PROJECT_DIR_ENV];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/** Raiz do workspace do CLI de estado: a pasta do projeto do Claude Code, ou a pasta de onde ele foi chamado. */
export function cliWorkspaceRoot(env: Env = process.env, cwd: string = process.cwd()): string {
  return claudeProjectDir(env) ?? cwd;
}
