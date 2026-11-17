import { describe, it, expect, afterEach, vi } from "vitest";
import { act, useState } from "react";
import { DecisionDialog } from "../src/design-system/patterns/DecisionDialog/DecisionDialog";
import { accessibleName, cleanup, click, key, mount, rulesMatching, source } from "./support/component";

/** DecisionDialog do DS v2 (§4.7): o único lugar onde se decide. Foco, teclado, desabilitado com motivo, erro e envio. */

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const css = source("design-system/patterns/DecisionDialog/DecisionDialog.module.css");

type Props = React.ComponentProps<typeof DecisionDialog>;
const base = (over: Partial<Props> = {}): Props => ({
  variant: "gate",
  eyebrow: "Gate D3 · Execução → Operação",
  question: 'Aprovar o D3 de "Modernização X"?',
  context: "O D3 confirma que a Execução terminou.",
  facts: [],
  checklist: [],
  closure: null,
  evidence: [],
  primary: { label: "Aprovar o D3", onConfirm: vi.fn() },
  submitting: false,
  error: null,
  onChat: vi.fn(),
  onClose: vi.fn(),
  note: "A resposta fica registrada com o seu nome e a data no histórico da iniciativa.",
  ...over,
});

const dialog = (): HTMLElement => document.querySelector("[role='dialog']")!;
const buttons = (): HTMLButtonElement[] => [...dialog().querySelectorAll("button")];
const byText = (text: string): HTMLButtonElement => buttons().find((b) => b.textContent?.includes(text))!;

