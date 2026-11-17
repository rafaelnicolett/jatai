import { describe, it, expect, vi, beforeEach } from "vitest";
import { commands } from "vscode";
import { MainPanelProvider } from "../src/views/MainPanelProvider";
import type { ConfigLoader } from "../src/adapters/config/ConfigLoader";
import { BRAND } from "../src/data/brand.pure";

/**
 * Sidebar do Helyx: clicar no ícone resolve a view, que redireciona pro
 * Wizard ou pro Cockpit sem nunca mostrar UI própria (ver comentário na
 * classe). O bug reportado era: workspace já configurado (brownfield,
 * pós-Foundation) sempre caía no Wizard — cobrindo aqui o contrato real
 * (delega a decisão pra `ConfigLoader.isConfigured()`), não a causa raiz
 * específica do schema (isso já está em config-loader.test.ts).
 */

function fakeConfigLoader(configured: boolean): ConfigLoader {
  return {
    invalidate: vi.fn(),
    isConfigured: vi.fn().mockResolvedValue(configured),
  } as unknown as ConfigLoader;
}

function fakeWebviewView() {
  const listeners: Array<() => void> = [];
  return {
    webview: { options: undefined as unknown, html: "" },
    visible: true,
    onDidChangeVisibility: (cb: () => void) => {
      listeners.push(cb);
    },
    fireVisibilityChange(visible: boolean): void {
      this.visible = visible;
      listeners.forEach((cb) => cb());
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("MainPanelProvider — routing Wizard vs Cockpit", () => {
  it("workspace configurado (single-project ou brownfield) → abre o Cockpit, nunca o Wizard", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const provider = new MainPanelProvider({} as never, fakeConfigLoader(true));

    provider.resolveWebviewView(fakeWebviewView() as never);
    await flushMicrotasks();

    expect(executeCommand).toHaveBeenCalledWith(`${BRAND.commandPrefix}.openCockpitNext`);
    expect(executeCommand).not.toHaveBeenCalledWith(`${BRAND.commandPrefix}.initializeDeliveryKit`);
  });

  it("workspace não configurado → abre o Wizard", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const provider = new MainPanelProvider({} as never, fakeConfigLoader(false));

    provider.resolveWebviewView(fakeWebviewView() as never);
    await flushMicrotasks();

    expect(executeCommand).toHaveBeenCalledWith(`${BRAND.commandPrefix}.initializeDeliveryKit`);
    expect(executeCommand).not.toHaveBeenCalledWith(`${BRAND.commandPrefix}.openCockpitNext`);
  });

  it("clique seguinte no ícone (view já resolvida) redireciona de novo, não fica em branco", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const loader = fakeConfigLoader(true);
    const provider = new MainPanelProvider({} as never, loader);
    const view = fakeWebviewView();

    provider.resolveWebviewView(view as never);
    await flushMicrotasks();
    executeCommand.mockClear();

    view.fireVisibilityChange(true);
    await flushMicrotasks();

    expect(executeCommand).toHaveBeenCalledWith(`${BRAND.commandPrefix}.openCockpitNext`);
  });

  it("mudança de visibilidade para invisível não dispara redirect", async () => {
    const executeCommand = vi.spyOn(commands, "executeCommand").mockResolvedValue(undefined);
    const provider = new MainPanelProvider({} as never, fakeConfigLoader(true));
    const view = fakeWebviewView();

    provider.resolveWebviewView(view as never);
    await flushMicrotasks();
    executeCommand.mockClear();

    view.fireVisibilityChange(false);
    await flushMicrotasks();

    expect(executeCommand).not.toHaveBeenCalled();
  });
});

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
