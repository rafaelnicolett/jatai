import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { ShellRoot } from "../src/apps/cockpit/ShellRoot";
import { cockpitStore } from "../src/store/CockpitStore";
import { modernizationSnapshot } from "./support/cockpitFixtures";
import { cleanup, click, mount } from "./support/component";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";

/**
 * G9: uma falha ao montar o que a tela mostra não apaga o Cockpit. As funções
 * puras que derivam o modelo (trilha, quadro, "Agora") são o lugar mais provável
 * de uma exceção, porque leem o snapshot; por isso a derivação também fica
 * DENTRO do ErrorBoundary, e não só o desenho. A barra superior sobrevive e
 * "Tentar de novo" refaz a derivação.
 */
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

let seq = 0;
function deliver(snapshot: CockpitSnapshot): void {
  act(() => cockpitStore.handleMessage({ type: "shell/snapshot", seq: ++seq, generatedAt: new Date().toISOString(), payload: snapshot }));
}

/** Um snapshot com um item de épico nulo: nenhum parser real o produz, e a derivação do quadro lança ao lê-lo. */
function corrupted(): CockpitSnapshot {
  const snapshot = modernizationSnapshot();
  const initiative = snapshot.initiatives!.initiatives[0]!;
  initiative.epic_status = { "epic-0": { status: "in-progress", items: { "task-1": null as never } } };
  return snapshot;
}

const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("ShellRoot — falha ao derivar o que a tela mostra", () => {
  it("fica na tela que falhou, com a barra à vista, o motivo em texto e 'Tentar de novo'", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // o React registra a exceção que o ErrorBoundary segura
    mount(<ShellRoot />);
    deliver(corrupted());
    const alert = document.querySelector("[role='alert']")!;
    expect(alert).not.toBeNull();
    expect(text(alert)).toContain("O Cockpit falhou ao desenhar");
    expect(text(alert)).toContain("Nada foi gravado");
    expect(document.querySelector("header button[aria-haspopup='listbox']")).not.toBeNull();
    expect([...alert.querySelectorAll("button")].map(text)).toEqual(["Tentar de novo"]);
  });

  it("um snapshot bom que chega depois traz a tela de volta sozinho", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount(<ShellRoot />);
    deliver(corrupted());
    expect(document.querySelector("[role='alert']")).not.toBeNull();
    deliver(modernizationSnapshot());
    expect(document.querySelector("[role='alert']")).toBeNull();
    expect(document.querySelector("section[aria-label='Agora']")).not.toBeNull();
  });

  it("'Tentar de novo' refaz a derivação: com o motivo ainda presente, o erro volta, sem apagar o painel", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount(<ShellRoot />);
    deliver(corrupted());
    click([...document.querySelectorAll("[role='alert'] button")].find((b) => text(b) === "Tentar de novo"));
    expect(document.querySelector("[role='alert']")).not.toBeNull();
    expect(document.querySelector("header")).not.toBeNull();
  });
});
