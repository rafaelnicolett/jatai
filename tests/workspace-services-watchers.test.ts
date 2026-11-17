import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { WorkspaceServices } from "../src/extension/startup/workspaceServices";
import { ManualFileWatcher } from "../src/adapters/files/FileWatcher";
import { EventBus } from "../src/server/EventBus";
import { YamlStateRepository } from "../src/state/repository/StateRepository";
import type { Secrets } from "../src/adapters/secrets/Secrets";
import type * as vscode from "vscode";

/**
 * Integração da onda 5a (frente G × frente C): o observador de artefatos (F5.2, contrato
 * `agent-activity` §3, fallback de atividade do Copilot) existe em `src/state/runs`, mas
 * só serve se a extensão o ligar junto do State Service. `WorkspaceServices` é quem liga
 * o RunsWatcher; o observador de artefatos entra no mesmo ciclo de vida.
 */

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const fn of cleanups.splice(0).reverse()) fn();
});

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ws-services-"));
  fs.mkdirSync(path.join(root, ".github", "artifacts"), { recursive: true });
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

async function startServices(root: string): Promise<{ services: WorkspaceServices; files: ManualFileWatcher }> {
  const files = new ManualFileWatcher();
  const secrets: Secrets = { store: async () => undefined } as unknown as Secrets;
  const context = { globalState: { update: async () => undefined, get: () => undefined } } as unknown as vscode.ExtensionContext;
  const services = new WorkspaceServices({
    context,
    secrets,
    fileWatcher: files,
    repository: new YamlStateRepository(),
    eventBus: new EventBus(),
  });
  cleanups.push(() => services.stop());
  await services.start(root);
  return { services, files };
}

function readRunEvents(root: string): Array<Record<string, unknown>> {
  const dir = path.join(root, ".github", "artifacts", "runs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("WorkspaceServices — observadores de atividade (F5.2)", () => {
  it("start() liga o RunsWatcher e o observador de artefatos, cada um na sua pasta", async () => {
    const root = workspace();
    const { files } = await startServices(root);

    const bases = files.watches.map((w) => w.baseDir);
    expect(bases).toContain(path.join(root, ".github", "artifacts", "runs"));
    expect(bases).toContain(path.join(root, ".github", "artifacts"));
    expect(files.watches).toHaveLength(2);
  });

  it("um artefato salvo vira um evento artifact-written com harness watcher, depois do debounce", async () => {
    const root = workspace();
    const { files } = await startServices(root);
    const artifacts = path.join(root, ".github", "artifacts");
    const watch = files.watches.find((w) => w.baseDir === artifacts);
    expect(watch, "o observador de artefatos precisa estar ligado").toBeDefined();

    watch!.fire("change", path.join(artifacts, "planning", "demo", "roadmap.md"));

    await vi.waitFor(() => expect(readRunEvents(root).filter((e) => e.event_type === "artifact-written")).toHaveLength(1), {
      timeout: 4000,
      interval: 50,
    });
    const [event] = readRunEvents(root);
    expect(event).toMatchObject({
      event_type: "artifact-written",
      artifact_path: ".github/artifacts/planning/demo/roadmap.md",
      harness: "watcher",
    });
  });

  it("não gera evento para o que o próprio observador escreve (runs/) nem para o State Service", async () => {
    const root = workspace();
    const { files } = await startServices(root);
    const artifacts = path.join(root, ".github", "artifacts");
    const watch = files.watches.find((w) => w.baseDir === artifacts);
    expect(watch).toBeDefined();

    watch!.fire("change", path.join(artifacts, "runs", "workspace.jsonl"));
    watch!.fire("change", path.join(artifacts, ".state-service", "server.json"));
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(readRunEvents(root)).toEqual([]);
  });

  it("stop() desliga os dois observadores", async () => {
    const root = workspace();
    const { services, files } = await startServices(root);

    services.stop();

    expect(files.watches).toHaveLength(2);
    expect(files.watches.every((w) => w.disposed)).toBe(true);
  });
});
