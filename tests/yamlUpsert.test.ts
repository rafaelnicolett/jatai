import { describe, it, expect } from "vitest";
import {
  upsertPhaseStatusInYaml,
  upsertPhaseCompletedAtInYaml,
  upsertPhaseArtifactsInYaml,
  upsertChecklistItemInYaml,
  upsertPhaseInYaml,
  upsertGateD1InYaml,
  findPhaseHeaderIdx,
  PHASE_KEY_VARIANTS,
} from "../src/views/actions/yamlUpsert";

/**
 * Antes desta extração, esta lógica de edição cirúrgica de YAML vivia como
 * métodos privados de `CockpitController.ts` e não tinha NENHUM teste
 * dedicado — cobrindo agora que ela é um módulo puro compartilhado.
 */

describe("PHASE_KEY_VARIANTS — mapa reverso de aliases de agente", () => {
  it("cada id canônico lista a si mesmo primeiro, depois os aliases de agente", () => {
    expect(PHASE_KEY_VARIANTS["sprint-plan"]).toEqual(["sprint-plan", "sprint-planner"]);
    expect(PHASE_KEY_VARIANTS["domain"]).toEqual(["domain", "domain-modeler"]);
  });
});

describe("findPhaseHeaderIdx", () => {
  const lines = `phases:
  ux-designer:
    status: done
`.split("\n");

  it("acha o bloco mesmo gravado sob a chave do agente (alias), não a canônica", () => {
    const idx = findPhaseHeaderIdx(lines, 0, "ux-design");
    expect(lines[idx]).toBe("  ux-designer:");
  });

  it("devolve -1 quando a fase não existe sob nenhuma chave conhecida", () => {
    expect(findPhaseHeaderIdx(lines, 0, "backend")).toBe(-1);
  });

  // Achado da F6.2 (frente C): o id da fase entrava cru em `new RegExp`. O CLI
  // valida `--phase`, mas um id vindo de YAML escrito à mão (current_phase,
  // CodeLens, aprovação no chat) não passa por lá.
  it("REGRESSÃO: id com metacaractere de regex acha só o bloco dele ('.' não é curinga)", () => {
    const custom = ["phases:", "  fasexum:", "    status: done", "  fase.um:", "    status: pending", ""];
    expect(findPhaseHeaderIdx(custom, 0, "fase.um")).toBe(3);
    const out = upsertPhaseStatusInYaml(custom.join("\n"), "fase.um", "done");
    expect(out).toBe(["phases:", "  fasexum:", "    status: done", "  fase.um:", "    status: done", ""].join("\n"));
  });

  it("REGRESSÃO: id que não é regex válida ('(', '[') não lança — acha o bloco ou devolve -1", () => {
    const custom = ["phases:", "  fase(1:", "    status: pending", ""];
    expect(findPhaseHeaderIdx(custom, 0, "fase(1")).toBe(1);
    expect(findPhaseHeaderIdx(custom, 0, "fase[1")).toBe(-1);
  });

  it("cabeçalho com espaço ou \\r no fim continua sendo achado (mesma tolerância da regex antiga)", () => {
    expect(findPhaseHeaderIdx(["phases:", "  business:  ", "    status: done"], 0, "business")).toBe(1);
    expect(findPhaseHeaderIdx(["phases:\r", "  business:\r", "    status: done\r"], 0, "business")).toBe(1);
    expect(findPhaseHeaderIdx(["phases:", "   business:", "    status: done"], 0, "business")).toBe(-1);
  });
});

