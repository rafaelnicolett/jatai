/**
 * workspaceServices.ts — State Service HTTP local e RunsWatcher da pasta
 * aberta (F3.6, Extract Class do estado mutável de módulo que vivia em
 * `extension.ts`: `stateServiceServer`, `stateServiceReady`, `runsWatcher`).
 *
 * Uma instância por ativação, criada pelo container: quem tem a referência é
 * o composition root, não o módulo.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { StateServiceServer } from "../../server/StateServiceServer";
import type { EventBus } from "../../server/EventBus";
import { RunsWatcher } from "../../server/RunsWatcher";
import { startArtifactWatcher, type ArtifactWatcher } from "../../state/runs/ArtifactWatcher";
import { generateStateServiceToken } from "../../server/state-service-auth";
import type { StateRepository } from "../../state/repository/StateRepository";
import type { Secrets } from "../../adapters/secrets/Secrets";
import type { FileWatcher } from "../../adapters/files/FileWatcher";
import {
  CLAUDE_LAYOUT_DIR,
  WORKSPACE_MARKER_FILES,
  shouldStartWorkspaceServices,
  type WorkspaceActivationFacts,
} from "../../data/workspace-activation";
import type { WorkspaceServicesStarter } from "../commands/types";
import { BRAND } from "../../data/brand.pure";

/** Porta HTTP escolhida pelo State Service (roadmap `mod-state-service`, item 2.2) — guardada pra uso futuro do servidor MCP (item 2.4) e do Cockpit (wave 3). Nenhum consumidor real lê esta chave ainda. */
const STATE_SERVICE_PORT_KEY = `${BRAND.name}.stateServicePort`;

/**
 * Chave do `SecretStorage` (`context.secrets`) onde o token de auth do State
 * Service desta ativação é o registro canônico (item 2.5, roadmap
 * `mod-state-service`). NUNCA use `vscode.workspace.getConfiguration` pra
 * isto — é exatamente o padrão já achado como falha em `helyx.apiKey`
 * (A02/A07 do security-report; a setting saiu junto com o registry na
 * F2.1). `SecretStorage`
 * é backed pelo keychain do SO; a cópia em `server.json`
 * (`state-service-info.ts`) é só a ponte pro processo MCP standalone, que
 * não tem acesso a este contexto.
 *
 * Gerado de novo a cada ativação — não precisa sobreviver a um reload/restart
 * (ver `state-service-auth.ts`), então não há leitura de volta desta chave em
 * nenhum lugar: o valor só existe pra registrar o token canônico, nunca é
 * reidratado de uma ativação anterior.
 */
const STATE_SERVICE_TOKEN_SECRET_KEY = `${BRAND.name}.stateServiceToken`;

/**
 * O que a casca precisa ler do disco para decidir a ativação (ver
 * `data/workspace-activation.ts`, que só decide). Nunca lança.
 */
export function readWorkspaceActivationFacts(root: string | undefined): WorkspaceActivationFacts {
  const trusted = vscode.workspace.isTrusted;
  if (!root) return { hasFolder: false, trusted, rootEntries: [] };
  const names = [...WORKSPACE_MARKER_FILES, CLAUDE_LAYOUT_DIR];
  return { hasFolder: true, trusted, rootEntries: names.filter((name) => fs.existsSync(path.join(root, name))) };
}

export interface WorkspaceServicesDeps {
  context: vscode.ExtensionContext;
  secrets: Secrets;
  fileWatcher: FileWatcher;
  repository: StateRepository;
  eventBus: EventBus;
}

export class WorkspaceServices implements WorkspaceServicesStarter {
  /** Instância do State Service HTTP desta ativação — parada em `stop()`. `null` fora de workspace Helyx. */
  private _server: StateServiceServer | null = null;

  /**
   * Resolve quando a tentativa de subida do State Service HTTP desta ativação
   * termina — com sucesso OU falha (nunca rejeita: ambos os ramos de
   * `_server.start()` abaixo só logam, nunca propagam o erro).
   * `CockpitNextController` (roadmap `mod-state-service`, item 3.2) aguarda
   * isto antes da primeira leitura via HTTP — os dois sobem juntos em
   * `activate()` e a ordem entre eles não é garantida (`start()` é
   * assíncrono), então sem isto o primeiro fetch do Cockpit poderia disparar
   * antes do servidor terminar de subir (ECONNREFUSED/`server.json` ausente).
   * Default resolvido — fora de workspace Helyx não há
   * State Service para esperar (mesma condição de `_server` acima).
   */
  private _ready: Promise<void> = Promise.resolve();

  /** Watcher centralizado de `.github/artifacts/runs/*.jsonl` (Fonte 2 do event bus, item 2.3) — parado em `stop()`. `null` fora de workspace Helyx. */
  private _runsWatcher: RunsWatcher | null = null;

