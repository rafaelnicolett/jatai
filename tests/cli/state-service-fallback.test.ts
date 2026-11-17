import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { runInitiativesCommand } from "../../src/cli/commands/initiatives";
import { runDeliveryStateCommand } from "../../src/cli/commands/delivery-state";
import { parseInitiativesYaml } from "../../src/data/initiatives-contract.pure";
import { parseDeliveryState } from "../../src/data/delivery-state-contract.pure";
import { StateServiceServer } from "../../src/server/StateServiceServer";
import { stateRepository, YamlStateRepository } from "../../src/cli/lib/StateRepository";
import { writeStateServiceInfo } from "../../src/server/state-service-info";
import { STATE_SERVICE_CLI_TIMEOUT_MS } from "../../src/cli/lib/state-service-cli-client";
import { captureCliAsync, parseJsonLine } from "./process-capture";

/**
 * Comportamento fim-a-fim do CLI (`commands/initiatives.ts`,
 * `commands/delivery-state.ts`) diante do State Service — item 3.1,
 * roadmap `mod-state-service`. Duas situações:
 *
 * 1. State Service DISPONÍVEL: sobe um `StateServiceServer` real (mesma
 *    classe do item 2.2, escrevendo num `YamlStateRepository` real) numa
 *    porta OS-escolhida, com `server.json` de verdade — o CLI descobre e
 *    usa esse caminho. Provado por dois sinais: (a) o arquivo é gravado com
 *    o conteúdo esperado, e (b) `stateRepository.<método>Atomic` (o
 *    singleton que o CLI chamaria no fallback) NUNCA é chamado — só o HTTP
 *    escreveu.
 * 2. State Service INDISPONÍVEL (sem `server.json`, ou `server.json`
 *    apontando pra uma porta sem NADA escutando): o CLI cai pro caminho de
 *    escrita direta em YAML que já existia — provado pelo mesmo par de
 *    sinais invertido: arquivo gravado corretamente E
 *    `stateRepository.<método>Atomic` FOI chamado.
 *
 * `initiatives-command.test.ts`/`delivery-state-command.test.ts` (item 1.3)
 * já teste o mesmo fallback implicitamente (sem `server.json` no diretório
 * de teste) para TODOS os verbos — este arquivo cobre explicitamente o
 * sinal "qual caminho foi usado" e o caso "disponível" (client real, servidor
 * real), que aqueles arquivos não tocam.
 */

let tmp: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;
let server: StateServiceServer | undefined;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-cli-fallback-"));
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmp);
});

afterEach(async () => {
  cwdSpy.mockRestore();
  if (server) {
    await server.stop();
    server = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Os casos "disponível" provam QUAL caminho o CLI usa, não o orçamento de
 * 300 ms do cliente: o `fetch` real do Node é mantido, só sem o AbortSignal
 * do prazo. Sem isso, o resultado dependia da carga da máquina (flaky da
 * linha de base). O timeout em si é coberto em `state-service-cli-client.test.ts`.
 */
function fetchWithoutDeadline(): void {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const { signal: _deadline, ...rest } = init ?? {};
    return realFetch(input, rest);
  }) as typeof fetch);
}

/**
 * Porta que o SO acabou de sortear e que ficou livre: o `fetch` aceita (fica na
 * faixa efêmera, longe das portas que ele recusa, todas ≤ 10080) e nada escuta
 * nela, então a conexão é recusada (ECONNREFUSED), o caso que o teste promete.
 */
async function closedEphemeralPort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as net.AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function initiativesYamlPath(): string {
  return path.join(tmp, ".github", "artifacts", "initiatives.yaml");
}

function globalDeliveryStateYamlPath(): string {
  return path.join(tmp, ".github", "artifacts", "delivery-state.yaml");
}

const TOKEN = "cli-fallback-token";

/** Só os casos "disponível" sobem o servidor: eles usam o `fetch` sem o prazo de 300 ms (ver `fetchWithoutDeadline`). */
async function startRealStateService(repository: YamlStateRepository = new YamlStateRepository()): Promise<void> {
  fetchWithoutDeadline();
  server = new StateServiceServer({ root: tmp, repository, port: 0, token: TOKEN });
  await server.start();
}

/**
 * Máquina carregada, de forma determinística: o servidor demora mais que o
 * orçamento de 300 ms do cliente (`STATE_SERVICE_CLI_TIMEOUT_MS`) para
 * responder. Injetado pelo construtor do servidor (porta `StateRepository`).
 */
class SlowYamlStateRepository extends YamlStateRepository {
  override upsertInitiativeAtomic(...args: Parameters<YamlStateRepository["upsertInitiativeAtomic"]>): ReturnType<YamlStateRepository["upsertInitiativeAtomic"]> {
    const until = Date.now() + 2 * STATE_SERVICE_CLI_TIMEOUT_MS;
    while (Date.now() < until) { /* ocupa o event loop, como um worker sob carga */ }
    return super.upsertInitiativeAtomic(...args);
  }
}

