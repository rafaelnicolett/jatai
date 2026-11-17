import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import * as path from "path";
import { scenarioTitles } from "./gherkin";
import { RecordingNotifier, type RecordedNotification } from "../../src/adapters/notifier/Notifier";
import type { RemoteSyncInput } from "../../src/adapters/sync/RemoteSyncProvider";
import type { TemplateSource } from "../../src/adapters/templates/TemplateSource";
import {
  PROVIDER_PORT_LABEL,
  PORT_DATA,
  type ProviderMeta,
  type ProviderPort,
} from "../../src/core/extension-api/api-contract.pure";
import type { RunEvent } from "../../src/core/contracts/run-events-contract.pure";
import { EventBus } from "../../src/server/EventBus";
import { createJataiApi, type JataiApiV1 } from "../../src/extension/api/createJataiApi";
import { MemoryConsentStore, type ConsentStore } from "../../src/extension/api/ConsentStore";
import { ProviderHub, type ExtensionTelemetrySink } from "../../src/extension/api/ProviderHub";
import { artifactItems, connectionItems, openConnectedExtensions, sendArtifacts, statusText, type ConnectionItem } from "../../src/extension/api/ui";
import { cleanupWorkspaces, makeWorkspace } from "../characterization/helpers/workspace-fixture";
import { installEgressGuard } from "../contract/helpers/egress-guard";

/**
 * Step definitions de `api-de-extensao.feature` (F2.5, ADR-0023).
 *
 * Cada cenário tem um teste com o mesmo título; a feature roda contra o
 * `ProviderHub` de verdade, com o consentimento em memória, um notificador
 * que registra o pedido e responde o que o cenário manda, e as portas falsas
 * de telemetria/sincronização/templates. O workspace é uma pasta temporária
 * de verdade quando o cenário toca arquivos.
 */

const FEATURE = path.join(__dirname, "api-de-extensao.feature");

const ACME = "acme.companion";
const BETA = "beta.sync";
const OUTRA = "outra.extensao";

const MANIFESTS: Record<string, string> = {
  [ACME]: "Acme Companion",
  [BETA]: "Beta Sync",
};

function meta(over: Partial<ProviderMeta> = {}): ProviderMeta {
  return {
    id: ACME,
    displayName: "Acme Companion",
    purpose: "Levar a atividade dos agentes ao painel da Acme.",
    destinations: ["api.acme.example"],
    ...over,
  };
}

function betaMeta(over: Partial<ProviderMeta> = {}): ProviderMeta {
  return meta({ id: BETA, displayName: "Beta Sync", destinations: ["api.beta.example"], ...over });
}

/** A extensão falsa: guarda os eventos que chegam e, quando o cenário pede, tenta sair para um destino. */
class FakeSink implements ExtensionTelemetrySink {
  readonly events: RunEvent[] = [];
  constructor(private readonly _destination?: string) {}
  push(event: RunEvent): void {
    this.events.push(event);
    if (this._destination) void fetch(`http://${this._destination}/event`, { method: "POST", body: JSON.stringify(event) }).catch(() => undefined);
  }
}

interface FakeTemplateSource extends TemplateSource {
  calls: Array<{ method: "getManifest" | "getZip"; args: unknown[] }>;
}

function fakeTemplateSource(): FakeTemplateSource {
  const calls: FakeTemplateSource["calls"] = [];
  return {
    calls,
    getManifest: (id: string) => {
      calls.push({ method: "getManifest", args: [id] });
      return Promise.resolve(null);
    },
    getZip: (id: string, version?: string) => {
      calls.push({ method: "getZip", args: version === undefined ? [id] : [id, version] });
      return Promise.resolve(null);
    },
  };
}

interface FakeRemoteSync {
  received: RemoteSyncInput[];
  pushArtifact(input: RemoteSyncInput): Promise<{ ok: true; skipped: false; syncFailed: false; contentHash: string }>;
}

