import type { WizardState } from "../../types";
import type { HostId } from "../../data/foundation-prompt";

/**
 * O que muda entre os harnesses (Claude Code e GitHub Copilot) quando o kit
 * é instalado, gerado ou migrado (F3.4, passo 4; ADR-0018).
 *
 * Antes, cada fluxo do gerador decidia por `if claude/copilot` onde ficam os
 * agentes, qual arquivo de instruções usar, se há chatmode e se há slash
 * command. Agora o harness responde, e o gerador só pergunta.
 *
 * `ClaudeAdapter` e `CopilotAdapter` são as duas implementações. Zero import
 * host-specific fora dos adapters (coding-guidelines §1.1).
 */
export interface HarnessAdapter {
  /** Valor gravado em `host_adapter` no config do workspace. */
  readonly name: HostId;

  /** Pasta do harness na raiz: recebe `agents/` e `skills/` do kit. */
  readonly hostDir: string;

  /** Arquivo de instruções do harness, relativo à raiz do workspace. */
  readonly instructionsFile: string;

  /** De onde vêm as instruções no kit brownfield (relativo à raiz do kit). */
  readonly kitInstructionsFile: string;

  /** O harness lê `.github/chatmodes/`: o kit instala o chatmode do orquestrador. */
  readonly supportsChatmodes: boolean;

  /** Pasta dos slash commands, relativa à raiz; `null` = o harness não os registra. */
  readonly slashCommandsDir: string | null;

  /**
   * Configuração de projeto do harness que recebe os hooks de atividade de
   * agente (contrato agent-activity §4), relativa à raiz; `null` = o harness
   * não tem hooks de projeto (no Copilot, a fonte é o observador de artefatos
   * da extensão).
   */
  readonly projectHooksFile: string | null;

  /**
   * Ajusta os agentes do kit que acabaram de ser copiados para `agentsDir`
   * (paths de outro harness, nome do orquestrador). Não toca no que é do
   * cliente (`agents/domain/`).
   */
  adaptAgents(agentsDir: string): Promise<void>;

  /**
   * Greenfield: instruções, stubs de agente e ponto de entrada gerados com a
   * stack do projeto. Escritos depois do kit, por cima.
   * @param targetDir - Raiz do projeto gerado.
   * @param state - Estado final do wizard.
   */
  generateAgentArtifacts(
    targetDir: string,
    state: WizardState
  ): Promise<GeneratedFile[]>;
}

export interface GeneratedFile {
  /** Caminho relativo à raiz do projeto. */
  relativePath: string;
  content: string;
}