describe("runInitiativesCommand — State Service disponível", () => {
  it("create: usa o HTTP (arquivo gravado, escrita direta NUNCA chamada)", async () => {
    await startRealStateService();
    const directSpy = vi.spyOn(stateRepository, "upsertInitiativeAtomic");

    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-x", "--name", "Feature X"]));

    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "feat-x" });
    expect(directSpy).not.toHaveBeenCalled();

    const { state } = parseInitiativesYaml(fs.readFileSync(initiativesYamlPath(), "utf-8"));
    expect(state!.initiatives[0]).toMatchObject({ id: "feat-x", name: "Feature X" });
  });

  // Flaky que vinha da linha de base: sob carga, a 1ª escrita HTTP do worker
  // (que inclui a inicialização preguiçosa do fetch do Node) chegou a 190 ms
  // numa máquina local, perto do orçamento de 300 ms do cliente. Estourou, o
  // cliente cai no fallback e "escrita direta NUNCA chamada" falha.
  it("REGRESSÃO: com o servidor mais lento que o orçamento de 300 ms do cliente (máquina carregada), o caso 'disponível' continua provando o caminho HTTP", async () => {
    await startRealStateService(new SlowYamlStateRepository());
    const directSpy = vi.spyOn(stateRepository, "upsertInitiativeAtomic");

    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-lenta"]));

    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "feat-lenta" });
    expect(directSpy).not.toHaveBeenCalled();
  });

  it("bump-phase pra iniciativa inexistente: o State Service responde INITIATIVE_NOT_FOUND, o CLI repassa (não tenta o fallback por cima)", async () => {
    await startRealStateService();
    const directSpy = vi.spyOn(stateRepository, "bumpInitiativePhaseAtomic");

    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("bump-phase", ["--id", "nao-existe", "--phase", "product"]));

    expect(exitCode).toBe(1);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: false, error: { code: "INITIATIVE_NOT_FOUND", id: "nao-existe" } });
    expect(directSpy).not.toHaveBeenCalled();
  });
});

describe("runInitiativesCommand — State Service indisponível", () => {
  it("sem server.json: cai pro fallback (arquivo gravado, escrita direta FOI chamada)", async () => {
    const directSpy = vi.spyOn(stateRepository, "upsertInitiativeAtomic");

    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-y"]));

    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "feat-y" });
    expect(directSpy).toHaveBeenCalledTimes(1);
    const { state } = parseInitiativesYaml(fs.readFileSync(initiativesYamlPath(), "utf-8"));
    expect(state!.initiatives[0]).toMatchObject({ id: "feat-y" });
  });

  it("server.json aponta pra uma porta sem NADA escutando: mesmo assim cai pro fallback (timeout/ECONNREFUSED, nunca trava, nunca lança)", async () => {
    // Antes era a porta 1, que o `fetch` recusa antes de conectar ("bad port"):
    // o caso nunca exercitava a conexão recusada, e o log "fetch failed / bad
    // port" saía em toda execução, o que confundia o diagnóstico do flaky.
    writeStateServiceInfo(tmp, { port: await closedEphemeralPort(), pid: 999999, startedAt: "2026-08-26T00:00:00.000Z", token: TOKEN });
    const directSpy = vi.spyOn(stateRepository, "upsertInitiativeAtomic");

    const start = Date.now();
    const { exitCode, stdout } = await captureCliAsync(() => runInitiativesCommand("create", ["--id", "feat-z"]));
    const elapsed = Date.now() - start;

    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, id: "feat-z" });
    expect(directSpy).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(2000); // bem acima do timeout de 300ms — só garante que não ficou pendurado
  });
});

describe("runDeliveryStateCommand — State Service disponível/indisponível", () => {
  it("disponível: upsert-phase usa o HTTP (arquivo gravado, escrita direta NUNCA chamada)", async () => {
    await startRealStateService();
    const directSpy = vi.spyOn(stateRepository, "upsertDeliveryPhaseAtomic");

    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-phase", ["--global", "--phase", "business", "--status", "done", "--agent", "@business"])
    );

    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, phase: "business", status: "done" });
    expect(directSpy).not.toHaveBeenCalled();

    const parsed = parseDeliveryState(fs.readFileSync(globalDeliveryStateYamlPath(), "utf-8"));
    expect(parsed!.phases.business).toMatchObject({ status: "done", agent: "@business" });
  });

  it("indisponível: upsert-checklist cai pro fallback (arquivo gravado, escrita direta FOI chamada)", async () => {
    const directSpy = vi.spyOn(stateRepository, "upsertDeliveryChecklistItemAtomic");

    const { exitCode, stdout } = await captureCliAsync(() =>
      runDeliveryStateCommand("upsert-checklist", ["--global", "--phase", "business", "--item", "kpi-defined", "--checked", "true"])
    );

    expect(exitCode).toBe(0);
    expect(parseJsonLine(stdout)).toMatchObject({ ok: true, changed: true, phase: "business", item: "kpi-defined", checked: true });
    expect(directSpy).toHaveBeenCalledTimes(1);

    const parsed = parseDeliveryState(fs.readFileSync(globalDeliveryStateYamlPath(), "utf-8"));
    expect(parsed!.phases.business!.human_checklist).toMatchObject({ "kpi-defined": true });
  });
});