  /**
   * Observador de `.github/artifacts/**` (F5.2, contrato `agent-activity` §3): vira um evento
   * `artifact-written` por arquivo salvo, com debounce. É o fallback universal de atividade, o
   * único caminho de tempo real do Copilot, que não tem hooks. `null` fora de workspace Helyx.
   */
  private _artifactWatcher: ArtifactWatcher | null = null;

  constructor(private readonly _deps: WorkspaceServicesDeps) {}

  /** A tentativa de subida em curso (ou a última); resolvida se nada subiu. */
  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * State Service HTTP local (roadmap `mod-state-service`, item 2.2) — bind
   * só em 127.0.0.1, porta escolhida pelo SO (0) — e o RunsWatcher, para a
   * pasta `stateServiceRoot`. Uma vez por ativação: chamar de novo não faz nada.
   * Quem chama já decidiu que a pasta é um workspace Helyx.
   */
  start(stateServiceRoot: string): Promise<void> {
    if (this._server) return this._ready;
    const { context, secrets, fileWatcher, repository, eventBus } = this._deps;
    // Token de auth desta ativação (item 2.5) — um valor novo por ativação,
    // nunca precisa sobreviver a um restart (ver state-service-auth.ts).
    // Registro canônico vai pro SecretStorage (backed pelo keychain do SO,
    // NUNCA workspace.getConfiguration — esse é o erro já catalogado em
    // helyx.apiKey/A02-A07, não repetir aqui); `StateServiceServer` também
    // recebe o valor direto (é quem grava a cópia em server.json, a única
    // ponte que o processo MCP standalone consegue ler — ver
    // state-service-info.ts para a discussão do trade-off). Gravar no
    // SecretStorage é fire-and-forget: se falhar, o servidor HTTP e o
    // arquivo de descoberta continuam funcionando com o mesmo token em
    // memória — só o registro canônico no keychain que não existiria.
    const stateServiceToken = generateStateServiceToken();
    void (async (): Promise<void> => {
      try {
        // Fire-and-forget com try/catch dentro de uma IIFE async: a falha
        // só é logada, nunca derruba a subida do servidor.
        await secrets.store(STATE_SERVICE_TOKEN_SECRET_KEY, stateServiceToken);
      } catch (err) {
        console.error(`[${BRAND.name}] State Service: falha ao gravar token no SecretStorage:`, err);
      }
    })();

    this._server = new StateServiceServer({
      root: stateServiceRoot,
      repository,
      eventBus,
      token: stateServiceToken,
    });
    this._ready = this._server
      .start()
      .then((port) => {
        void context.globalState.update(STATE_SERVICE_PORT_KEY, port);
        console.warn(`[${BRAND.name}] State Service HTTP escutando em 127.0.0.1:${port}`);
      })
      .catch((err) => {
        console.error(`[${BRAND.name}] State Service HTTP: falha ao subir servidor:`, err);
      });

    // Barramento de eventos (roadmap `mod-state-service`, item 2.3) — Fonte 2
    // (fora do processo, ex.: CLI via terminal). Um publicador in-process
    // (Fonte 1) publicaria direto; este watcher cobre o que o Extension Host não
    // vê sozinho. Substitui a necessidade de mais um watcher espalhado —
    // não migra nenhum consumidor existente (Cockpit continua com os dele
    // até a wave 3.2).
    this._runsWatcher = new RunsWatcher(stateServiceRoot, eventBus, fileWatcher);
    this._runsWatcher.start();
    // Atividade de agente sem hooks (Copilot): o que se salva em .github/artifacts/ vira evento.
    // Ignora runs/ e .state-service/ por contrato, então não alimenta a si mesmo.
    this._artifactWatcher = startArtifactWatcher(stateServiceRoot, fileWatcher);
    return this._ready;
  }

  async startIfBrandWorkspace(root: string): Promise<void> {
    // A pasta virou workspace Helyx agora: sobe o State Service antes do
    // Cockpit ler (na ativação ela ainda não era Helyx, ver C7).
    if (shouldStartWorkspaceServices(readWorkspaceActivationFacts(root))) {
      await this.start(root);
    }
  }

  /** Para o servidor (apaga o `server.json`) e o watcher. Idempotente. */
  stop(): void {
    if (this._server) {
      const server = this._server;
      this._server = null;
      void server.stop();
    }
    if (this._runsWatcher) {
      const watcher = this._runsWatcher;
      this._runsWatcher = null;
      watcher.stop();
    }
    if (this._artifactWatcher) {
      const watcher = this._artifactWatcher;
      this._artifactWatcher = null;
      watcher.dispose();
    }
  }
}
