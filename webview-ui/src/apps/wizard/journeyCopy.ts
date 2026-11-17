/**
 * journeyCopy.ts — os textos da jornada do Wizard (F4.3), em português, na voz
 * do design system v2: a marca em terceira pessoa, frases curtas e concretas,
 * sem exclamação e sem pedido de desculpa. O erro diz o que aconteceu e o que
 * fazer. O nome da marca, o agente de entrada, o guia do chat e os arquivos
 * vêm do `BRAND` (nunca literal). O que cada harness instala e onde é conferido
 * contra a árvore que o gerador de fato escreve (`tests/journeyCopy.test.ts`).
 */

import { BRAND } from "@data";
import type { ScreenId } from "./journeyTypes";

const NAME = BRAND.displayName;
/** O agente de entrada nos dois harnesses (ADR-0025). */
const AGENT = BRAND.participant.name;
/** O guia do chat da extensão (ADR-0025). */
const GUIDE = BRAND.guide.name;

export interface ScreenCopy {
  title: string;
  lead: string;
  /** Rótulo do botão de avançar. */
  next: string;
}

export const SCREEN_COPY: Record<ScreenId, ScreenCopy> = {
  abertura: {
    title: `Vamos preparar a ${NAME}`,
    lead: `Em poucos passos, a ${NAME} instala os agentes e as instruções na pasta que você escolher.`,
    next: "Começar",
  },
  modo: {
    title: "Como você quer começar?",
    lead: "Escolha o ponto de partida. Dá para voltar e trocar antes de instalar.",
    next: "Continuar",
  },
  harness: {
    title: "Qual harness você vai usar?",
    lead: `É onde você conversa com o agente ${AGENT}. Os dois recebem a mesma metodologia; muda onde ela fica na pasta.`,
    next: "Continuar",
  },
  projeto: {
    title: "Qual é o projeto?",
    lead: "O nome vira o prefixo das pastas e dos serviços. A ideia ajuda o agente a começar.",
    next: "Continuar",
  },
  dominio: {
    title: "Em que domínio ele está?",
    lead: `Isso ajusta o vocabulário e os agentes que a ${NAME} instala.`,
    next: "Continuar",
  },
  backend: {
    title: "Como será o backend?",
    lead: "A stack e a arquitetura que os agentes vão seguir e conferir.",
    next: "Continuar",
  },
  frontend: {
    title: "E o frontend?",
    lead: "Dá para começar só com o backend e somar um frontend depois.",
    next: "Continuar",
  },
  infra: {
    title: "Banco, nuvem e pipeline",
    lead: "Escolha o que você já sabe. O que não souber fica para depois.",
    next: "Continuar",
  },
  local: {
    title: "Onde criar o projeto?",
    lead: `A ${NAME} só escreve depois da revisão.`,
    next: "Continuar",
  },
  pasta: {
    title: "Onde fica o workspace?",
    lead: "Escolha uma pasta vazia. Os seus repositórios não são alterados: eles entram depois, em repos/.",
    next: "Continuar",
  },
  repositorios: {
    title: "Seus repositórios",
    lead: "Não é preciso informar nada agora.",
    next: "Continuar",
  },
  maturidade: {
    title: "Frameworks de maturidade",
    lead: "Opcional. O DORA 4 Keys já vem marcado; some outros se quiser mais profundidade.",
    next: "Continuar",
  },
  revisao: {
    title: "Revise antes de escrever",
    lead: `Nada foi escrito ainda. Confira o que a ${NAME} vai gravar e onde.`,
    next: "Instalar",
  },
};

/** Abertura: o que a marca vai fazer e o que não vai (ADR-0015: tudo local). */
export const OPENING = {
  willTitle: `O que a ${NAME} vai fazer`,
  will: [
    "Instalar agentes, skills e instruções na pasta que você escolher.",
    "Mostrar o que será escrito, antes de escrever.",
    `Deixar você seguir pelo agente ${AGENT}, no chat do harness que escolher.`,
  ],
  wontTitle: `O que a ${NAME} não vai fazer`,
  wont: [
    "Enviar dados para fora do seu computador: tudo roda local.",
    "Alterar os repositórios que você já tem.",
    "Escrever qualquer arquivo antes de você confirmar a revisão.",
  ],
} as const;

export const MODE_COPY = {
  greenfield: {
    title: "Projeto novo",
    description: "Cria a pasta do projeto do zero, com a estrutura, os agentes e as instruções.",
  },
  brownfield: {
    title: "Projeto existente",
    description: "Prepara um workspace vazio para analisar os repositórios que você já tem. Os repositórios não são alterados.",
  },
} as const;

/**
 * O que cada harness instala e onde (ADR-0025): o agente de entrada, as
 * skills, as instruções, o servidor MCP e, no Claude Code, os hooks. O kit
 * instala tudo sozinho. Os caminhos são os do gerador e o teste os confere.
 */
