import { describe, it, expect } from "vitest";
import { EventBus } from "../src/server/EventBus";

/**
 * Barramento de eventos in-process do State Service (roadmap `mod-state-service`,
 * item 2.3). Cobre: publish/subscribe básico, múltiplos assinantes, cancelamento
 * de assinatura, e a dedup que a Fonte 2 (`RunsWatcher`) usa para não duplicar
 * o que a Fonte 1 (`TelemetryBuffer`, in-process) já publicou.
 */

describe("EventBus — publish/subscribe", () => {
  it("um assinante recebe o evento publicado", () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    bus.subscribe((e) => received.push(e));

    bus.publish({ source: "telemetry", event: { run_id: "r1", event_type: "agent-started", timestamp: "t1" } });

    expect(received).toEqual([
      { source: "telemetry", event: { run_id: "r1", event_type: "agent-started", timestamp: "t1" } },
    ]);
  });

  it("múltiplos assinantes recebem o mesmo evento, cada um independente", () => {
    const bus = new EventBus();
    const a: unknown[] = [];
    const b: unknown[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));

    bus.publish({ source: "runs-watcher", event: { run_id: "r2", event_type: "agent-done", timestamp: "t2" } });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("a função de cancelamento retornada por subscribe() remove o listener — assinante não recebe mais nada depois", () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    const unsubscribe = bus.subscribe((e) => received.push(e));

    bus.publish({ source: "telemetry", event: { run_id: "r3", event_type: "agent-started", timestamp: "t3" } });
    unsubscribe();
    bus.publish({ source: "telemetry", event: { run_id: "r3", event_type: "agent-done", timestamp: "t4" } });

    expect(received).toHaveLength(1);
  });
});

describe("EventBus — dedup (wasRecentlyPublished)", () => {
  it("um evento nunca publicado não é considerado 'recentemente publicado'", () => {
    const bus = new EventBus();
    expect(bus.wasRecentlyPublished({ run_id: "r4", event_type: "agent-started", timestamp: "t5" })).toBe(false);
  });

  it("depois de publish(), o mesmo evento (mesma identidade run_id+event_type+timestamp+phase_id+agent_id) é reconhecido como já publicado", () => {
    const bus = new EventBus();
    const event = { run_id: "r5", event_type: "agent-done", timestamp: "t6", phase_id: "tech-stack", agent_id: "@tech-mapper" };
    bus.publish({ source: "telemetry", event });

    expect(bus.wasRecentlyPublished({ ...event })).toBe(true);
  });

  it("um evento com timestamp diferente não é confundido com um já publicado", () => {
    const bus = new EventBus();
    bus.publish({ source: "telemetry", event: { run_id: "r6", event_type: "agent-done", timestamp: "t7" } });

    expect(bus.wasRecentlyPublished({ run_id: "r6", event_type: "agent-done", timestamp: "t8" })).toBe(false);
  });

  it("dedup expira depois do TTL — mesmo evento volta a não ser reconhecido", async () => {
    const bus = new EventBus(10); // TTL de 10ms
    const event = { run_id: "r7", event_type: "agent-started", timestamp: "t9" };
    bus.publish({ source: "telemetry", event });
    expect(bus.wasRecentlyPublished({ ...event })).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(bus.wasRecentlyPublished({ ...event })).toBe(false);
  });
});
