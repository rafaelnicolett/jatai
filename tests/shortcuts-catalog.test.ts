import { describe, it, expect } from "vitest";
import { SHORTCUT_ACTIONS, visibleShortcutAsks } from "../src/data/shortcuts-catalog";
import { BRAND } from "../src/data/brand.pure";

describe("SHORTCUT_ACTIONS", () => {
  it("todo item de kind 'command' declara um comando começando com helyx.", () => {
    for (const a of SHORTCUT_ACTIONS.filter((x) => x.kind === "command")) {
      expect(a.command, `'${a.id}' é kind command mas não declara 'command'`).toBeDefined();
      expect(a.command!.startsWith(`${BRAND.commandPrefix}.`)).toBe(true);
    }
  });

  it("'atualizar painel' é kind 'refresh', não 'command' — não pode ser amarrado a um controller específico", () => {
    const refresh = SHORTCUT_ACTIONS.find((a) => a.id === "refresh-panel");
    expect(refresh?.kind).toBe("refresh");
    expect(refresh?.command).toBeUndefined();
  });

  it("ids são únicos", () => {
    const ids = SHORTCUT_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("visibleShortcutAsks", () => {
  it("sem repos: esconde 'adicionar repositório'", () => {
    const asks = visibleShortcutAsks(false);
    expect(asks.find((a) => a.id === "ask-add-repo")).toBeUndefined();
  });

  it("com repos: mostra todas, incluindo 'adicionar repositório'", () => {
    const asks = visibleShortcutAsks(true);
    expect(asks.find((a) => a.id === "ask-add-repo")).toBeDefined();
  });

  it("toda pergunta é kind 'prompt' com prompt não vazio", () => {
    for (const a of visibleShortcutAsks(true)) {
      expect(a.kind).toBe("prompt");
      expect(a.prompt?.length).toBeGreaterThan(0);
    }
  });
});