export interface HarnessFacts {
  label: string;
  /** Uma frase: onde a pessoa conversa com o agente. */
  summary: string;
  /** Como chamar o agente de entrada neste harness. */
  entry: string;
  /** Onde ficam os agentes. */
  agents: string;
  /** Onde fica o arquivo do agente de entrada. */
  entryFile: string;
  skills: string;
  /** Os arquivos de instruções. */
  instructions: readonly string[];
  mcp: string;
  /** Hooks que registram a atividade dos agentes (só no Claude Code). */
  hooks: readonly string[] | null;
}

export const HARNESS_FACTS: Record<"claude" | "copilot", HarnessFacts> = {
  claude: {
    label: "Claude Code",
    summary: "Para conversar no Claude Code, no terminal ou no VS Code.",
    entry: `o agente @${AGENT}`,
    agents: ".claude/agents/",
    entryFile: `.claude/agents/${BRAND.files.orchestratorAgent}`,
    skills: ".claude/skills/",
    instructions: ["CLAUDE.md", "AGENTS.md"],
    mcp: ".mcp.json",
    hooks: [".claude/settings.json", `.github/scripts/${BRAND.name}-hook.cjs`],
  },
  copilot: {
    label: "GitHub Copilot",
    summary: "Para conversar no chat do Copilot, dentro do VS Code.",
    entry: `o agente ${AGENT}, no seletor de agentes do chat`,
    agents: ".github/agents/",
    entryFile: `.github/agents/${BRAND.files.orchestratorAgent}`,
    skills: ".github/skills/",
    instructions: [".github/copilot-instructions.md", "AGENTS.md"],
    mcp: ".vscode/mcp.json",
    hooks: null,
  },
};

/** O que vale para os dois harnesses. */
export const COMMON_FACTS = {
  state: ".github/artifacts/",
  scripts: ".github/scripts/",
  lock: ".github/kit.lock.json",
  /** O chat da extensão (ADR-0025): mostra onde a iniciativa está e leva ao agente de entrada; não grava arquivos. */
  guideNote: `O chat da extensão, @${GUIDE}, mostra onde você está e leva ao agente ${AGENT}.`,
  kitNote: "O kit instala tudo sozinho: você não configura nada à mão.",
} as const;

/** O passo "Pronto": onde a estrutura ficou e o próximo passo, no harness escolhido (ADR-0025). */
export const DONE_COPY = {
  title: "Pronto",
  lead: `A ${NAME} terminou. O próximo passo é entrar pelo agente ${AGENT}.`,
  announce: "Instalação concluída.",
  wrote: `A ${NAME} escreveu a estrutura em`,
  nextTitle: "Próximo passo",
  openFolderFirst: "Essa não é a pasta aberta no editor. Abra-a no VS Code antes de seguir: o aviso do editor tem o botão.",
  claude: `No Claude Code, chame o agente @${AGENT}. Ele conduz a metodologia daqui em diante.`,
  copilot: `No chat do GitHub Copilot, escolha o agente ${AGENT} no seletor de agentes. Ele conduz a metodologia daqui em diante.`,
  cockpit: "Abrir o Cockpit",
  close: "Fechar",
  stepLabel: "Concluído",
} as const;

export const REPOSITORIES_COPY = {
  ask: `O agente ${AGENT} pergunta quais repositórios entram: a URL ou a pasta de cada um.`,
  where: `Eles ficam em repos/, só para leitura. A ${NAME} não altera nenhum.`,
  alone: "Um repositório só segue o mesmo caminho de vários.",
} as const;

export const FOLDER_COPY = {
  pick: "Escolher pasta…",
  pickOther: "Escolher outra pasta…",
  useOpen: "Usar a pasta aberta",
  useDefault: "Criar dentro da pasta aberta",
  noneOpen: "Nenhuma pasta está aberta. Escolha onde criar o projeto.",
  missingWorkspace: "Escolha a pasta do workspace para continuar.",
  missingProject: "Escolha onde criar o projeto para continuar.",
  multiRoot: `Esta janela tem mais de uma pasta. A v1 da ${NAME} trabalha com uma pasta por janela e usa a primeira.`,
  empty: "A pasta precisa estar vazia. Se for um repositório, escolha outra: os repositórios entram depois, em repos/.",
} as const;

export const INSTALL_COPY = {
  installing: "Instalando",
  failed: "A instalação não terminou.",
  retry: "Tentar de novo",
  back: "Voltar à revisão",
  review: {
    willWrite: "O que será escrito",
    wontDo: `O que a ${NAME} não faz`,
    tree: "Estrutura prevista (ilustrativa)",
    treeNote: "A estrutura mostrada é uma prévia. A lista acima é a que vale.",
  },
} as const;
