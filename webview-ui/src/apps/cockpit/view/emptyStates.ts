/**
 * emptyStates.ts — os estados vazios do Cockpit, cada um com UMA ação (G9, DS
 * v2 §4.12: "dizer por que está vazio e quando enche, nunca só 'Nada aqui'").
 * Puro: o texto e a mensagem que a ação manda ao host; o componente só
 * desenha. As ações usam só o que o host já entende (`newInitiative`,
 * `runCommand` com o prefixo da marca, `injectRaw`, `shell/requestSnapshot`).
 */
import { BRAND } from "@data";
import type { CockpitSnapshot, WebviewToHostMessage } from "@shared/cockpit-protocol";
import type { ConnectionState } from "./connection";
import type { ViewTarget } from "./viewTarget";

export interface EmptyAction {
  label: string;
  message: WebviewToHostMessage;
}

export interface EmptyStateModel {
  id: "connecting" | "timeout" | "no-folder" | "unconfigured" | "no-initiative" | "no-foundation";
  title: string;
  body: string;
  action?: EmptyAction;
  /** Ainda esperando: a região fica `aria-busy`. */
  busy?: boolean;
}

const ASSISTANT: EmptyAction = { label: "Abrir o assistente", message: { type: "runCommand", command: `${BRAND.commandPrefix}.initializeDeliveryKit` } };
const AGENT = `@${BRAND.participant.name}`;

/** O vazio de uma conexão que ainda não é `ready`. */
export function connectionEmpty(state: ConnectionState): EmptyStateModel | null {
  switch (state.kind) {
    case "ready":
      return null;
    case "connecting":
      return { id: "connecting", title: "Conectando…", body: "Lendo o estado do projeto.", busy: true };
    case "timeout":
      return {
        id: "timeout",
        title: "O estado do projeto não chegou",
        body: `Esperamos ${state.waitedSeconds} segundos e o ${BRAND.displayName} não respondeu. O servidor local pode ainda estar subindo.`,
        action: { label: "Tentar de novo", message: { type: "shell/requestSnapshot" } },
      };
    case "no-folder":
      return {
        id: "no-folder",
        title: "Nenhuma pasta aberta",
        body: `O ${BRAND.displayName} guarda o estado da iniciativa dentro da pasta do projeto. Abra uma pasta no VS Code ou use o assistente para criar o projeto.`,
        action: ASSISTANT,
      };
    case "unconfigured":
      return {
        id: "unconfigured",
        title: "Configure o projeto primeiro",
        body: `Esta área precisa de um projeto ${BRAND.displayName} configurado. O assistente cria a configuração e instala os agentes.`,
        action: ASSISTANT,
      };
  }
}

function hasRepos(snapshot: CockpitSnapshot): boolean {
  return (snapshot.reposInventory?.repos.length ?? 0) > 0 || Object.keys(snapshot.foundationState?.repos ?? {}).length > 0;
}

/** O vazio de uma tela pronta, mas sem o que mostrar: sem iniciativa, ou a Descoberta antes de a Foundation começar. */
export function viewEmpty(snapshot: CockpitSnapshot, target: ViewTarget | null): EmptyStateModel | null {
  if (!target) {
    return {
      id: "no-initiative",
      title: "Ainda não há iniciativa",
      body: `Uma iniciativa é o trabalho que o ${BRAND.displayName} acompanha, do primeiro passo à entrega. Crie a primeira conversando com o agente ${AGENT}.`,
      action: { label: "Nova iniciativa", message: { type: "newInitiative" } },
    };
  }
  if (target.kind === "discovery" && !hasRepos(snapshot)) {
    return {
      id: "no-foundation",
      title: "A Foundation ainda não começou",
      body: `A Descoberta mapeia os repositórios do projeto e é o primeiro passo da metodologia. Comece pelo agente ${AGENT}.`,
      action: { label: "Começar a Descoberta", message: { type: "injectRaw", prompt: `${AGENT} Quero começar a Descoberta (Foundation) deste workspace.` } },
    };
  }
  return null;
}
