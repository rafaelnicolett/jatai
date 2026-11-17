import { describe, it, expect } from "vitest";
import { WizardLauncher, type WizardHandle } from "../src/wizard/WizardLauncher";

/**
 * H-BUG-53: cada comando de abrir o Wizard criava um controller novo, e a
 * guarda do "já está aberto" era por instância; a abertura automática da
 * primeira ativação e o clique na barra lateral geravam dois painéis. O
 * lançador guarda o Wizard aberto. Dublê escrito à mão, sem VS Code.
 */

class FakeWizard implements WizardHandle {
  isOpen = false;
  starts = 0;
  async start(): Promise<void> {
    this.starts++;
    this.isOpen = true;
  }
}

describe("WizardLauncher (H-BUG-53)", () => {
  it("REGRESSÃO: pedir o Wizard duas vezes seguidas, com o painel aberto, cria um só Wizard e só o traz à frente na segunda", async () => {
    const created: FakeWizard[] = [];
    const launcher = new WizardLauncher(() => created.push(new FakeWizard()) && created.at(-1)!);
    await launcher.open();
    await launcher.open();
    expect(created).toHaveLength(1);
    expect(created[0]!.starts).toBe(2);
  });

  it("depois que o painel fecha, o próximo pedido cria um Wizard novo (cada abertura começa do zero)", async () => {
    const created: FakeWizard[] = [];
    const launcher = new WizardLauncher(() => created.push(new FakeWizard()) && created.at(-1)!);
    await launcher.open();
    created[0]!.isOpen = false;
    await launcher.open();
    expect(created).toHaveLength(2);
  });
});