describe("upsertPhaseStatusInYaml", () => {
  it("cria o bloco phases: do zero quando não existe", () => {
    const out = upsertPhaseStatusInYaml("", "backend", "in-progress", "@backend");
    expect(out).toContain("phases:");
    expect(out).toContain("  backend:");
    expect(out).toContain("    status: in-progress");
    expect(out).toContain('    agent: "@backend"');
  });

  it("insere uma fase nova dentro de um bloco phases: já existente", () => {
    const raw = "phases:\n  business:\n    status: done\n";
    const out = upsertPhaseStatusInYaml(raw, "product", "in-progress");
    expect(out).toContain("  business:");
    expect(out).toContain("  product:");
    expect(out).toContain("    status: in-progress");
  });

  it("atualiza o status de uma fase já existente in-place", () => {
    const raw = "phases:\n  backend:\n    status: pending\n";
    const out = upsertPhaseStatusInYaml(raw, "backend", "done");
    expect(out).toBe("phases:\n  backend:\n    status: done\n");
  });
});

describe("upsertChecklistItemInYaml", () => {
  // Achado da F3.1 (frente D): a busca do item partia do cabeçalho da seção
  // sem parar no fim dela. Se a fase não tinha o item e uma fase SEGUINTE
  // tinha um com o mesmo id, o writer marcava o item da fase errada.
  it("REGRESSÃO: item ausente na seção da fase é criado nela, nunca marcado no item de mesmo id de outra fase", () => {
    const raw = [
      "phases:",
      "  business:",
      "    status: in-progress",
      "    human_checklist:",
      "      problem-section: true",
      "  product:",
      "    status: pending",
      "    human_checklist:",
      "      human-ok: false",
      "",
    ].join("\n");
    expect(upsertChecklistItemInYaml(raw, "business", "human-ok", true, "human_checklist")).toBe(
      [
        "phases:",
        "  business:",
        "    status: in-progress",
        "    human_checklist:",
        "      problem-section: true",
        "      human-ok: true",
        "  product:",
        "    status: pending",
        "    human_checklist:",
        "      human-ok: false",
        "",
      ].join("\n")
    );
  });

  it("item depois de uma linha em branco dentro da seção continua sendo achado (sem chave duplicada)", () => {
    const raw = "phases:\n  business:\n    human_checklist:\n      a: true\n\n      b: false\n  product:\n    status: pending\n";
    expect(upsertChecklistItemInYaml(raw, "business", "b", true, "human_checklist")).toBe(
      "phases:\n  business:\n    human_checklist:\n      a: true\n\n      b: true\n  product:\n    status: pending\n"
    );
  });

  it("REGRESSÃO: item ausente numa seção seguida de outra seção da mesma fase não é marcado na outra seção", () => {
    const raw = "phases:\n  business:\n    checklist:\n      a: true\n    human_checklist:\n      b: false\n";
    expect(upsertChecklistItemInYaml(raw, "business", "b", true, "checklist")).toBe(
      "phases:\n  business:\n    checklist:\n      a: true\n      b: true\n    human_checklist:\n      b: false\n"
    );
  });

  it("cria phases/fase/checklist do zero quando o conteúdo está vazio", () => {
    const out = upsertChecklistItemInYaml("", "business", "goals-defined", true);
    expect(out).toContain("phases:");
    expect(out).toContain("  business:");
    expect(out).toContain("    checklist:");
    expect(out).toContain("      goals-defined: true");
  });

  it("usa a chave alias-aware — não cria bloco-sombra quando o agente já escreveu sob seu próprio id", () => {
    const raw = "phases:\n  ux-designer:\n    status: done\n    human_checklist:\n      reviewed: true\n";
    const out = upsertChecklistItemInYaml(raw, "ux-design", "approved", true, "human_checklist");
    // Não deve duplicar o bloco — só um "ux-designer:" ou "ux-design:" no arquivo
    const blockCount = (out.match(/^  (ux-designer|ux-design):/gm) ?? []).length;
    expect(blockCount).toBe(1);
    expect(out).toContain("      approved: true");
    expect(out).toContain("      reviewed: true"); // item existente preservado
  });

  it("atualiza um item já existente in-place em vez de duplicar", () => {
    const raw = "phases:\n  backend:\n    checklist:\n      tests-pass: false\n";
    const out = upsertChecklistItemInYaml(raw, "backend", "tests-pass", true);
    expect(out.match(/tests-pass:/g)).toHaveLength(1);
    expect(out).toContain("tests-pass: true");
  });
});

