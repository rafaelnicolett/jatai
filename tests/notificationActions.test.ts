import { describe, it, expect, vi } from "vitest";
import { notificationsMarkSeenHandler, NOTIFICATIONS_LAST_SEEN_KEY } from "../src/views/actions/notificationActions";
import type { ActionContext } from "../src/views/actions/CommandHandler";
import { YamlStateRepository } from "../src/state/repository/StateRepository";

describe("notificationsMarkSeenHandler", () => {
  it("grava um timestamp ISO em globalState sob a chave certa e pede refresh", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      configLoader: {} as ActionContext["configLoader"],
      extensionContext: { globalState: { update } } as unknown as ActionContext["extensionContext"],
      promptMap: {},
  repository: new YamlStateRepository(),
      requestRefresh: vi.fn(),
      pushTelemetry: vi.fn(),
    } satisfies ActionContext;

    await notificationsMarkSeenHandler.handle({}, ctx);

    expect(update).toHaveBeenCalledTimes(1);
    const [key, value] = update.mock.calls[0]!;
    expect(key).toBe(NOTIFICATIONS_LAST_SEEN_KEY);
    expect(() => new Date(value as string).toISOString()).not.toThrow();
    expect(ctx.requestRefresh).toHaveBeenCalled();
  });
});
