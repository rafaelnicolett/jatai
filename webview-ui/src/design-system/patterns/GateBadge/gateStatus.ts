/** Estado de um gate no DS v2 (§4.2 GateBridge, §4.6 GateTimeline, §4.11 GateBadge). */
export type GateStatus = "approved" | "waiting" | "future" | "blocked";

/** Como o estado é lido (texto, nunca só cor): "D1, aprovado". */
export const GATE_STATUS_TEXT: Record<GateStatus, string> = {
  approved: "aprovado",
  waiting: "espera você",
  future: "depois",
  blocked: "bloqueado",
};
