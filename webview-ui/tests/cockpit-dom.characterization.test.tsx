import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import type { Initiative } from "@data";
import { ShellRoot } from "../src/apps/cockpit/ShellRoot";
import { cockpitStore } from "../src/store/CockpitStore";
import { DEFAULT_PERSISTED_STATE } from "../src/store/PersistedUIState";
import { setPersistedState } from "../src/store/vscodeApi";
import { buildMockSnapshot } from "../src/mock/mockData";
import { modernizationSnapshot } from "./support/cockpitFixtures";
import { goldenBrandSnapshotSerializer } from "../../tests/golden/lib/brand";

// Snapshot na marca do golden (F1.3): só a marca pode mudar o texto.
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * Caracterização do DOM do Cockpit — rede de segurança da F3.9 (Webview
 * limpo, mod-missao-open-source). Behavior pinned on 2026-11-15.
 *
 * A F3.9 move componentes entre pastas (design-system → app do Cockpit,
 * features → design-system) e divide o `DeliveryProgress`. Nada disso pode
 * mudar o que a tela mostra. Este teste monta o `ShellRoot` de verdade no
 * jsdom, alimenta o `cockpitStore` com o snapshot do mock harness
 * (`mock/mockData.ts`, o mesmo pipeline de parsers do host) e grava o DOM de
 * cada cenário.
 *
 * Normalização (só o que depende de onde o arquivo mora ou da máquina):
 * - classe de CSS Module `_nome_<hash do caminho>` vira `nome`: mover o
 *   arquivo muda o hash, não a classe aplicada;
 * - hora local (`toLocaleTimeString`) vira `<hh:mm>`, porque depende do fuso e
 *   do locale da máquina;
 * - os ids do `useId` (`:r1a:`) são renumerados por ordem de aparição, porque o
 *   contador do React é global e o número mudaria com a ordem dos cenários.
 * O relógio é fixo (`Date` falso), para os textos relativos ("há 3 min").
 *
 * F4.2 (parte 2): regravada DE PROPÓSITO quando a casca do Cockpit passou para o
 * design system v2 (trilha de fase, "Agora", potes, quadro do épico, gates e o
 * seletor de iniciativa). O DOM mudou por inteiro, então os 11 cenários seguem
 * os mesmos assuntos (carregando, visão padrão, seletor aberto, a Descoberta,
 * outra iniciativa, entrega, épicos no seletor, sem iniciativa, Operações,
 * notificações), agora com os controles da tela nova. O diff está explicado
 * no commit.
 */

// Fuso fixo antes de qualquer data ser formatada: as datas absolutas ("20/07/2026") não variam por máquina.
process.env.TZ = "UTC";
const NOW = new Date("2026-07-29T18:00:00Z");

function normalize(html: string): string {
  // `useId` numera por um contador global do React: o número muda se outro cenário
  // rodar antes (ou se um rodar sozinho). Renumera por ordem de aparição e preserva
  // as ligações (`aria-labelledby` ↔ `id`).
  const ids = new Map<string, string>();
  return html
    .replace(/\b_([A-Za-z][A-Za-z0-9-]*)_[0-9a-f]{5,8}\b/g, "$1")
    .replace(/:r[0-9a-z]+:/g, (id) => {
      if (!ids.has(id)) ids.set(id, `:r${ids.size}:`);
      return ids.get(id)!;
    })
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?/g, "<hh:mm>")
    .replace(/></g, ">\n<");
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ShellRoot />);
  });
  return container;
}

function deliver(snapshot: CockpitSnapshot): void {
  act(() => {
    cockpitStore.handleMessage({ type: "shell/snapshot", seq: 1, generatedAt: NOW.toISOString(), payload: snapshot });
  });
}

function click(el: Element | null | undefined): void {
  if (!el) throw new Error("elemento não encontrado para o clique");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function byText(c: HTMLElement, selector: string, text: string): Element | undefined {
  return [...c.querySelectorAll(selector)].find((el) => (el.textContent ?? "").includes(text));
}

function withActive(active: string, patch: Partial<CockpitSnapshot> = {}): CockpitSnapshot {
  const base = buildMockSnapshot();
  return { ...base, initiatives: { ...base.initiatives!, active }, ...patch };
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

// A visão escolhida (iniciativa, parada) é persistida pelo webview: sem zerar,
// um cenário herdaria o clique do anterior e a ordem dos testes mudaria o DOM.
beforeEach(() => {
  setPersistedState({ ...DEFAULT_PERSISTED_STATE });
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe("caracterização — DOM do Cockpit (F3.9, regravada na F4.2)", () => {
  it("antes do primeiro snapshot: conectando, com aria-busy", () => {
    const c = mount();
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("visão padrão: a modernização ativa ainda na Descoberta, com a trilha, o Agora, os potes, o quadro e os gates", () => {
    const c = mount();
    deliver(buildMockSnapshot());
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("seletor de iniciativas aberto: Workspace › Descoberta, as iniciativas e '+ Nova iniciativa'", () => {
    const c = mount();
    deliver(buildMockSnapshot());
    click(c.querySelector('button[aria-haspopup="listbox"]'));
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("a Descoberta do workspace: um repositório por parada, as fases no quadro e um D1 por repositório", () => {
    const c = mount();
    deliver(buildMockSnapshot());
    click(c.querySelector('button[aria-haspopup="listbox"]'));
    click(byText(c, 'button[role="option"]', "Descoberta"));
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("navegar para outra iniciativa só muda a visão: a ativa continua a mesma, com o aviso e 'Tornar ativa' (G15)", () => {
    const c = mount();
    deliver(buildMockSnapshot());
    click(c.querySelector('button[aria-haspopup="listbox"]'));
    click(byText(c, 'button[role="option"]', "Modernizar Billing"));
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("entrega (feature) com o Gate G1 aprovado: o Downstream, com a sprint e os itens de revisão e bloqueio", () => {
    const c = mount();
    deliver(withActive("modernize-billing"));
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("modernização em execução (D1 e D2 aprovados): escolher o outro épico na trilha troca o quadro", () => {
    const c = mount();
    deliver(modernizationSnapshot());
    click(c.querySelectorAll('button[role="tab"][id^="stop-"]')[1]);
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("iniciativa com epics aparece no seletor como 'epic N/M' (vocabulário da hierarquia, ADR-0006)", () => {
    const c = mount();
    const epicInitiative: Initiative = {
      id: "mod-epics",
      name: "Modernização por epics",
      status: "in-progress",
      mode: "brownfield",
      type: "modernization",
      epics: ["epic-1: diagnóstico", "epic-2: correção"],
      epic_status: { "epic-1": { status: "done" } },
    };
    const base = buildMockSnapshot();
    deliver({ ...base, initiatives: { ...base.initiatives!, initiatives: [...base.initiatives!.initiatives, epicInitiative] } });
    click(c.querySelector('button[aria-haspopup="listbox"]'));
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("sem nenhuma iniciativa: a barra vira o chamado 'Nova iniciativa' e a Descoberta é a visão", () => {
    const c = mount();
    deliver({ ...buildMockSnapshot(), initiatives: { active: "", initiatives: [] } });
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("a página de Operações, aberta pelo segmento da trilha", () => {
    const c = mount();
    deliver(buildMockSnapshot());
    click(byText(c, "nav button", "Operação"));
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });

  it("central de notificações aberta, com o aviso do kit desatualizado", () => {
    const c = mount();
    deliver(buildMockSnapshot());
    click(c.querySelector('button[title="Notificações"]'));
    expect(normalize(c.innerHTML)).toMatchSnapshot();
  });
});
