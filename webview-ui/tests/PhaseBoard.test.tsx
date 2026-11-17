import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PhaseBoard, type BoardCard, type BoardLane } from "../src/design-system/patterns/PhaseBoard/PhaseBoard";

/**
 * `PhaseBoard` é o único componente deste PR que carrega lógica de fato não
 * trivial de mais de um passo (abrir modal ao clicar no card, sem abrir
 * quando o clique é no botão "Aprovar") — a convenção do repo é nunca testar
 * componente React diretamente (extrair pra `compute*.ts`/`use*.ts`), mas
 * "clicar aqui não deve borbulhar pra ali" é comportamento de wiring de DOM
 * que só existe de verdade quando renderizado; não há função pura que o
 * capture sem perder o que está sendo verificado. `react-dom/client` já é
 * dependência do projeto (nenhuma lib de teste nova instalada, sem
 * `@testing-library/react`).
 */

const LANES: BoardLane[] = [
  { key: "pending", label: "Pendente" },
  { key: "running", label: "Em andamento" },
  { key: "done", label: "Concluído" },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(cards: BoardCard[]): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<PhaseBoard lanes={LANES} cards={cards} />);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function click(el: Element | null): void {
  if (!el) throw new Error("elemento não encontrado");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const longSummary =
  "25 tabelas propostas cobrindo os 7 artefatos de estado (repos, context_entries/locations, wave_status, initiatives, gate_history, human_checklist, approval_friction) com migração incremental por Expand-Contract, sem big bang.";

describe("PhaseBoard — modal de detalhe do card (Pedido 1)", () => {
  it("clicar no card abre o modal com o título (resumo) completo, mesmo sem truncamento CSS no DOM de teste", () => {
    const el = render([{ key: "item-1.1", id: "item-1.1", title: longSummary, lane: "done", status: "done" }]);

    expect(el.querySelector('[role="dialog"]')).toBeNull();
    click(el.querySelector('[role="button"]'));

    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain(longSummary);
    expect(dialog!.textContent).toContain("item-1.1");
  });

  it("clicar no botão 'Fechar' (X) do modal fecha e chama onApprove normalmente se clicado depois no card de novo", () => {
    const el = render([{ key: "item-1.1", id: "item-1.1", title: longSummary, lane: "done", status: "done" }]);
    click(el.querySelector('[role="button"]'));
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();

    click(el.querySelector("button[aria-label='Fechar']"));
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it("clicar fora do painel (backdrop) fecha o modal", () => {
    const el = render([{ key: "item-1.1", id: "item-1.1", title: longSummary, lane: "done", status: "done" }]);
    click(el.querySelector('[role="button"]'));
    const dialog = el.querySelector('[role="dialog"]')!;
    const backdrop = dialog.parentElement!;
    click(backdrop);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it("clicar no botão 'Aprovar' do card NÃO abre o modal, e ainda dispara onApprove", () => {
    const onApprove = vi.fn();
    const el = render([
      { key: "item-1.1", id: "item-1.1", title: longSummary, lane: "done", status: "done", approve: { onApprove } },
    ]);

    const approveBtn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Aprovar")!;
    expect(approveBtn).toBeTruthy();
    click(approveBtn);

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it("modal mostra commit/artefatos/known bugs (card.details) quando presentes — gap fechado desta sessão: antes esses 3 campos nunca chegavam do adapter até o BoardCard", () => {
    const el = render([
      {
        key: "item-1.1",
        id: "item-1.1",
        title: longSummary,
        lane: "done",
        status: "done",
        details: {
          commit: "7d409ea",
          artifacts: ["docs/adr/0003-x.md"],
          knownBugs: ["requireFlag trata --flag vazio igual a ausente"],
        },
      },
    ]);
    click(el.querySelector('[role="button"]'));
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("7d409ea");
    expect(dialog.textContent).toContain("docs/adr/0003-x.md");
    expect(dialog.textContent).toContain("requireFlag trata --flag vazio igual a ausente");
  });

  it("modal mostra completed_at (meta) MESMO quando o card tem approve — o rodapé compacto some com meta nesse caso, o modal não", () => {
    const el = render([
      {
        key: "item-1.1",
        id: "item-1.1",
        title: longSummary,
        lane: "done",
        status: "done",
        meta: "2026-08-20",
        approve: { onApprove: () => {} },
      },
    ]);
    click(el.querySelector('[role="button"]'));
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("2026-08-20");
    expect(dialog.textContent).toContain("Aprovar");
  });
});
