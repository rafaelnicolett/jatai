import { describe, it, expect, afterEach, vi } from "vitest";
import { workspace, window, commands, Uri } from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ManualFileWatcher } from "../src/adapters/files/FileWatcher";
import { RunsWatcher } from "../src/server/RunsWatcher";
import { EventBus } from "../src/server/EventBus";
import { RecordingChatHost } from "../src/adapters/chat/ChatHost";
import { VsCodeChatHost } from "../src/adapters/chat/VsCodeChatHost";
import { RecordingNotifier } from "../src/adapters/notifier/Notifier";
import { VsCodeNotifier } from "../src/adapters/notifier/VsCodeNotifier";
import { FixedClock, SystemClock } from "../src/adapters/clock/Clock";
import { FixedWorkspaceRoot } from "../src/adapters/workspace/WorkspaceRoot";
import { VsCodeWorkspaceRoot } from "../src/adapters/workspace/VsCodeWorkspaceRoot";
import { ScriptedFolderPicker } from "../src/adapters/folders/FolderPicker";
import { VsCodeFolderPicker } from "../src/adapters/folders/VsCodeFolderPicker";
import { InMemorySettings } from "../src/adapters/settings/Settings";
import { VsCodeSettings } from "../src/adapters/settings/VsCodeSettings";
import { InMemorySecrets } from "../src/adapters/secrets/Secrets";
import { VsCodeSecrets } from "../src/adapters/secrets/VsCodeSecrets";
import { BRAND } from "../src/data/brand.pure";

/**
 * F3.6 — portas da casca do VS Code. Cada adaptador do VS Code faz a mesma
 * chamada que o código fazia antes direto na API; as implementações de teste
 * (fixas) existem para os módulos que recebem a porta.
 */