function fakeRemoteSync(): FakeRemoteSync {
  const received: RemoteSyncInput[] = [];
  return {
    received,
    pushArtifact: (input: RemoteSyncInput) => {
      received.push(input);
      return Promise.resolve({ ok: true, skipped: false, syncFailed: false, contentHash: `hash-${received.length}` });
    },
  };
}

interface WorldOptions {
  store?: ConsentStore;
  answer?: string | undefined;
  trusted?: boolean;
  /** `null` = sem pasta aberta; `undefined` = a pasta padrão do harness. */
  root?: string | null;
  caller?: string | null;
  registry?: Record<string, string>;
  notifier?: RecordingNotifier;
}

interface World {
  store: ConsentStore;
  notifier: RecordingNotifier;
  hub: ProviderHub;
  api: JataiApiV1;
  bus: EventBus;
  root: string | undefined;
  /** Relê o que o pedido mostrou (o notificador é o mesmo do cenário). */
  requests(): RecordedNotification[];
  /** A próxima resposta do pedido (o cenário troca entre uma decisão e outra). */
  setAnswer(answer: string | undefined): void;
  /** Quem o "VS Code" diz que está registrando agora. */
  setCaller(id: string | null): void;
}

function world(options: WorldOptions = {}): World {
  const store = options.store ?? new MemoryConsentStore();
  let answer = options.answer;
  let caller: string | null = options.caller === undefined ? ACME : options.caller;
  const notifier = options.notifier ?? new RecordingNotifier(() => answer);
  const registry = options.registry ?? MANIFESTS;
  const trusted = options.trusted ?? true;
  const root = options.root === null ? undefined : options.root ?? "/tmp/ws-da-api";

  const hub = new ProviderHub({
    store,
    notifier,
    callerId: () => caller,
    describeExtension: (id) => (registry[id] ? { id, displayName: registry[id]! } : undefined),
    workspaceRoot: () => root,
    isTrusted: () => trusted,
    activeInitiativeId: () => "mod-x",
  });
  const bus = new EventBus();
  hub.bindEventBus(bus);
  return {
    store,
    notifier,
    hub,
    api: createJataiApi(hub),
    bus,
    root,
    requests: () => notifier.recorded,
    setAnswer: (next) => {
      answer = next;
    },
    setCaller: (id) => {
      caller = id;
    },
  };
}

const event = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  run_id: "r-bdd",
  event_type: "agent-started",
  timestamp: "2026-11-16T12:00:00.000Z",
  initiative_id: "mod-x",
  phase_id: "execution",
  agent_id: "@migration-agent",
  ...over,
});

/** Publica no bus, como o RunsWatcher ou uma escrita do State Service faria. */
function publish(w: World, payload: Record<string, unknown>): void {
  w.bus.publish({ source: "runs-watcher", event: payload });
}

interface FakeWindow {
  calls: Array<{ items: unknown; options: unknown }>;
  showQuickPick(items: unknown, options?: unknown): Promise<unknown>;
}

/** `answers` responde uma chamada por vez; sem resposta = a pessoa fechou. */
function fakeWindow(...answers: unknown[]): FakeWindow {
  const calls: FakeWindow["calls"] = [];
  return {
    calls,
    showQuickPick: (items: unknown, options?: unknown) => {
      calls.push({ items, options });
      return Promise.resolve(answers.shift());
    },
  };
}

const FEATURE_PATH = path.join(__dirname, "api-de-extensao.feature");

const INVALID = [
  { problem: "com o nome de exibição em branco", field: "displayName", meta: meta({ displayName: "  " }) },
  { problem: "com a finalidade em branco", field: "purpose", meta: meta({ purpose: "" }) },
  { problem: "sem nenhum destino", field: "destinations", meta: meta({ destinations: [] }) },
  { problem: "com um destino escrito como endereço", field: "https://api.acme.example/v1", meta: meta({ destinations: ["https://api.acme.example/v1"] }) },
  { problem: "com um destino que traz a porta", field: "api.acme.example:8443", meta: meta({ destinations: ["api.acme.example:8443"] }) },
  { problem: "com um destino numérico", field: "203.0.113.7", meta: meta({ destinations: ["203.0.113.7"] }) },
  { problem: "com um destino de uma palavra só", field: "intranet", meta: meta({ destinations: ["intranet"] }) },
  { problem: "com um provedor que não sabe receber", field: "push", meta: meta(), provider: {} },
];