describe("upsertPhaseInYaml", () => {
  it("marca uma fase nova como done com completed_at", () => {
    const out = upsertPhaseInYaml("phases:\n", "backend", "2026-07-19T10:00:00Z");
    expect(out).toContain("  backend:");
    expect(out).toContain("    status: done");
    expect(out).toContain('    completed_at: "2026-07-19T10:00:00Z"');
  });

  it("preserva a chave original escrita pelo agente (não renomeia o bloco)", () => {
    const raw = "phases:\n  sprint-planner:\n    status: in-progress\n";
    const out = upsertPhaseInYaml(raw, "sprint-plan", "2026-07-19T10:00:00Z");
    expect(out).toContain("  sprint-planner:"); // chave do agente preservada
    expect(out).not.toContain("  sprint-plan:"); // não cria uma chave canônica paralela
    expect(out).toContain("    status: done");
  });

  it("REGRESSÃO (A1 / H-BUG-05): troca só as linhas de status e completed_at, sem apagar o resto do bloco nem tocar nas outras fases", () => {
    const raw = [
      "phases:",
      "  business:",
      "    status: in-progress",
      '    agent: "@business"',
      "    # nota do agente",
      '    completed_at: "2026-07-01T00:00:00Z"',
      "    artifacts:",
      '      - path: "brief.md"',
      "    human_checklist:",
      "      problem-section: true",
      "  product:",
      "    status: pending",
      "",
    ].join("\n");
    expect(upsertPhaseInYaml(raw, "business", "2026-07-19T10:00:00Z")).toBe(
      raw.replace("    status: in-progress", "    status: done").replace('"2026-07-01T00:00:00Z"', '"2026-07-19T10:00:00Z"')
    );
    // sem status nem completed_at: entram logo depois do cabeçalho, nessa ordem
    expect(upsertPhaseInYaml('phases:\n  business:\n    agent: "@business"\n', "business", "2026-07-19T10:00:00Z")).toBe(
      'phases:\n  business:\n    status: done\n    completed_at: "2026-07-19T10:00:00Z"\n    agent: "@business"\n'
    );
  });

  it("sem bloco phases:, cria do zero", () => {
    const out = upsertPhaseInYaml("", "business", "2026-07-19T10:00:00Z");
    expect(out).toContain("phases:");
    expect(out).toContain("  business:");
    expect(out).toContain("    status: done");
  });
});

describe("upsertPhaseCompletedAtInYaml", () => {
  it("seta completed_at sem tocar em status — diferente de upsertPhaseInYaml", () => {
    const raw = "phases:\n  business:\n    status: in-progress\n";
    const out = upsertPhaseCompletedAtInYaml(raw, "business", "2026-07-19T10:00:00Z");
    expect(out).toContain("    status: in-progress"); // não foi forçado pra done
    expect(out).toContain('    completed_at: "2026-07-19T10:00:00Z"');
  });

  it("é alias-aware — atualiza sob a chave que o agente já escreveu", () => {
    const raw = "phases:\n  domain-modeler:\n    status: done\n";
    const out = upsertPhaseCompletedAtInYaml(raw, "domain", "2026-07-19T10:00:00Z");
    expect(out).toContain("  domain-modeler:");
    expect(out).not.toContain("  domain:");
  });
});

