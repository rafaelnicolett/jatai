/**
 * map-cast.pure.ts — o elenco do mapa da colmeia: quem é cada agente quando
 * ele vira personagem, com um nome, um arquétipo e um traço de personalidade.
 *
 * O mapa já mostra o que cada agente faz (a `description` do frontmatter, no
 * `AgentCatalogEntry`). Aqui fica o que faz a colmeia parecer viva sem inventar
 * estado: o nome de cena, o papel e o jeito de cada um. É editorial e estável,
 * então mora no código, não no workspace do cliente.
 *
 * Regras:
 * - o id é sempre normalizado com arroba (`@migration-agent`);
 * - agente sem entrada no elenco ganha uma persona neutra derivada do id, para
 *   nunca sumir do mapa (agentes de domínio e `general-purpose` entram assim);
 * - sem emoji no texto: o ícone é um token de apresentação, não conteúdo.
 */
import { normalizeAgentId } from "../contracts/agent-directory.pure";

/** Cor de cena do personagem. Mapeada para tokens do design system na vista. */
export type CastAccent = "honey" | "lavender" | "rose" | "leaf" | "sky" | "sand";

export interface CastPersona {
  /** Nome de cena, curto: "Meli", "Zum", "Rota". */
  readonly name: string;
  /** O papel em uma expressão: "A Cartógrafa", "O Arquiteto de tocas". */
  readonly archetype: string;
  /** Uma frase de personalidade, no tom da colmeia. */
  readonly trait: string;
  readonly accent: CastAccent;
}

/**
 * O elenco principal. Cobre os agentes que aparecem nos fluxos do mapa
 * (descoberta, planejamento, execução, operação e as fases do greenfield).
 * A ordem não importa; o índice é por id normalizado.
 */