const REQUEST = [
  { conexao: "telemetria", port: "telemetry" as ProviderPort, meta: meta() },
  { conexao: "sincronização de artefatos", port: "remote-sync" as ProviderPort, meta: meta() },
  { conexao: "templates", port: "templates" as ProviderPort, meta: meta() },
];

function providerFor(port: ProviderPort): unknown {
  if (port === "telemetry") return new FakeSink();
  if (port === "remote-sync") return fakeRemoteSync();
  return fakeTemplateSource();
}

function register(w: World, port: ProviderPort, provider: unknown, m: ProviderMeta): { dispose(): void } {
  if (port === "telemetry") return w.api.registerTelemetrySink(provider as ExtensionTelemetrySink, m);
  if (port === "remote-sync") return w.api.registerRemoteSyncProvider(provider as FakeRemoteSync, m);
  return w.api.registerTemplateSource(provider as TemplateSource, m);
}

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "A extensão exporta uma API versionada com os três registros": () => {
    const w = world();
    expect(w.api.apiVersion).toBe(1);
    expect(typeof w.api.registerTelemetrySink).toBe("function");
    expect(typeof w.api.registerRemoteSyncProvider).toBe("function");
    expect(typeof w.api.registerTemplateSource).toBe("function");
  },

  "Registrar uma conexão não liga nada sozinha": async () => {
    const w = world({ answer: undefined });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    publish(w, event());
    expect(sink.events).toEqual([]);
    expect(w.hub.connections()).toMatchObject([{ id: ACME, port: "telemetry", status: "pending", enabled: false }]);
  },

  "Permitir liga a conexão neste workspace": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    publish(w, event());
    expect(sink.events).toHaveLength(1);
    expect(w.hub.connections()).toMatchObject([{ status: "allowed", enabled: true }]);
  },

  "Recusar não incomoda de novo": async () => {
    const store = new MemoryConsentStore();
    const first = world({ store, answer: "Recusar" });
    register(first, "telemetry", new FakeSink(), meta());
    await first.hub.settle();

    const reopened = world({ store, answer: undefined });
    const sink = new FakeSink();
    register(reopened, "telemetry", sink, meta());
    await reopened.hub.settle();
    expect(reopened.requests()).toEqual([]);
    publish(reopened, event());
    expect(sink.events).toEqual([]);
  },

  "Fechar o pedido deixa a decisão para depois, sem ligar nada": async () => {
    const w = world({ answer: undefined });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    publish(w, event());
    expect(sink.events).toEqual([]);
    expect(w.hub.connections()).toMatchObject([{ status: "pending", enabled: false }]);
  },

  "Quem deixou para depois é perguntado de novo na próxima abertura do workspace": async () => {
    const store = new MemoryConsentStore();
    const first = world({ store, answer: undefined });
    register(first, "telemetry", new FakeSink(), meta());
    await first.hub.settle();

    const reopened = world({ store, answer: undefined });
    register(reopened, "telemetry", new FakeSink(), meta());
    await reopened.hub.settle();
    expect(reopened.requests()).toHaveLength(1);
  },

  "A autorização vale só para o workspace em que foi dada": async () => {
    const loja = world({ store: new MemoryConsentStore(), answer: "Permitir" });
    register(loja, "telemetry", new FakeSink(), meta());
    await loja.hub.settle();

    const blog = world({ store: new MemoryConsentStore(), answer: undefined });
    const sink = new FakeSink();
    register(blog, "telemetry", sink, meta());
    await blog.hub.settle();
    expect(blog.requests()).toHaveLength(1);
    publish(blog, event());
    expect(sink.events).toEqual([]);
  },

  "A autorização guardada vale na próxima abertura do workspace": async () => {
    const store = new MemoryConsentStore();
    const first = world({ store, answer: "Permitir" });
    register(first, "telemetry", new FakeSink(), meta());
    await first.hub.settle();

    const reopened = world({ store, answer: undefined });
    const sink = new FakeSink();
    register(reopened, "telemetry", sink, meta());
    await reopened.hub.settle();
    expect(reopened.requests()).toEqual([]);
    publish(reopened, event());
    expect(sink.events).toHaveLength(1);
  },

  "Revogar desliga a conexão": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    await w.hub.revoke("telemetry", ACME);
    publish(w, event());
    expect(sink.events).toEqual([]);
  },

  "Depois de revogar, o pedido não volta": async () => {
    const store = new MemoryConsentStore();
    const first = world({ store, answer: "Permitir" });
    register(first, "telemetry", new FakeSink(), meta());
    await first.hub.settle();
    await first.hub.revoke("telemetry", ACME);

    const reopened = world({ store, answer: undefined });
    const sink = new FakeSink();
    register(reopened, "telemetry", sink, meta());
    await reopened.hub.settle();
    expect(reopened.requests()).toEqual([]);
    publish(reopened, event());
    expect(sink.events).toEqual([]);
  },

  "Desligar mantém a autorização, e ligar de novo não pergunta nada": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    const asks = w.requests().length;
    await w.hub.setEnabled("telemetry", ACME, false);
    await w.hub.setEnabled("telemetry", ACME, true);
    expect(w.requests()).toHaveLength(asks);
    publish(w, event());
    expect(sink.events).toHaveLength(1);
  },

  "Se a extensão passa a declarar um destino novo, o pedido volta": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    const registration = register(w, "telemetry", sink, meta());
    await w.hub.settle();
    registration.dispose();

    // A declaração mudou: o pedido volta e nada sai até a decisão.
    w.setAnswer(undefined);
    const again = register(w, "telemetry", sink, meta({ destinations: ["api.acme.example", "painel.acme.example"] }));
    await w.hub.settle();
    const ask = w.requests().at(-1)!;
    expect(ask.message).toContain("Acme Companion");
    expect(ask.options?.detail).toContain("A declaração mudou");
    publish(w, event());
    expect(sink.events).toEqual([]);

    // A nova decisão libera.
    again.dispose();
    w.setAnswer("Permitir");
    register(w, "telemetry", sink, meta({ destinations: ["api.acme.example", "painel.acme.example"] }));
    await w.hub.settle();
    publish(w, event());
    expect(sink.events).toHaveLength(1);
  },

  "Descartar o registro desliga a conexão": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    const registration = register(w, "telemetry", sink, meta());
    await w.hub.settle();
    registration.dispose();
    publish(w, event());
    expect(sink.events).toEqual([]);
  },

  "Em workspace não confiável o registro é ignorado": async () => {
    const w = world({ trusted: false, answer: "Permitir" });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    expect(w.requests()).toEqual([]);
    expect(w.hub.connections()).toEqual([]);
    publish(w, event());
    expect(sink.events).toEqual([]);
  },

  "Sem pasta aberta o registro é ignorado": async () => {
    const w = world({ root: null, answer: "Permitir" });
    register(w, "telemetry", new FakeSink(), meta());
    await w.hub.settle();
    expect(w.requests()).toEqual([]);
    expect(w.hub.connections()).toEqual([]);
  },

  "Com duas extensões na mesma conexão, a pessoa escolhe qual liga": async () => {
    const w = world({ answer: "Ligar esta" });
    const acme = new FakeSink();
    const beta = new FakeSink();
    register(w, "telemetry", acme, meta());
    await w.hub.settle();
    w.setCaller(BETA);
    register(w, "telemetry", beta, meta({ id: BETA, displayName: "Beta Sync", destinations: ["api.beta.example"] }));
    await w.hub.settle();
    publish(w, event());
    expect(acme.events).toEqual([]);
    expect(beta.events).toHaveLength(1);
    expect(w.hub.connections()).toMatchObject([
      { id: ACME, status: "allowed", enabled: false },
      { id: BETA, status: "allowed", enabled: true },
    ]);
  },

  "A pessoa pode permitir a segunda extensão e manter a primeira ligada": async () => {
    const w = world({ answer: "Permitir" });
    const acme = new FakeSink();
    const beta = new FakeSink();
    register(w, "telemetry", acme, meta());
    await w.hub.settle();
    w.setAnswer("Manter a atual");
    w.setCaller(BETA);
    register(w, "telemetry", beta, meta({ id: BETA, displayName: "Beta Sync", destinations: ["api.beta.example"] }));
    await w.hub.settle();
    publish(w, event());
    expect(acme.events).toHaveLength(1);
    expect(beta.events).toEqual([]);
    expect(w.hub.connections()).toMatchObject([
      { id: ACME, status: "allowed", enabled: true },
      { id: BETA, status: "allowed", enabled: false },
    ]);
  },

  'Em "Extensões conectadas" a pessoa troca a extensão que está ligada': async () => {
    const w = world({ answer: "Permitir" });
    const acme = new FakeSink();
    const beta = new FakeSink();
    register(w, "telemetry", acme, meta());
    await w.hub.settle();
    w.setAnswer("Manter a atual");
    w.setCaller(BETA);
    register(w, "telemetry", beta, meta({ id: BETA, displayName: "Beta Sync", destinations: ["api.beta.example"] }));
    await w.hub.settle();

    const listing = connectionItems(w.hub);
    const betaItem = listing.find((item) => item.connection.id === BETA)!;
    const window = fakeWindow(betaItem, "Ligar");
    await openConnectedExtensions(w.hub, w.notifier, window);
    publish(w, event());
    expect(acme.events).toEqual([]);
    expect(beta.events).toHaveLength(1);
    expect(statusText(w.hub.connections().find((c) => c.id === ACME)!)).toBe("autorizada, desligada");
  },

  "A extensão que registra é identificada pelo VS Code, não pelo que ela declara": () => {
    const w = world({ caller: ACME, registry: MANIFESTS });
    expect(() => register(w, "telemetry", new FakeSink(), meta({ id: OUTRA }))).toThrow(/não é o da extensão que chamou/);
    expect(w.requests()).toEqual([]);
  },

  "Quando o VS Code não consegue dizer quem registra, o registro é recusado": () => {
    const w = world({ caller: null });
    expect(() => register(w, "telemetry", new FakeSink(), meta())).toThrow(/não foi possível identificar/);
    expect(w.requests()).toEqual([]);
  },

  "A mesma extensão não registra duas vezes a mesma conexão": async () => {
    const w = world({ answer: "Permitir" });
    register(w, "telemetry", new FakeSink(), meta());
    await w.hub.settle();
    expect(() => register(w, "telemetry", new FakeSink(), meta())).toThrow(/já registrou/);
  },

  "A telemetria entrega só os campos da lista fechada": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    publish(
      w,
      event({
        content: "conteúdo do arquivo",
        prompt: "prompt inteiro",
        campo_desconhecido: "x",
        metadata: { reason: "motivo", segredo: "não sai", task: "epic-0/task-0.1" },
        message: "x".repeat(200),
      })
    );
    const delivered = sink.events[0]!;
    expect(delivered).not.toHaveProperty("content");
    expect(delivered).not.toHaveProperty("prompt");
    expect(delivered).not.toHaveProperty("campo_desconhecido");
    expect(delivered.metadata).toEqual({ reason: "motivo", task: "epic-0/task-0.1" });
    expect((delivered.message ?? "").length).toBe(140);
  },

  "Um e-mail que apareça num evento não chega à extensão": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    publish(w, event({ event_type: "decision-made", by: "ana@example.com" }));
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).not.toHaveProperty("by");
  },

  "Um evento fora do contrato não chega à extensão": async () => {
    const w = world({ answer: "Permitir" });
    const sink = new FakeSink();
    register(w, "telemetry", sink, meta());
    await w.hub.settle();
    publish(w, event({ event_type: "evento-do-futuro" }));
    expect(sink.events).toEqual([]);
  },

  "O envio de artefatos manda só os arquivos que a pessoa marcar": async () => {
    const root = makeWorkspace("api-envio", {
      ".github/artifacts/planning/mod-x/roadmap.md": "# roadmap\n",
      ".github/artifacts/execution/relatorio.md": "relatório\n",
      ".github/artifacts/assessment/report.md": "assessment\n",
    });
    const w = world({ root, answer: "Permitir" });
    const sync = fakeRemoteSync();
    register(w, "remote-sync", sync, meta());
    await w.hub.settle();

    const result = await w.hub.sendArtifacts([".github/artifacts/planning/mod-x/roadmap.md", ".github/artifacts/execution/relatorio.md"]);
    expect(result.ok).toBe(true);
    expect(sync.received.map((input) => input.path)).toEqual([
      ".github/artifacts/planning/mod-x/roadmap.md",
      ".github/artifacts/execution/relatorio.md",
    ]);
    expect(sync.received[0]).toMatchObject({ initiativeId: "mod-x", content: "# roadmap\n" });
    expect(sync.received.map((input) => input.path)).not.toContain(".github/artifacts/assessment/report.md");
  },

  "A lista de envio nunca oferece segredo, evento nem arquivo temporário": async () => {
    const root = makeWorkspace("api-lista", {
      ".github/artifacts/planning/mod-x/roadmap.md": "x",
      ".github/artifacts/.state-service/server.json": '{"token":"segredo"}',
      ".github/artifacts/runs/mod-x.jsonl": "{}\n",
      ".github/artifacts/scratch.tmp": "temporário",
    });
    const w = world({ root, answer: "Permitir" });
    register(w, "remote-sync", fakeRemoteSync(), meta());
    await w.hub.settle();
    expect(w.hub.listSendable()).toEqual([".github/artifacts/planning/mod-x/roadmap.md"]);
    expect(artifactItems(w.hub).map((item) => item.label)).toEqual([".github/artifacts/planning/mod-x/roadmap.md"]);
  },

  "Sem uma extensão ligada na sincronização, nada é oferecido para enviar": async () => {
    const w = world({ answer: "Permitir" });
    register(w, "telemetry", new FakeSink(), meta());
    await w.hub.settle();
    const window = fakeWindow();
    await sendArtifacts(w.hub, w.notifier, window);
    expect(window.calls).toEqual([]);
    expect(w.requests().at(-1)?.message).toContain("Não há serviço conectado");
  },

  "Cancelar a escolha dos arquivos não envia nada": async () => {
    const root = makeWorkspace("api-cancelar", {
      ".github/artifacts/planning/mod-x/roadmap.md": "x",
      ".github/artifacts/execution/relatorio.md": "y",
    });
    const w = world({ root, answer: "Permitir" });
    const sync = fakeRemoteSync();
    register(w, "remote-sync", sync, meta());
    await w.hub.settle();
    await sendArtifacts(w.hub, w.notifier, fakeWindow(undefined));
    expect(sync.received).toEqual([]);
  },

  "A fonte de templates ligada recebe só o identificador do template": async () => {
    const w = world({ answer: "Permitir" });
    const source = fakeTemplateSource();
    register(w, "templates", source, meta());
    await w.hub.settle();
    await w.hub.templateSource.getManifest("python-api");
    await w.hub.templateSource.getZip("python-api", "1.2.3");
    expect(source.calls).toEqual([
      { method: "getManifest", args: ["python-api"] },
      { method: "getZip", args: ["python-api", "1.2.3"] },
    ]);
  },

  "Sem autorização, o gerador não consulta a extensão e usa o scaffold local": async () => {
    const w = world({ answer: undefined });
    const source = fakeTemplateSource();
    register(w, "templates", source, meta());
    await w.hub.settle();
    const manifest = await w.hub.templateSource.getManifest("python-api");
    const zip = await w.hub.templateSource.getZip("python-api");
    expect(manifest).toBeNull();
    expect(zip).toBeNull();
    expect(source.calls).toEqual([]);
  },

  '"Extensões conectadas" lista cada extensão com a conexão e o estado': async () => {
    const w = world({ answer: "Permitir" });
    register(w, "telemetry", new FakeSink(), meta());
    await w.hub.settle();

    // Beta registra templates e a pessoa recusa.
    w.setAnswer("Recusar");
    w.setCaller(BETA);
    register(w, "templates", fakeTemplateSource(), betaMeta());
    await w.hub.settle();

    const window = fakeWindow(undefined);
    await openConnectedExtensions(w.hub, w.notifier, window);
    const items = window.calls[0]!.items as ConnectionItem[];
    expect(items.map((item) => `${item.label} — ${item.description}`)).toEqual([
      "Acme Companion — telemetria — ligada",
      "Beta Sync — templates — recusada",
    ]);
  },

  'Sem extensão registrada, "Extensões conectadas" explica como elas aparecem': async () => {
    const w = world();
    await openConnectedExtensions(w.hub, w.notifier, fakeWindow());
    expect(w.requests().at(-1)?.message).toContain("Nenhuma extensão conectada");
  },

  "Sem nenhuma extensão, o núcleo não abre conexão para fora": async () => {
    const guard = installEgressGuard();
    try {
      const w = world();
      publish(w, event());
      await w.hub.sendArtifacts([]);
      expect(guard.attempts).toEqual([]);
    } finally {
      guard.restore();
    }
  },

  "Com a extensão instalada mas sem autorização, nada sai": async () => {
    const guard = installEgressGuard();
    try {
      const w = world({ answer: undefined });
      register(w, "telemetry", new FakeSink(), meta());
      await w.hub.settle();
      publish(w, event());
      expect(guard.attempts).toEqual([]);
    } finally {
      guard.restore();
    }
  },

  "Com uma extensão autorizada, a saída de dados acontece só por ela": async () => {
    const guard = installEgressGuard();
    try {
      const w = world({ answer: "Permitir" });
      const sink = new FakeSink("192.0.2.50");
      register(w, "telemetry", sink, meta());
      await w.hub.settle();
      publish(w, event({ run_id: "r-1" }));
      publish(w, event({ run_id: "r-2" }));
      await vi.waitFor(() => expect(guard.attempts.length).toBe(2));
      expect(guard.attempts.map((attempt) => attempt.target)).toEqual(["192.0.2.50:80", "192.0.2.50:80"]);
    } finally {
      guard.restore();
    }
  },
};

