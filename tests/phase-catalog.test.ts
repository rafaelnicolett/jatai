import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  DELIVERY_PHASES,
  deliveryPhaseIds,
  deliveryPhase,
  canonicalDeliveryPhaseId,
  deliveryPhaseKeysOf,
  deliveryPhaseKeyAliases,
  deliveryPhaseKeyVariants,
  deliveryAgentPath,
  deliveryGateAfter,
  nextDeliveryPhaseId,
  chatPhaseMeta,
} from "../src/data/phase-catalog.pure";
import { PHASE_CONTRACTS, PHASE_ORDER } from "../src/data/phase-contracts";

const KIT_AGENTS = path.join(__dirname, "..", "dist", "kit", "templates", "agents");

describe("catálogo único de fases (phase-catalog.pure) — consultas canônicas", () => {
  it("as 16 fases seguem a ordem de PHASE_ORDER e cada uma tem contrato", () => {
    expect(DELIVERY_PHASES).toHaveLength(16);
    expect(deliveryPhaseIds()).toEqual(PHASE_ORDER);
    for (const id of deliveryPhaseIds()) expect(PHASE_CONTRACTS[id], id).toBeDefined();
  });

  it("o cabeçalho de cada contrato (label, agent, icon, stream) é o do catálogo", () => {
    for (const p of DELIVERY_PHASES) {
      const c = PHASE_CONTRACTS[p.id]!;
      expect({ phaseId: c.phaseId, label: c.label, agent: c.agent, icon: c.icon, stream: c.stream }, p.id).toEqual({
        phaseId: p.id,
        label: p.label,
        agent: p.agent,
        icon: p.icon,
        stream: p.stream,
      });
    }
  });

  it("ids e aliases não colidem, e todo alias resolve para o id da sua fase", () => {
    const all = DELIVERY_PHASES.flatMap((p) => [p.id, ...p.aliases]);
    expect(new Set(all).size).toBe(all.length);
    for (const p of DELIVERY_PHASES) {
      expect(canonicalDeliveryPhaseId(p.id)).toBe(p.id);
      for (const a of p.aliases) expect(canonicalDeliveryPhaseId(a)).toBe(p.id);
    }
    expect(canonicalDeliveryPhaseId("fase-inexistente")).toBe("fase-inexistente");
    expect(deliveryPhase("sprint-planner")).toBeUndefined(); // deliveryPhase não resolve alias
  });

  it("mapas de alias para readers e writers saem da mesma fonte", () => {
    expect(deliveryPhaseKeyAliases()).toEqual({
      "ux-designer": "ux-design",
      "domain-modeler": "domain",
      "sprint-planner": "sprint-plan",
      "sprint-runner": "sprint-run",
      review: "reviewer",
    });
    expect(deliveryPhaseKeyVariants()).toEqual({
      "ux-design": ["ux-design", "ux-designer"],
      domain: ["domain", "domain-modeler"],
      "sprint-plan": ["sprint-plan", "sprint-planner"],
      "sprint-run": ["sprint-run", "sprint-runner"],
      reviewer: ["reviewer", "review"],
    });
    expect(deliveryPhaseKeysOf("sprint-planner")).toEqual(["sprint-plan", "sprint-planner"]);
    expect(deliveryPhaseKeysOf("sprint-plan")).toEqual(["sprint-plan", "sprint-planner"]);
    expect(deliveryPhaseKeysOf("business")).toEqual(["business"]);
    expect(deliveryPhaseKeysOf("fase-inexistente")).toEqual(["fase-inexistente"]);
  });

  it("o arquivo do agente de cada fase mora na pasta do seu stream e existe no kit (templates/agents)", () => {
    for (const p of DELIVERY_PHASES) {
      expect(p.agentFile.startsWith(`${p.stream}/`), p.id).toBe(true);
      expect(deliveryAgentPath(p.id)).toBe(`.github/agents/${p.agentFile}`);
      expect(fs.existsSync(path.join(KIT_AGENTS, p.agentFile)), p.agentFile).toBe(true);
    }
    expect(deliveryAgentPath("fase-inexistente")).toBeUndefined();
  });

  it("gates: G1 fecha o upstream depois de sprint-plan, G2 fecha o downstream depois de reviewer", () => {
    expect(DELIVERY_PHASES.filter((p) => p.gateAfter).map((p) => [p.id, p.gateAfter])).toEqual([
      ["sprint-plan", "G1"],
      ["reviewer", "G2"],
    ]);
    for (const p of DELIVERY_PHASES.filter((x) => x.gateAfter)) {
      const next = DELIVERY_PHASES[DELIVERY_PHASES.indexOf(p) + 1];
      expect(next?.stream, p.id).not.toBe(p.stream); // o gate fica na fronteira do stream
    }
    expect(deliveryGateAfter("business")).toBeUndefined();
  });
});

describe("pipeline canônico (L4 / A4 corrigido na F3.1)", () => {
  it("a próxima fase segue a ordem do catálogo: frontend → reviewer → devops, incident → sustain, sustain encerra", () => {
    const ids = deliveryPhaseIds();
    ids.forEach((id, i) => expect(nextDeliveryPhaseId(id), id).toBe(ids[i + 1] ?? null));
    expect(nextDeliveryPhaseId("frontend")).toBe("reviewer");
    expect(nextDeliveryPhaseId("reviewer")).toBe("devops");
    expect(nextDeliveryPhaseId("incident")).toBe("sustain");
    expect(nextDeliveryPhaseId("sustain")).toBeNull();
    expect(nextDeliveryPhaseId("fase-inexistente")).toBeNull();
  });

  it("`review`, a chave que o pipeline legado gravava, é alias de reviewer em todo lugar", () => {
    expect(canonicalDeliveryPhaseId("review")).toBe("reviewer");
    expect(nextDeliveryPhaseId("review")).toBe("devops");
    expect(deliveryAgentPath("review")).toBe(".github/agents/downstream/reviewer.agent.md");
    expect(deliveryAgentPath("sustain")).toBe(".github/agents/operation/sustain.agent.md");
    expect(chatPhaseMeta("review")?.next).toBe("devops");
  });
});

describe("visão do chat (L4 / A4 de apresentação corrigido na F3.1)", () => {
  it("o chat mostra exatamente o rótulo, ícone, agente, stream e artefatos do catálogo, sem projeção própria", () => {
    for (const p of DELIVERY_PHASES) {
      expect(chatPhaseMeta(p.id), p.id).toEqual({
        label: p.label,
        icon: p.icon,
        stream: p.stream,
        agent: p.agent,
        artifactsExpected: [...p.artifactsExpected],
        next: nextDeliveryPhaseId(p.id),
      });
    }
    expect(chatPhaseMeta("sprint-planner")).toEqual(chatPhaseMeta("sprint-plan"));
    expect(chatPhaseMeta("fase-inexistente")).toBeUndefined();
  });
});
