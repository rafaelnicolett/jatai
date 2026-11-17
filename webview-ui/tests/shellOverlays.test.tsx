import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, useState } from "react";
import { Search } from "lucide-react";

// O sino manda mensagens ao host: capturar o que sai, antes de o módulo do VS Code ser carregado.
const env = vi.hoisted(() => {
  const posted: Array<Record<string, unknown>> = [];
  (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
    postMessage: (m: Record<string, unknown>) => posted.push(m),
    getState: () => undefined,
    setState: () => undefined,
  });
  return { posted };
});

import { NotificationCenter } from "../src/apps/cockpit/shell/NotificationCenter/NotificationCenter";
import { CommandDeck } from "../src/apps/cockpit/shell/CommandDeck/CommandDeck";
import type { DeckCommand } from "../src/features/command-deck/commandCatalog";
import { accessibleName, cleanup, click, key, mount } from "./support/component";

/**
 * Os dois painéis que abrem sobre a barra: o sino (painel não modal) e a paleta
 * ⌘K (combobox com lista). Teclado, nomes e foco, que o jsdom consegue conferir.
 */
beforeEach(() => {
  env.posted.length = 0;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const NOTIFICATIONS = [
  { id: "n1", kind: "gate-approved" as const, text: "Gate D1 aprovado · billing-api", timestamp: "2026-07-20T12:30:00Z" },
  { id: "n2", kind: "blocked" as const, text: "@archaeologist bloqueado", timestamp: "2026-07-21T00:23:00Z" },
];

describe("NotificationCenter — o sino", () => {
  const bell = (): HTMLButtonElement => document.querySelector("button[aria-haspopup='dialog']")!;

  it("o nome do botão diz quantas decisões esperam; sem decisão, quantas notificações são novas; sem nada, 'nada novo'", () => {
    const c = mount(<NotificationCenter notifications={NOTIFICATIONS} lastSeenAt={null} pendingDecisions={2} />);
    expect(accessibleName(bell())).toBe("Notificações: 2 decisões esperando");
    cleanup();
    mount(<NotificationCenter notifications={NOTIFICATIONS} lastSeenAt="2026-07-20T18:00:00Z" pendingDecisions={0} />);
    expect(accessibleName(bell())).toBe("Notificações: 1 nova");
    cleanup();
    mount(<NotificationCenter notifications={NOTIFICATIONS} lastSeenAt="2026-12-01T00:00:00Z" />);
    expect(accessibleName(bell())).toBe("Notificações: nada novo");
    expect(c).toBeDefined();
  });

  it("abrir mostra o painel nomeado 'Central de notificações' e marca as novas como vistas, uma vez", () => {
    mount(<NotificationCenter notifications={NOTIFICATIONS} lastSeenAt={null} />);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    click(bell());
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    const dialog = document.querySelector("[role='dialog']")!;
    expect(dialog.getAttribute("aria-label")).toBe("Central de notificações");
    expect(text(dialog)).toContain("Gate D1 aprovado");
    expect(env.posted).toEqual([{ type: "notifications/markSeen" }]);
  });

  it("Esc fecha o painel e devolve o foco ao sino, de onde a pessoa estiver dentro dele", () => {
    mount(<NotificationCenter notifications={NOTIFICATIONS} lastSeenAt="2026-12-01T00:00:00Z" kitNotice={{ installed: "0.6.4", current: "0.6.5" }} />);
    click(bell());
    const inside = [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")].find((b) => text(b) === "Migrar o kit")!;
    act(() => inside.focus());
    key(inside, "Escape");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(bell());
  });

  it("o aviso do kit desatualizado tem a ação 'Migrar o kit', que pede o comando do kit", () => {
    mount(<NotificationCenter notifications={[]} lastSeenAt={null} kitNotice={{ installed: "0.6.4", current: "0.6.5" }} />);
    click(bell());
    expect(text(document.querySelector("[role='dialog']"))).toContain("Kit desatualizado: 0.6.4 → 0.6.5");
    click([...document.querySelectorAll("[role='dialog'] button")].find((b) => text(b) === "Migrar o kit"));
    expect(env.posted.at(-1)).toMatchObject({ type: "runCommand", command: expect.stringMatching(/\.migrateKit$/) });
  });

  it("um clique fora fecha", () => {
    mount(<NotificationCenter notifications={[]} lastSeenAt={null} />);
    click(bell());
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});

describe("CommandDeck — a paleta ⌘K", () => {
  const COMMANDS: DeckCommand[] = [
    { id: "open-chat", label: "Abrir chat", icon: Search, group: "Ações" },
    { id: "go-operations", label: "Ir para Operações", icon: Search, group: "Navegação" },
    { id: "go-discovery", label: "Ir para a Descoberta", icon: Search, group: "Navegação" },
  ];

  function Harness({ run }: { run: (id: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" id="opener" onClick={() => setOpen(true)}>
          Buscar
        </button>
        <CommandDeck commands={COMMANDS} run={run} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  const input = (): HTMLInputElement => document.querySelector("[role='combobox']")!;
  const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[role='option']")];

  function open(run: (id: string) => void = vi.fn()): void {
    vi.useFakeTimers();
    mount(<Harness run={run} />);
    const opener = document.getElementById("opener")!;
    act(() => opener.focus());
    click(opener);
    act(() => {
      vi.advanceTimersByTime(20); // o foco do campo vem depois do paint
    });
  }

  it("fechada, não desenha nada; Ctrl+K e ⌘K abrem", () => {
    mount(<Harness run={vi.fn()} />);
    expect(document.querySelector("[role='dialog']")).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(document.querySelector("[role='dialog']")).not.toBeNull();
    key(document, "Escape");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    expect(document.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("é um combobox com lista: o campo tem nome, aria-controls e aria-activedescendant; as linhas são opções em grupos nomeados", () => {
    open();
    expect(document.querySelector("[role='dialog']")!.getAttribute("aria-label")).toBe("Paleta de comandos");
    expect(accessibleName(input())).toBe("Buscar comando");
    const list = document.getElementById(input().getAttribute("aria-controls")!)!;
    expect(list.getAttribute("role")).toBe("listbox");
    expect([...list.querySelectorAll("[role='group']")].map((g) => g.getAttribute("aria-label"))).toEqual(["Ações", "Navegação"]);
    expect(options().map(text)).toEqual(["Abrir chat", "Ir para Operações", "Ir para a Descoberta"]);
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[0]!.id);
    expect(options()[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("ao abrir, o foco vai para o campo", () => {
    open();
    expect(document.activeElement).toBe(input());
  });

  it("↓ e ↑ movem a opção ativa (que o leitor de tela ouve pelo aria-activedescendant), e Enter roda e fecha", () => {
    const run = vi.fn();
    open(run);
    key(input(), "ArrowDown");
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[1]!.id);
    expect(options()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(options()[0]!.getAttribute("aria-selected")).toBe("false");
    key(input(), "ArrowUp");
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[0]!.id);
    key(input(), "ArrowDown");
    key(input(), "Enter");
    expect(run).toHaveBeenCalledWith("go-operations");
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("Esc fecha e devolve o foco a quem o tinha ao abrir", () => {
    open();
    key(document, "Escape");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("opener"));
  });

  it("sem resultado, diz isso num role=status", () => {
    open();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input(), "zzz");
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(text(document.querySelector("[role='status']"))).toBe('Nenhum comando bate com "zzz".');
    expect(input().getAttribute("aria-activedescendant")).toBeNull();
  });
});
