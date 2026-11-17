import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";
import { stateServiceInfoFilePath } from "../src/server/state-service-info";

/**
 * Ponte de descoberta de porta pro servidor MCP (roadmap `mod-state-service`,
 * item 2.4) — `StateServiceServer` escreve `.github/artifacts/.state-service/server.json`
 * ao subir e apaga ao parar, arquivo separado do `tests/state-service-server.test.ts`
 * do item 2.2 pra não arriscar tocar nenhuma asserção existente.
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-info-"));

const TEST_TOKEN = "test-token-state-service-info";

let server: StateServiceServer | undefined;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }
});

describe("StateServiceServer — arquivo de descoberta (server.json)", () => {
  it("start() cria .github/artifacts/.state-service/server.json com port/pid/startedAt/token", async () => {
    const root = tmpDir();
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    const port = await server.start();

    const infoPath = stateServiceInfoFilePath(root);
    expect(fs.existsSync(infoPath)).toBe(true);

    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
    expect(info).toEqual({
      port,
      pid: process.pid,
      startedAt: expect.any(String),
      token: TEST_TOKEN,
    });
    expect(() => new Date(info.startedAt).toISOString()).not.toThrow();
  });

  it("start() cria server.json com permissão owner-only 0o600 em sistemas POSIX (item 2.5 — carrega o token)", async () => {
    // Windows não usa o modelo de permissão POSIX (owner/group/other) — chmod
    // lá só alterna o atributo somente-leitura, então a asserção de modo não
    // se aplica (ver nota de segurança em state-service-info.ts). Pular é a
    // única opção correta, não uma lacuna de cobertura: não há bit POSIX pra
    // verificar nesse SO.
    if (process.platform === "win32") return;

    const root = tmpDir();
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    await server.start();

    const infoPath = stateServiceInfoFilePath(root);
    const mode = fs.statSync(infoPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("stop() apaga server.json — sinaliza que o serviço não está mais no ar", async () => {
    const root = tmpDir();
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    await server.start();

    const infoPath = stateServiceInfoFilePath(root);
    expect(fs.existsSync(infoPath)).toBe(true);

    await server.stop();
    server = undefined;

    expect(fs.existsSync(infoPath)).toBe(false);
  });

  it("stop() sem start() prévio não lança mesmo sem server.json existente (idempotente)", async () => {
    const root = tmpDir();
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    await expect(server.stop()).resolves.toBeUndefined();
    server = undefined;
  });

  it("cada instância escreve seu próprio root — dois servidores não pisam no server.json um do outro", async () => {
    const rootA = tmpDir();
    const rootB = tmpDir();
    const serverA = new StateServiceServer({ root: rootA, repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    const serverB = new StateServiceServer({ root: rootB, repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });

    const portA = await serverA.start();
    const portB = await serverB.start();

    const infoA = JSON.parse(fs.readFileSync(stateServiceInfoFilePath(rootA), "utf-8"));
    const infoB = JSON.parse(fs.readFileSync(stateServiceInfoFilePath(rootB), "utf-8"));
    expect(infoA.port).toBe(portA);
    expect(infoB.port).toBe(portB);

    await serverA.stop();
    await serverB.stop();
  });
});