afterEach(() => {
  (workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
});

describe("Clock", () => {
  it("SystemClock devolve o instante atual", () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it("FixedClock devolve sempre o mesmo instante, numa cópia que o chamador pode mexer", () => {
    const clock = new FixedClock(new Date("2026-11-16T10:00:00Z"));
    const a = clock.now();
    a.setFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-11-16T10:00:00.000Z");
  });
});

describe("Settings", () => {
  it("VsCodeSettings lê da seção da marca, com o default quando a chave não existe", () => {
    const settings = new VsCodeSettings();
    expect(settings.get("deliveryHierarchy", "legacy")).toBe("legacy");
    const getConfiguration = workspace.getConfiguration;
    const sections: unknown[] = [];
    (workspace as { getConfiguration: unknown }).getConfiguration = (section: string) => {
      sections.push(section);
      return { get: (key: string, d: unknown) => (key === "deliveryHierarchy" ? "epic-feature-backlog-task" : d) };
    };
    try {
      expect(settings.get("deliveryHierarchy", "legacy")).toBe("epic-feature-backlog-task");
      expect(sections).toEqual([BRAND.configSection]);
    } finally {
      (workspace as { getConfiguration: unknown }).getConfiguration = getConfiguration;
    }
  });

  it("InMemorySettings devolve o valor dado ou o default", () => {
    const settings = new InMemorySettings({ "approvalFriction.riskFields": ["merge_block"] });
    expect(settings.get("approvalFriction.riskFields", [] as string[])).toEqual(["merge_block"]);
    expect(settings.get("deliveryHierarchy", "legacy")).toBe("legacy");
  });
});

describe("Secrets", () => {
  it("VsCodeSecrets grava no SecretStorage do contexto", async () => {
    const stored: Array<[string, string]> = [];
    const secrets = new VsCodeSecrets({ store: (k: string, v: string) => (stored.push([k, v]), Promise.resolve()) } as never);
    await secrets.store("chave", "valor");
    expect(stored).toEqual([["chave", "valor"]]);
  });

  it("InMemorySecrets guarda o par chave/valor", async () => {
    const secrets = new InMemorySecrets();
    await secrets.store("k", "v");
    expect([...secrets.values]).toEqual([["k", "v"]]);
  });
});

describe("Notifier", () => {
  it("VsCodeNotifier repassa mensagem e ações a show*Message, e o modal de decisão vai como aviso com opções", async () => {
    const calls: unknown[][] = [];
    const spies = (["showInformationMessage", "showWarningMessage", "showErrorMessage"] as const).map((name) =>
      vi.spyOn(window, name).mockImplementation(((...args: unknown[]) => {
        calls.push([name, ...args]);
        return Promise.resolve(name === "showWarningMessage" ? "Migrar" : undefined);
      }) as never)
    );
    try {
      const n = new VsCodeNotifier();
      await n.info("i", "A");
      await n.error("e");
      expect(await n.ask("Migrar?", { modal: true, detail: "d" }, "Migrar")).toBe("Migrar");
      await n.warn("w", "B", "C");
      expect(calls).toEqual([
        ["showInformationMessage", "i", "A"],
        ["showErrorMessage", "e"],
        ["showWarningMessage", "Migrar?", { modal: true, detail: "d" }, "Migrar"],
        ["showWarningMessage", "w", "B", "C"],
      ]);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it("RecordingNotifier grava as mensagens e responde com o que o teste programar", async () => {
    const n = new RecordingNotifier((m) => (m.kind === "ask" ? "Sim" : undefined));
    expect(await n.ask("Seguir?", { modal: true }, "Sim")).toBe("Sim");
    expect(await n.progress("Trabalhando", async (report) => (report({ message: "passo" }), 42))).toBe(42);
    expect(n.recorded.map((r) => r.kind)).toEqual(["ask", "progress"]);
  });
});

describe("ChatHost", () => {
  it("VsCodeChatHost abre workbench.action.chat.open com a query; parcial só preenche", async () => {
    const calls: unknown[][] = [];
    const spy = vi.spyOn(commands, "executeCommand").mockImplementation(((...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(undefined);
    }) as never);
    try {
      const chat = new VsCodeChatHost();
      await chat.open("olá");
      await chat.open("rascunho", { partial: true });
      expect(calls).toEqual([
        ["workbench.action.chat.open", { query: "olá" }],
        ["workbench.action.chat.open", { query: "rascunho", isPartialQuery: true }],
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it("RecordingChatHost grava os pedidos", async () => {
    const chat = new RecordingChatHost();
    await chat.open("a");
    await chat.open("b", { partial: true });
    expect(chat.opened).toEqual([{ query: "a", partial: false }, { query: "b", partial: true }]);
  });
});

describe("FileWatcher", () => {
  it("RunsWatcher vigia runs/*.jsonl pela porta e publica no bus o evento do arquivo avisado", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-filewatcher-"));
    try {
      const runs = path.join(root, ".github/artifacts/runs");
      fs.mkdirSync(runs, { recursive: true });
      const files = new ManualFileWatcher();
      const bus = new EventBus();
      const published: unknown[] = [];
      bus.subscribe((e) => published.push(e));
      const watcher = new RunsWatcher(root, bus, files);
      watcher.start();
      expect(files.watches.map((w) => ({ baseDir: w.baseDir, glob: w.glob }))).toEqual([{ baseDir: runs, glob: "*.jsonl" }]);
      const file = path.join(runs, "r.jsonl");
      fs.writeFileSync(file, `${JSON.stringify({ run_id: "r1", event_type: "agent-done", timestamp: "2026-11-16T10:00:00Z" })}\n`);
      files.watches[0]!.fire("create", file);
      expect(published).toHaveLength(1);
      watcher.stop();
      expect(files.watches[0]!.disposed).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("WorkspaceRoot", () => {
  it("VsCodeWorkspaceRoot lê a primeira pasta aberta a cada chamada (undefined sem pasta)", () => {
    const root = new VsCodeWorkspaceRoot();
    expect(root.current()).toBeUndefined();
    (workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: Uri.file("/tmp/ws-a") }, { uri: Uri.file("/tmp/ws-b") }];
    expect(root.current()).toBe("/tmp/ws-a");
  });

  it("FixedWorkspaceRoot devolve a raiz dada", () => {
    expect(new FixedWorkspaceRoot("/tmp/x").current()).toBe("/tmp/x");
    expect(new FixedWorkspaceRoot(undefined).current()).toBeUndefined();
  });
});

describe("FolderPicker (F4.3)", () => {
  it("VsCodeFolderPicker abre o seletor só de pastas, sem multiseleção, e devolve o caminho escolhido", async () => {
    const asked: unknown[] = [];
    const spy = vi.spyOn(window, "showOpenDialog").mockImplementation(((options: unknown) => {
      asked.push(options);
      return Promise.resolve([{ fsPath: "/sintetico/escolhida" }]);
    }) as never);
    try {
      const picked = await new VsCodeFolderPicker().pick({ title: "Escolha onde criar", openLabel: "Selecionar pasta", defaultFolder: "/sintetico/aberta" });
      expect(picked).toBe("/sintetico/escolhida");
      expect(asked).toEqual([
        { canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: "Selecionar pasta", title: "Escolha onde criar", defaultUri: { fsPath: "/sintetico/aberta" } },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it("VsCodeFolderPicker devolve undefined quando a pessoa cancela, e não manda defaultUri sem pasta inicial", async () => {
    const asked: Array<Record<string, unknown>> = [];
    const spy = vi.spyOn(window, "showOpenDialog").mockImplementation(((options: Record<string, unknown>) => {
      asked.push(options);
      return Promise.resolve(undefined);
    }) as never);
    try {
      expect(await new VsCodeFolderPicker().pick({ title: "t", openLabel: "o" })).toBeUndefined();
      expect("defaultUri" in asked[0]!).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("ScriptedFolderPicker responde na ordem, guarda o que foi pedido e, sem resposta sobrando, cancela", async () => {
    const picker = new ScriptedFolderPicker(["/a", undefined]);
    expect(await picker.pick({ title: "1", openLabel: "x" })).toBe("/a");
    expect(await picker.pick({ title: "2", openLabel: "x" })).toBeUndefined();
    expect(await picker.pick({ title: "3", openLabel: "x" })).toBeUndefined();
    expect(picker.asked.map((o) => o.title)).toEqual(["1", "2", "3"]);
  });
});

describe("WorkspaceRoot.all (F4.3)", () => {
  it("FixedWorkspaceRoot lista a pasta e as outras; sem pasta, lista vazia", () => {
    expect(new FixedWorkspaceRoot("/a", ["/b"]).all()).toEqual(["/a", "/b"]);
    expect(new FixedWorkspaceRoot(undefined).all()).toEqual([]);
  });

  it("VsCodeWorkspaceRoot lista todas as pastas abertas, a primeira primeiro", () => {
    (workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: "/a" } }, { uri: { fsPath: "/b" } }];
    expect(new VsCodeWorkspaceRoot().all()).toEqual(["/a", "/b"]);
    expect(new VsCodeWorkspaceRoot().current()).toBe("/a");
    (workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    expect(new VsCodeWorkspaceRoot().all()).toEqual([]);
  });
});