describe("DecisionDialog — papel, nome e foco", () => {
  it("é um diálogo modal nomeado pela pergunta e descrito pelo contexto e pela nota", () => {
    mount(<DecisionDialog {...base()} />);
    const d = dialog();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(accessibleName(d)).toBe('Aprovar o D3 de "Modernização X"?');
    const described = d.getAttribute("aria-describedby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["O D3 confirma que a Execução terminou.", "A resposta fica registrada com o seu nome e a data no histórico da iniciativa."]);
  });

  it("ao abrir, o foco vai para a pergunta (h2 tabindex=-1) e o botão principal NÃO é focado", () => {
    mount(<DecisionDialog {...base()} />);
    const h2 = dialog().querySelector("h2")!;
    expect(h2.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(h2);
    expect(document.activeElement).not.toBe(byText("Aprovar o D3"));
  });

  it("o fundo fica inert enquanto o diálogo está aberto, e volta ao fechar; o foco volta a quem abriu", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" id="opener" onClick={() => setOpen(true)}>
            Decidir
          </button>
          {open && <DecisionDialog {...base({ onClose: () => setOpen(false) })} />}
        </div>
      );
    }
    const c = mount(<Harness />);
    const opener = c.querySelector<HTMLButtonElement>("#opener")!;
    act(() => opener.focus());
    click(opener);
    expect(c.hasAttribute("inert")).toBe(true);
    key(document.activeElement, "Escape");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(c.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("Esc fecha sem decidir; durante o envio, não", () => {
    const onClose = vi.fn();
    const first = mount(<DecisionDialog {...base({ onClose })} />);
    key(dialog().querySelector("h2"), "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    const busy = vi.fn();
    mount(<DecisionDialog {...base({ onClose: busy, submitting: true })} />);
    key(dialog().querySelector("h2"), "Escape");
    expect(busy).not.toHaveBeenCalled();
    void first;
  });

  it("o foco fica preso: Tab no último volta ao primeiro, Shift+Tab na pergunta vai ao último", () => {
    mount(<DecisionDialog {...base()} />);
    const all = buttons();
    const last = all[all.length - 1]!;
    act(() => last.focus());
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => {
      last.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(all[0]);
    const shift = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    act(() => {
      dialog().querySelector("h2")!.dispatchEvent(shift);
    });
    expect(document.activeElement).toBe(last);
  });
});

describe("DecisionDialog — conteúdo", () => {
  it("fato sem dado mostra '—' e 'sem dado registrado'", () => {
    mount(<DecisionDialog {...base({ facts: [{ label: "O que está em jogo", value: "Publicar o código" }, { label: "Commit", value: null }] })} />);
    const text = [...dialog().querySelectorAll("dl > div")].map((d) => d.textContent?.replace(/\s+/g, " "));
    expect(text).toEqual(["O que está em jogoPublicar o código", "Commit—sem dado registrado"]);
  });

  it("a regra de fechamento lista o que falta (○) e o que foi cortado, com o motivo em texto", () => {
    mount(
      <DecisionDialog
        {...base({
          closure: {
            open: [{ key: "epic-0/task-2", status: "em andamento" }, { key: "epic-0/task-3", status: "bloqueada", reason: "espera o dono" }],
            cancelled: [{ key: "epic-0/task-4", status: "cancelada", reason: "escopo cortado" }],
            closedCount: 1,
            total: 4,
          },
        })}
      />
    );
    expect(dialog().textContent).toContain("1 de 4 fechadas");
    const open = [...dialog().querySelectorAll("ul[aria-label='O que falta'] li")].map((li) => li.textContent);
    expect(open).toEqual(["epic-0/task-2: em andamento", "epic-0/task-3: bloqueada (espera o dono)"]);
    expect(dialog().querySelector("ul[aria-label='Canceladas'] li")?.textContent).toBe("epic-0/task-4: cancelada: escopo cortado");
  });

  it("tudo fechado: diz que o gate pode ser aprovado", () => {
    mount(<DecisionDialog {...base({ closure: { open: [], cancelled: [], closedCount: 3, total: 3 } })} />);
    expect(dialog().textContent).toContain("Tudo fechado: o gate pode ser aprovado.");
  });

  it("o checklist humano: marcável quando há quem grave, só leitura quando não há, e o que falta marcar entra no total", () => {
    const onToggle = vi.fn();
    mount(
      <DecisionDialog
        {...base({
          checklist: [
            { id: "a", label: "Brief criado", required: true, checked: false, onToggle },
            { id: "b", label: "Riscos listados", required: false, checked: true },
          ],
        })}
      />
    );
    const boxes = [...dialog().querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([[false, false], [true, true]]);
    expect(dialog().textContent).toContain("0 de 1 obrigatórios");
    expect(dialog().textContent).toContain("(obrigatório)");
    click(boxes[0]);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("a evidência abre o arquivo", () => {
    const onOpen = vi.fn();
    mount(<DecisionDialog {...base({ evidence: [{ path: "docs/roadmap.md", onOpen }] })} />);
    click(byText("docs/roadmap.md"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("DecisionDialog — botão principal", () => {
  it("desabilitado por motivo: aria-disabled, o clique é ignorado e a ajuda diz o porquê em texto", () => {
    const onConfirm = vi.fn();
    mount(<DecisionDialog {...base({ primary: { label: "Aprovar o D3", disabledReason: "Falta fechar 2 tarefas", onConfirm } })} />);
    const primary = byText("Aprovar o D3");
    expect(primary.getAttribute("aria-disabled")).toBe("true");
    expect(primary.disabled).toBe(false); // continua focável
    expect(dialog().textContent).toContain("Falta fechar 2 tarefas");
    expect(document.getElementById(primary.getAttribute("aria-describedby")!)?.textContent).toBe("Falta fechar 2 tarefas");
    click(primary);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("habilitado: o clique confirma", () => {
    const onConfirm = vi.fn();
    mount(<DecisionDialog {...base({ primary: { label: "Aprovar o D3", onConfirm } })} />);
    click(byText("Aprovar o D3"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("enviando: aria-busy no diálogo, 'Registrando…' no botão e as outras ações ficam aria-disabled", () => {
    const onClose = vi.fn();
    mount(<DecisionDialog {...base({ submitting: true, onClose })} />);
    expect(dialog().getAttribute("aria-busy")).toBe("true");
    expect(byText("Registrando…")).toBeTruthy();
    expect(byText("Decidir depois").getAttribute("aria-disabled")).toBe("true");
    click(byText("Decidir depois"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("erro: alerta com o texto e o botão vira 'Tentar de novo'", () => {
    mount(<DecisionDialog {...base({ error: "Não deu para registrar a decisão. Nada foi gravado." })} />);
    const alert = dialog().querySelector("[role='alert']")!;
    expect(alert.textContent).toContain("Não deu para registrar a decisão. Nada foi gravado.");
    expect(byText("Tentar de novo")).toBeTruthy();
  });

  it("sem botão principal (decisão que se resolve no chat): explica e oferece conversar", () => {
    const onChat = vi.fn();
    mount(<DecisionDialog {...base({ primary: null, chatOnly: "Esta decisão se resolve no chat com o agente.", onChat })} />);
    expect(dialog().textContent).toContain("Esta decisão se resolve no chat com o agente.");
    expect(byText("Fechar")).toBeTruthy();
    click(byText("Conversar no @jatai"));
    expect(onChat).toHaveBeenCalledTimes(1);
  });
});

describe("DecisionDialog — quem decide e o que foi decidido", () => {
  it("pede o nome quando o git não tem usuário, e o campo recebe o foco", () => {
    const onChange = vi.fn();
    mount(<DecisionDialog {...base({ nameField: { value: "", onChange } })} />);
    const input = dialog().querySelector<HTMLInputElement>("input[autocomplete='name']")!;
    expect(document.activeElement).toBe(input);
    expect(accessibleName(input.closest("label")!)).toContain("o git deste workspace não tem user.name");
  });

  it("a decisão pede o texto curto do que foi decidido, com limite", () => {
    mount(<DecisionDialog {...base({ textField: { label: "O que você decidiu", value: "", maxLength: 140, onChange: vi.fn() } })} />);
    const input = dialog().querySelector<HTMLInputElement>("input[type='text']")!;
    expect(input.maxLength).toBe(140);
  });
});

describe("DecisionDialog — estilo", () => {
  it("entra com opacidade e deslocamento curto, uma vez, sem loop; abaixo de 600px empilha as ações", () => {
    const dialogRule = rulesMatching(css, ".dialog");
    expect(dialogRule).toContain("animation: enter var(--jt-dur-base)");
    expect(dialogRule).not.toContain("infinite");
    expect(css).toContain("@media (max-width: 599px)");
    expect(css).toContain("min(620px");
  });

  it("cores forçadas: o diálogo ganha borda do sistema e perde a sombra", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain("CanvasText");
    expect(forced).toContain("box-shadow: none");
  });
});
