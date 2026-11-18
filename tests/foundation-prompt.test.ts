import { describe, it, expect } from "vitest";
import { foundationPrompt, helyxCommandContent, agentsDirFor, agentPathFor, deliveryAgentPathFor } from "../src/data/foundation-prompt";

describe("agentsDirFor — o path do agente depende do host", () => {
  it("Claude lê agentes de .claude/agents", () => {
    expect(agentsDirFor("claude")).toBe(".claude/agents");
  });
  it("Copilot lê agentes de .github/agents", () => {
    expect(agentsDirFor("copilot")).toBe(".github/agents");
  });
  it("OpenCode lê agentes de .opencode/agents", () => {
    expect(agentsDirFor("opencode")).toBe(".opencode/agents");
  });
});

describe("REGRESSÃO: prompt não pode ter path de agente hardcoded", () => {
  it("o prompt do Claude aponta para .claude/agents, não .github/agents", () => {
    const p = foundationPrompt("claude");
    expect(p).toContain(".claude/agents/discovery/assessor.agent.md");
    expect(p).not.toContain(".github/agents/discovery");
  });

  it("o prompt do Copilot aponta para .github/agents", () => {
    const p = foundationPrompt("copilot");
    expect(p).toContain(".github/agents/discovery/assessor.agent.md");
    expect(p).not.toContain(".claude/agents/discovery");
  });

  it("o prompt do OpenCode aponta para o agente plano em .opencode/agents", () => {
    const p = foundationPrompt("opencode");
    expect(p).toContain(".opencode/agents/assessor.md");
    expect(p).not.toContain(".opencode/agents/discovery/assessor");
    expect(p).not.toContain(".github/agents/discovery");
  });

  it("artefatos ficam em .github/artifacts nos três hosts (host-neutral)", () => {
    for (const host of ["claude", "copilot", "opencode"] as const) {
      const p = foundationPrompt(host);
      expect(p).toContain(".github/artifacts/repos.yaml");
      expect(p).toContain(".github/artifacts/assessment/foundation-state.yaml");
    }
  });
});

describe("Passo 0 — coleta do inventário antes de qualquer análise", () => {
  const p = foundationPrompt("claude");

  it("manda ler o repos.yaml primeiro", () => {
    expect(p).toContain("Passo 0");
    expect(p).toContain(".github/artifacts/repos.yaml");
  });

  it("coleta os repos via AskUserQuestion (HITL), não adivinha", () => {
    expect(p).toContain("AskUserQuestion");
  });

  it("coleta os campos que o schema exige", () => {
    for (const field of ["url", "path", "ref", "scan_profile", "pinned_sha"]) {
      expect(p, `campo '${field}' ausente no prompt`).toContain(field);
    }
  });

  it("exige pinned_sha ao materializar (senão os findings apodrecem)", () => {
    expect(p).toMatch(/pinned_sha/);
  });

  it("manda derivar id em kebab-case (vira pasta e chave de artefato)", () => {
    expect(p).toContain("kebab-case");
    expect(p).toContain("repos/<id>/");
  });

  it("local-path não é clonado nem movido", () => {
    expect(p).toMatch(/não\s+toca nos que são .?local-path/i);
  });

  it("delega o clone à extensão — LLM não erra flags nem esquece o pinned_sha", () => {
    expect(p).toMatch(/Sincronizar\s+Repositórios/);
    expect(p).toMatch(/não clone à mão/i);
    expect(p).toContain("--filter=blob:none");
    expect(p).toMatch(/não preencha\s+.?pinned_sha/i);
  });
});

describe("P1 — one repo é multi repo com N=1", () => {
  it("o prompt proíbe tratar um repo como caso especial", () => {
    const p = foundationPrompt("claude");
    expect(p).toMatch(/N=1/);
    expect(p).toMatch(/nunca trate o caso de um repo como especial/i);
  });
});

describe("guard rails do Discovery", () => {
  const p = foundationPrompt("claude");

  it("Discovery é read-only — não modifica o código do cliente", () => {
    expect(p).toMatch(/nunca modifique/i);
    expect(p).toMatch(/read-only/i);
  });

  it("ensina o ciclo agent-done → done (o gate HITL)", () => {
    expect(p).toContain("agent-done");
    expect(p).toMatch(/somente.*após o humano confirmar/i);
  });

  it("declara o escopo das fases (repo vs workspace)", () => {
    expect(p).toContain("scope: repo");
    expect(p).toContain("scope: workspace");
  });

  it("gate D1 é por repositório — um repo grande não trava os outros", () => {
    expect(p).toMatch(/gate D1/i);
    expect(p).toMatch(/nunca trava os outros/i);
  });
});

describe("helyxCommandContent — slash command gravado no workspace", () => {
  it("tem frontmatter com description", () => {
    const c = helyxCommandContent("claude");
    expect(c.startsWith("---\n")).toBe(true);
    expect(c).toContain('description: "Iniciar ou retomar o Foundation stream (brownfield discovery)"');
  });

  it("embute o prompt do host correspondente", () => {
    expect(helyxCommandContent("claude")).toContain(".claude/agents/discovery");
    expect(helyxCommandContent("copilot")).toContain(".github/agents/discovery");
    expect(helyxCommandContent("opencode")).toContain(".opencode/agents/assessor.md");
  });

  it("no OpenCode, o comando seleciona o agente orquestrador", () => {
    expect(helyxCommandContent("opencode")).toContain("agent: jatai");
  });
});

describe("paths de agente por harness", () => {
  it("OpenCode achata o stream e usa .md", () => {
    expect(agentPathFor("opencode", "discovery/assessor.agent.md")).toBe(".opencode/agents/assessor.md");
    expect(deliveryAgentPathFor("opencode", "backend")).toBe(".opencode/agents/backend-python-api.md");
    expect(deliveryAgentPathFor("opencode", "reviewer")).toBe(".opencode/agents/reviewer.md");
  });

  it("Claude/Copilot mantêm o caminho do kit", () => {
    expect(deliveryAgentPathFor("claude", "backend")).toBe(".claude/agents/downstream/backend-python-api.agent.md");
    expect(deliveryAgentPathFor("copilot", "backend")).toBe(".github/agents/downstream/backend-python-api.agent.md");
  });
});