describe("upsertPhaseArtifactsInYaml", () => {
  it("cria a lista de artifacts do zero", () => {
    const raw = "phases:\n  business:\n    status: done\n";
    const out = upsertPhaseArtifactsInYaml(raw, "business", [".github/artifacts/business-brief.md"]);
    expect(out).toContain("    artifacts:");
    expect(out).toContain('      - path: ".github/artifacts/business-brief.md"');
  });

  it("substitui a lista inteira em vez de acumular (é assim que o agente reporta — o snapshot completo)", () => {
    const raw = "phases:\n  domain:\n    status: done\n    artifacts:\n      - path: \"docs/domain/old.md\"\n";
    const out = upsertPhaseArtifactsInYaml(raw, "domain", ["docs/domain/bounded-contexts.md", "docs/domain/event-storming.md"]);
    expect(out).not.toContain("old.md");
    expect(out).toContain('- path: "docs/domain/bounded-contexts.md"');
    expect(out).toContain('- path: "docs/domain/event-storming.md"');
    expect((out.match(/artifacts:/g) ?? []).length).toBe(1); // não duplica o header
  });
});

describe("upsertGateD1InYaml", () => {
  it("cria repos/<repoId>/gate_d1 do zero, na indentação real (2/4/6 espaços)", () => {
    const out = upsertGateD1InYaml("", "billing-api", "approved", "2026-08-05T10:00:00Z");
    expect(out).toContain("repos:");
    expect(out).toContain("  billing-api:");
    expect(out).toContain("    gate_d1:");
    expect(out).toContain("      status: approved");
    expect(out).toContain('      approved_at: "2026-08-05T10:00:00Z"');
  });

  it("atualiza gate_d1 já existente in-place, sem duplicar o header nem mexer nas fases do repo", () => {
    const raw = [
      "repos:",
      "  billing-api:",
      "    phases:",
      "      tech-stack:",
      "        status: done",
      "    gate_d1:",
      "      status: pending",
      "  claims-svc:",
      "    phases:",
      "      tech-stack:",
      "        status: pending",
      "    gate_d1:",
      "      status: pending",
      "",
    ].join("\n");
    const out = upsertGateD1InYaml(raw, "billing-api", "approved", "2026-08-05T10:00:00Z");
    expect((out.match(/gate_d1:/g) ?? []).length).toBe(2); // um por repo, nenhum duplicado
    expect(out).toContain("      status: approved"); // billing-api aprovado
    // claims-svc continua intocado
    const claimsBlock = out.slice(out.indexOf("claims-svc:"));
    expect(claimsBlock).toContain("status: pending");
    // fases do billing-api sobrevivem
    expect(out).toContain("tech-stack:");
    expect(out).toContain("status: done");
  });

  it("cria o bloco do repo se `repos:` existe mas o repo ainda não tem entrada", () => {
    const raw = "repos:\n  claims-svc:\n    gate_d1:\n      status: pending\n";
    const out = upsertGateD1InYaml(raw, "billing-api", "pending");
    expect(out).toContain("  billing-api:");
    expect(out).toContain("  claims-svc:"); // preservado
  });

  // Mesma classe do achado da F6.2 (frente C), achada na varredura: o id do
  // repo (do repos.yaml, escrito pelo agente ou à mão) entrava cru em `new RegExp`.
  it("REGRESSÃO: id de repo com '.' aprova só o próprio repo, não um vizinho que casaria com o curinga", () => {
    const raw = "repos:\n  appxweb:\n    gate_d1:\n      status: pending\n  app.web:\n    gate_d1:\n      status: pending\n";
    expect(upsertGateD1InYaml(raw, "app.web", "approved", "2026-08-05T10:00:00Z")).toBe(
      "repos:\n  appxweb:\n    gate_d1:\n      status: pending\n  app.web:\n    gate_d1:\n      status: approved\n      approved_at: \"2026-08-05T10:00:00Z\"\n"
    );
  });

  it("REGRESSÃO: id de repo com '(' ou '[' acha o próprio bloco — sem bloco duplicado e sem SyntaxError", () => {
    for (const id of ["legado(v1)", "legado(v1", "legado[v1"]) {
      const raw = `repos:\n  ${id}:\n    gate_d1:\n      status: pending\n`;
      expect(upsertGateD1InYaml(raw, id, "approved"), id).toBe(`repos:\n  ${id}:\n    gate_d1:\n      status: approved\n`);
    }
  });
});

