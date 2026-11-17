/**
 * workspace-validation.ts
 *
 * Valida a pasta escolhida como **workspace brownfield**.
 *
 * Inversão em relação ao modelo antigo: antes exigíamos que a pasta **fosse** o
 * repositório legado, porque a estrutura agêntica era instalada dentro dele.
 * Agora exigimos o oposto — uma pasta **vazia** —, porque:
 *
 *   - os repositórios entram em `repos/<id>/`, materializados pelo `@assessor`
 *     a partir do inventário, e nunca são modificados (em muitos clientes um PR
 *     adicionando `.github/agents/` ao core legado seria recusado);
 *   - o domínio é N:N com os repos — amarrar o workspace a um repositório
 *     recriaria a premissa single-repo que estamos removendo;
 *   - **one repo é multi repo com N=1**: mesmo com um único repositório o
 *     workspace é o mesmo, sem caminho especial.
 *
 * Compartilhado pelos dois wizards (o principal e o de import), para que a
 * regra não divirja entre eles.
 */

import * as fs from "fs/promises";
import { CONFIG_FILENAME, CONFIG_FILENAMES } from "../data/kit-version";
import { BRAND } from "../data/brand.pure";

export interface WorkspaceValidation {
  valid: boolean;
  /** Motivo da recusa, ou aviso quando válido (ex.: retomada, pedido de confirmação). */
  reason?: string;
  /**
   * Válida, mas pode ser conteúdo de um repositório do cliente: quem chama só
   * escreve na pasta depois de uma confirmação explícita do usuário (C4 / H-BUG-07).
   */
  requiresConfirmation?: true;
  /** Workspace Helyx existente (config na raiz): a instalação é uma retomada, no host do próprio workspace. */
  resume?: true;
}

/**
 * Metadados do sistema operacional não contam como conteúdo — senão qualquer
 * pasta já aberta no Finder/Explorer seria recusada sem motivo real.
 */
const IGNORABLE_ENTRIES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".localized"]);

/**
 * Marcadores de um workspace Helyx já criado — reabrir não é erro, é retomada.
 * É o config na raiz (nome atual ou de uma marca anterior), o mesmo critério
 * de `findConfigPath`. `.github/` e `.claude/` sozinhos NÃO contam: quase todo
 * repositório GitHub tem `.github/` (C4 / H-BUG-07).
 */
const WORKSPACE_MARKERS = CONFIG_FILENAMES;

/** Pastas do host que a instalação usa, mas que não provam nada sozinhas. */
const HOST_DIRS = new Set([".github", ".claude"]);

export async function validateWorkspaceDir(workspaceDir: string): Promise<WorkspaceValidation> {
  let entries: string[];
  try {
    entries = (await fs.readdir(workspaceDir)).filter((e) => !IGNORABLE_ENTRIES.has(e));
  } catch (err) {
    return { valid: false, reason: `Não foi possível ler a pasta: ${(err as Error).message}` };
  }

  if (entries.length === 0) return { valid: true };

  // Workspace Helyx existente → retomada do Foundation, não erro. Vem antes do
  // `.git`: um workspace Helyx versionado é normal.
  if (WORKSPACE_MARKERS.some((m) => entries.includes(m))) {
    return { valid: true, resume: true, reason: `Workspace ${BRAND.displayName} existente — o Foundation será retomado.` };
  }

  // O erro mais provável: apontar para o repositório legado, que é o que a
  // versão anterior pedia. A mensagem precisa ensinar o modelo novo, não só recusar.
  if (entries.includes(".git")) {
    return {
      valid: false,
      reason:
        "Esta pasta é um repositório. Escolha uma pasta vazia — os repositórios entram depois, em repos/, sem serem modificados.",
    };
  }

  // Só `.github/` e/ou `.claude/`, sem config: pode ser resto de outra
  // ferramenta (ou da própria extensão), mas também conteúdo de um repositório.
  // A instalação grava agentes, skills e instruções ali — só com confirmação.
  if (entries.every((e) => HOST_DIRS.has(e))) {
    const dirs = entries.map((e) => `${e}/`).sort().join(" e ");
    return {
      valid: true,
      requiresConfirmation: true,
      reason:
        `Esta pasta não é um workspace ${BRAND.displayName} (não tem ${CONFIG_FILENAME}), mas já tem ${dirs}, que pode ser de um repositório. ` +
        "A instalação grava agentes, skills e instruções nela e pode sobrescrever arquivos existentes.",
    };
  }

  return {
    valid: false,
    reason: `Pasta não está vazia (${entries.length} ${entries.length === 1 ? "item" : "itens"}). Escolha uma pasta vazia para o workspace.`,
  };
}
