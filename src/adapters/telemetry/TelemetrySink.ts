/**
 * TelemetrySink.ts
 *
 * Porta de saída para eventos de telemetria do fluxo de fases (início,
 * conclusão e aprovação). ADR-0015: a edição aberta é 100% local, então a
 * implementação ligada por padrão é a `NullTelemetrySink`, que descarta tudo.
 * Uma extensão companheira pode trazer a sua implementação sem fork; o código
 * aberto nunca envia nada sozinho.
 *
 * Os handlers só conhecem a capacidade abstrata (`ActionContext.pushTelemetry`),
 * nunca o adaptador concreto.
 */

export type TelemetryEventType =
  | "phase_started"
  | "phase_completed"
  | "phase_approved"
  | "run_created"
  | "c4_pushed";

export interface TelemetryEvent {
  event_type: TelemetryEventType;
  initiative_id: string;
  initiative_name: string;
  project_slug: string;
  phase_id: string;
}

export interface TelemetrySink {
  /** Fire-and-forget: nunca bloqueia nem lança. */
  push(event: TelemetryEvent): void;
}

/** Implementação padrão da edição aberta: descarta o evento, sem rede e sem disco. */
export class NullTelemetrySink implements TelemetrySink {
  push(_event: TelemetryEvent): void {
    // Intencionalmente vazio (ADR-0015).
  }
}