export const AGENT_CAST: Readonly<Record<string, CastPersona>> = {
  // ── Descoberta (brownfield) ──────────────────────────────────────────────
  "@assessor": { name: "Ariba", archetype: "A Bússola", trait: "Não constrói antes de conhecer o terreno.", accent: "sky" },
  "@tech-mapper": { name: "Meli", archetype: "A Cartógrafa", trait: "Confia no lock, não no README.", accent: "honey" },
  "@arch-discoverer": { name: "Zum", archetype: "O Arquiteto de tocas", trait: "Vê a casa pela planta, não pela fachada.", accent: "lavender" },
  "@dependency-mapper": { name: "Teia", archetype: "A Tecelã", trait: "Onde há acoplamento, ela puxa o fio.", accent: "sand" },
  "@domain-extractor": { name: "Néctar", archetype: "A Guardiã do sentido", trait: "Um contexto pode morar em dois repos.", accent: "rose" },
  "@coding-archaeologist": { name: "Cera", archetype: "A Escriba", trait: "Escreve o padrão que o time já usa.", accent: "sand" },
  "@design-archaeologist": { name: "Pétala", archetype: "A Curadora", trait: "Conta os azuis antes de escolher um.", accent: "rose" },
  "@quality-auditor": { name: "Prumo", archetype: "O Inspetor", trait: "Onde o histórico dói, o bug mora.", accent: "leaf" },
  "@security-auditor": { name: "Ferrão", archetype: "O Sentinela", trait: "Confia, mas verifica a dependência.", accent: "honey" },
  "@test-coverage-mapper": { name: "Malha", archetype: "A Tecelã de redes", trait: "Mapeia o que o teste ainda não cobre.", accent: "sky" },
  "@debt-analyst": { name: "Juros", archetype: "O Coletor", trait: "Dívida se mede pelo juro, não pelo ideal.", accent: "sand" },
  "@business-archeologist": { name: "História", archetype: "A Contadora", trait: "O código não conta por que o if existe.", accent: "rose" },
  "@maturity-assessor": { name: "Marco", archetype: "O Medidor", trait: "Maturidade é prática observada, não promessa.", accent: "leaf" },

  // ── Planejamento ─────────────────────────────────────────────────────────
  "@modernization-planner": { name: "Rota", archetype: "A Estrategista", trait: "Nenhum rewrite: uma ponte por vez.", accent: "sky" },
  "@risk-prioritizer": { name: "Bússola", archetype: "A Prudente", trait: "Risco sem impacto é só susto.", accent: "lavender" },
  "@adr-recorder": { name: "Pedra", archetype: "A Memorialista", trait: "Decisão sem registro volta como surpresa.", accent: "sand" },

  // ── Execução ─────────────────────────────────────────────────────────────
  "@test-backfill-agent": { name: "Rede", archetype: "A Protetora", trait: "Pina o comportamento antes de mexer.", accent: "sky" },
  "@refactor-agent": { name: "Lima", archetype: "A Artesã", trait: "Passos pequenos, rollback sempre.", accent: "leaf" },
  "@migration-agent": { name: "Ponte", archetype: "A Viajante", trait: "Expandir, migrar, contrair.", accent: "honey" },
  "@feature-adder": { name: "Broto", archetype: "A Construtora", trait: "Feature e refactor não viajam juntos.", accent: "leaf" },
  "@reviewer": { name: "Lupa", archetype: "A Revisora", trait: "Revisa com a rubrica do repo, não a ideal.", accent: "lavender" },

  // ── Operação ─────────────────────────────────────────────────────────────
  "@devops": { name: "Fluxo", archetype: "O Engenheiro", trait: "Se não dá para reverter, não está pronto.", accent: "sky" },
  "@release": { name: "Selo", archetype: "O Mensageiro", trait: "Versão é contrato, não surpresa.", accent: "honey" },
  "@observability": { name: "Sinal", archetype: "A Vigia", trait: "O que não é observado não está pronto.", accent: "rose" },
  "@incident": { name: "Alarme", archetype: "O Bombeiro", trait: "Primeiro estabiliza, depois entende.", accent: "rose" },
  "@sustain": { name: "Raiz", archetype: "A Zeladora", trait: "O que fica precisa continuar de pé.", accent: "leaf" },

  // ── Greenfield: upstream ─────────────────────────────────────────────────
  "@business": { name: "Brief", archetype: "O Estrategista", trait: "Negócio antes de código.", accent: "honey" },
  "@product": { name: "Prisma", archetype: "A Product Owner", trait: "Cada requisito cabe numa frase.", accent: "sky" },
  "@ux-designer": { name: "Traço", archetype: "A Designer", trait: "Desenha o fluxo antes da tela.", accent: "rose" },
  "@domain-modeler": { name: "Mapa", archetype: "O Modelador", trait: "Nomear bem é metade do domínio.", accent: "lavender" },
  "@bdd": { name: "Cena", archetype: "A Narradora", trait: "Escreve o exemplo antes do teste.", accent: "sand" },
  "@architecture": { name: "Estrutura", archetype: "O Arquiteto", trait: "Decisão difícil vira ADR.", accent: "lavender" },
  "@sprint-planner": { name: "Agenda", archetype: "A Planejadora", trait: "Fatiar é respeito com o time.", accent: "sky" },

  // ── Greenfield: downstream e operação ────────────────────────────────────
  "@sprint-runner": { name: "Trilha", archetype: "O Condutor", trait: "O sprint anda um passo por vez.", accent: "honey" },
  "@backend": { name: "Núcleo", archetype: "O Construtor", trait: "Contrato primeiro, implementação depois.", accent: "leaf" },
  "@frontend": { name: "Vitrine", archetype: "A Construtora", trait: "Consistência vence novidade.", accent: "rose" },
};

/** `@tech-mapper` → `@tech-mapper`; `tech-mapper` → `@tech-mapper`. */
const keyOf = (agentId: string): string => normalizeAgentId(agentId);

/** O nome de cena a partir do id: `@general-purpose` → "General Purpose". */
function nameFromId(agentId: string): string {
  const id = normalizeAgentId(agentId).slice(1);
  const words = id.split(/[-_.]/).filter(Boolean);
  const name = words.map((w) => w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)).join(" ");
  return name === "" ? "Agente" : name.slice(0, 24);
}

const FALLBACK: Omit<CastPersona, "name"> = {
  archetype: "Agente da colmeia",
  trait: "Faz a parte que o fluxo pede, sem inventar atalho.",
  accent: "honey",
};

/** A persona de um agente, com fallback estável para quem não está no elenco. */
export function personaOf(agentId: string): CastPersona {
  const known = AGENT_CAST[keyOf(agentId)];
  if (known) return known;
  return { name: nameFromId(agentId), ...FALLBACK };
}
