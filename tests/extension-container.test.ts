import { describe, it, expect } from "vitest";
import { ExtensionContainer } from "../src/extension/container";
import { YamlStateRepository, stateRepository } from "../src/state/repository/StateRepository";
import { EventBus, stateServiceEventBus } from "../src/server/EventBus";
import { NullTelemetrySink } from "../src/adapters/telemetry/TelemetrySink";
import { NullTemplateSource } from "../src/adapters/templates/TemplateSource";
import { NullRemoteSyncProvider } from "../src/adapters/sync/RemoteSyncProvider";

/**
 * F3.6 — o container é o composition root explícito: cada ativação ganha o
 * seu repositório e o seu barramento, nunca o singleton de módulo, e as
 * portas de extensão (ADR-0023) nascem Null (ADR-0015).
 */

const context = { subscriptions: [] } as never;

describe("ExtensionContainer (F3.6)", () => {
  it("constrói repositório e barramento próprios, não os singletons de módulo", () => {
    const a = new ExtensionContainer(context, undefined);
    const b = new ExtensionContainer(context, undefined);
    expect(a.stateRepository).toBeInstanceOf(YamlStateRepository);
    expect(a.stateRepository).not.toBe(stateRepository);
    expect(a.eventBus).not.toBe(stateServiceEventBus);
    expect(a.stateRepository).not.toBe(b.stateRepository);
    expect(a.eventBus).not.toBe(b.eventBus);
  });

  it("as portas de extensão nascem com a implementação Null da edição aberta", () => {
    const c = new ExtensionContainer(context, undefined);
    expect(c.telemetry).toBeInstanceOf(NullTelemetrySink);
    expect(c.templateSource).toBeInstanceOf(NullTemplateSource);
    expect(c.remoteSync).toBeInstanceOf(NullRemoteSyncProvider);
  });

  it("aceita substituições (o ponto onde a F2.5 liga um provedor consentido)", () => {
    const bus = new EventBus();
    const telemetry = { push: (): void => undefined };
    const c = new ExtensionContainer(context, undefined, { eventBus: bus, telemetry });
    expect(c.eventBus).toBe(bus);
    expect(c.telemetry).toBe(telemetry);
  });

  it("dispose() sem serviços de pé não lança e pode ser chamado de novo", () => {
    const c = new ExtensionContainer(context, undefined);
    expect(() => {
      c.dispose();
      c.dispose();
    }).not.toThrow();
  });
});