// BUG-27: os writers assumiam 2 espaços por nível. Num arquivo indentado com 4
// (YAML válido, comum em edição à mão), a fase não era achada e o bloco novo
// saía com 2, quebrando o arquivo; desde a guarda do A9 a escrita era recusada.
describe("BUG-27 — arquivo indentado com 4 espaços", () => {
  const DS4 = [
    "initiative_id: loja-demo",
    "phases:",
    "    # fases do upstream",
    "    business:",
    "        status: in-progress",
    '        agent: "@business"',
    "        human_checklist:",
    "            problem-section: true",
    "        artifacts:",
    '            - path: "docs/brief.md"',
    "    product:",
    "        status: pending",
    "",
  ].join("\n");

  it("REGRESSÃO: upsertPhaseStatusInYaml edita a fase existente na indentação do arquivo", () => {
    expect(upsertPhaseStatusInYaml(DS4, "business", "done")).toBe(DS4.replace("        status: in-progress", "        status: done"));
  });

  it("REGRESSÃO: fase nova nasce com 4 espaços, no fim do bloco phases:", () => {
    expect(upsertPhaseStatusInYaml(DS4, "qa", "in-progress", "@qa")).toBe(
      DS4.replace("        status: pending\n", '        status: pending\n    qa:\n        status: in-progress\n        agent: "@qa"\n')
    );
  });

  it("REGRESSÃO: checklist, completed_at, artifacts e o done de upsertPhaseInYaml saem com 4 espaços", () => {
    expect(upsertChecklistItemInYaml(DS4, "business", "persona", true, "human_checklist")).toBe(
      DS4.replace("            problem-section: true\n", "            problem-section: true\n            persona: true\n")
    );
    expect(upsertPhaseCompletedAtInYaml(DS4, "product", "2026-11-15")).toBe(
      DS4.replace("    product:\n", '    product:\n        completed_at: "2026-11-15"\n')
    );
    expect(upsertPhaseArtifactsInYaml(DS4, "business", ["docs/brief.md", "docs/kpis.md"])).toBe(
      DS4.replace('            - path: "docs/brief.md"\n', '            - path: "docs/brief.md"\n            - path: "docs/kpis.md"\n')
    );
    expect(upsertPhaseInYaml(DS4, "business", "2026-11-15T10:00:00Z")).toBe(
      DS4.replace("        status: in-progress\n", '        status: done\n        completed_at: "2026-11-15T10:00:00Z"\n')
    );
  });

  it("REGRESSÃO: aprovar o D1 num foundation-state com 4 espaços grava na indentação do arquivo", () => {
    const fs4 = "version: 2\nrepos:\n    app-a:\n        phases:\n            tech-stack:\n                status: done\n        gate_d1:\n            status: pending\nphases:\n    domain:\n        status: pending\n";
    expect(upsertGateD1InYaml(fs4, "app-a", "approved", "2026-11-15T10:00:00Z")).toBe(
      fs4.replace("        gate_d1:\n            status: pending\n", '        gate_d1:\n            status: approved\n            approved_at: "2026-11-15T10:00:00Z"\n')
    );
  });

  it("arquivo com 2 espaços sai byte a byte como antes (a conversão só entra com outra unidade)", () => {
    const ds2 = "phases:\n  # c\n  business:\n    status: in-progress\n";
    expect(upsertPhaseStatusInYaml(ds2, "business", "done")).toBe("phases:\n  # c\n  business:\n    status: done\n");
  });

  it("indentação que não converte sem perder bytes (bloco literal com 10 numa unidade de 4) não é convertida: o comportamento antigo segue, e a guarda do A9 recusa a escrita", () => {
    const odd = "phases:\n    business:\n        status: in-progress\n        note: |\n          texto com 10 espaços\n";
    expect(upsertPhaseStatusInYaml(odd, "business", "done")).toContain("\n  business:\n    status: done");
  });
});
