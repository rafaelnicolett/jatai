/**
 * shortcuts-catalog.ts
 *
 * Catálogo estático da Central de Atalhos — extraído do que hoje vive inline
 * em `CockpitController._renderControlCenter` (ações + perguntas prontas),
 * reorganizado em dados puros e reutilizáveis (mesmo padrão de
 * `FOUNDATION_CONTRACTS`: um array de objetos, não uma função que monta HTML).
 *
 * `kind: "refresh"` é deliberadamente distinto de `"command"`: um comando
 * VS Code como `helyx.refreshCockpit` é amarrado a UM controller específico
 * (o Cockpit legado) — não funcionaria certo no Cockpit Next. "Atualizar" tem
 * que ser a mensagem `refresh` do próprio registry de ações, que cada
 * controller resolve para o SEU `requestRefresh()`.
 *
 * Zero `fs`/`path`/`vscode` — pura, segura para o bundle do webview.
 */

/**
 * Slug semântico, não emoji — a camada de dados não depende de biblioteca de
 * ícone nenhuma; quem traduz o slug pra um ícone de traço é o componente da
 * UI (`ICON_BY_SLUG`, em `webview-ui/src/features/command-deck/
 * shortcutDispatch.ts`), pra não acoplar `src/data/` a `lucide-react`.
 */
import { BRAND } from "./brand.pure";

export type ShortcutIconSlug = "refresh-cw" | "arrow-up-circle" | "folder-open" | "rotate-cw" | "message-square" | "user-plus" | "help-circle";

export interface ShortcutAction {
  id: string;
  icon: ShortcutIconSlug;
  label: string;
  hint: string;
  kind: "command" | "prompt" | "refresh";
  /** Obrigatório quando `kind: "command"` — precisa começar com `helyx.`. */
  command?: string;
  /** Obrigatório quando `kind: "prompt"` — injetado via `injectRaw`. */
  prompt?: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "sync-repos",
    icon: "refresh-cw",
    label: "Sincronizar repositórios",
    kind: "command",
    command: `${BRAND.commandPrefix}.syncRepos`,
    hint: "Materializa repos.yaml em repos/ e grava o pinned_sha",
  },
  {
    id: "migrate-kit",
    icon: "arrow-up-circle",
    label: "Migrar estrutura do kit",
    kind: "command",
    command: `${BRAND.commandPrefix}.migrateKit`,
    hint: "Atualiza agentes e skills preservando a Wiki e o assessment",
  },
  {
    id: "open-artifacts",
    icon: "folder-open",
    label: "Abrir artefatos",
    kind: "command",
    command: `${BRAND.commandPrefix}.revealArtifacts`,
    hint: "Abre .github/artifacts/ — tudo que o Discovery produziu",
  },
  {
    id: "refresh-panel",
    icon: "rotate-cw",
    label: "Atualizar painel",
    kind: "refresh",
    hint: "Relê os arquivos do workspace agora, sem esperar o próximo tick",
  },
];

interface ShortcutAsk extends ShortcutAction {
  kind: "prompt";
  /** Só aparece quando o workspace já tem ao menos um repositório mapeado. */
  requiresRepos?: boolean;
}

const SHORTCUT_ASKS: ShortcutAsk[] = [
  {
    id: "ask-where",
    icon: "message-square",
    label: "Onde estamos?",
    kind: "prompt",
    prompt: `@${BRAND.participant.name} Qual o estado atual do Foundation? O que já foi feito, o que falta e o que aguarda minha aprovação?`,
    hint: `Pergunta pronta — resposta do próprio @${BRAND.participant.name} com base no estado real`,
  },
  {
    id: "ask-add-repo",
    icon: "user-plus",
    label: "Adicionar repositório",
    kind: "prompt",
    prompt: `@${BRAND.participant.name} Quero adicionar mais um repositório ao workspace. Atualize o repos.yaml e rode o Discovery só dele.`,
    hint: "Só aparece quando já existe ao menos um repositório mapeado",
    requiresRepos: true,
  },
  {
    id: "ask-explain",
    icon: "help-circle",
    label: "Explicar o fluxo",
    kind: "prompt",
    prompt: `@${BRAND.participant.name} Me explique o fluxo brownfield: os 4 estágios, os gates D1/D2/D3, e qual agente roda em cada fase.`,
    hint: "Pergunta pronta — visão geral do fluxo Discovery → Planning → Execution → Operation",
  },
];

/** Perguntas prontas visíveis para o estado atual do workspace. */
export function visibleShortcutAsks(hasRepos: boolean): ShortcutAction[] {
  return SHORTCUT_ASKS.filter((a) => !a.requiresRepos || hasRepos);
}

/**
 * Ações N1 do painel de Operações (ADR-0002) — mesma mecânica de
 * `SHORTCUT_ASKS` (`kind: "prompt"`, injetado via `injectRaw` no chat do
 * `@helyx`), não comandos VS Code novos: não existe hoje um `helyx.deploy`/
 * `helyx.rollback` dedicado, e inventar um seria simular capacidade que o
 * host não tem. Aciona o agente certo (`@devops`/`@sustain`) pelo chat,
 * igual qualquer outra pergunta pronta.
 */
export const OPERATIONS_N1_ACTIONS: ShortcutAction[] = [
  {
    id: "ops-deploy",
    icon: "arrow-up-circle",
    label: "Deploy",
    kind: "prompt",
    prompt: `@${BRAND.participant.name} Preciso fazer deploy — acione o @devops para o repositório certo.`,
    hint: "Abre o chat com o @devops pra tocar o deploy",
  },
  {
    id: "ops-rollback",
    icon: "rotate-cw",
    label: "Rollback",
    kind: "prompt",
    prompt: `@${BRAND.participant.name} Preciso reverter o último deploy — acione o @devops para o rollback.`,
    hint: "Abre o chat com o @devops pra reverter o último deploy",
  },
  {
    id: "ops-patch",
    icon: "refresh-cw",
    label: "Patch",
    kind: "prompt",
    prompt: `@${BRAND.participant.name} Preciso aplicar um patch de segurança/dependência — acione o @sustain.`,
    hint: "Abre o chat com o @sustain pra aplicar um patch",
  },
];