// ── Cenários de exemplo (Esquema do Cenário) ────────────────────────────────

for (const example of REQUEST) {
  const title = `O pedido de consentimento diz quem é, para que serve, para onde vão os dados e o que sai [${example.conexao} · ${PORT_DATA[example.port].leaves} · ${PORT_DATA[example.port].neverLeaves}]`;
  SCENARIOS[title] = async () => {
    const w = world({ answer: undefined });
    register(w, example.port, providerFor(example.port), example.meta);
    await w.hub.settle();
    const ask = w.requests()[0]!;
    expect(ask.message).toContain("Acme Companion");
    expect(ask.message).toContain(ACME);
    expect(ask.options?.detail).toContain(example.meta.purpose);
    expect(ask.options?.detail).toContain(example.meta.destinations[0]!);
    expect(ask.options?.detail).toContain(PORT_DATA[example.port].leaves);
    expect(ask.options?.detail).toContain(PORT_DATA[example.port].neverLeaves);
    expect(ask.options?.detail).toContain("só para este workspace");
  };
}

for (const example of INVALID) {
  const title = `Um registro com a declaração incompleta ou inválida é recusado com um erro claro [${example.problem} · ${example.field}]`;
  SCENARIOS[title] = () => {
    const w = world();
    expect(() => register(w, "telemetry", example.provider ?? new FakeSink(), example.meta)).toThrow(new RegExp(escapeRegex(example.field)));
    expect(w.requests()).toEqual([]);
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => cleanupWorkspaces());

describe("Funcionalidade: Conectar extensões companheiras, só com o consentimento de quem usa", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE_PATH).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
