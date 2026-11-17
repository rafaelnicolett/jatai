import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseSprintBacklog, sprintStatusCounts, sprintPointsSummary } from "../src/data/sprint-backlog-contract";

// Fixtures sintéticas (F2.3) que reproduzem a forma de arquivos reais: uma por
// forma de sprint-backlog.yaml que o parser tolera (ver o cabeçalho de
// sprint-backlog-contract.pure.ts). O conteúdo é fictício; só a forma importa.
const FIXTURES = path.resolve(__dirname, "fixtures");

describe("parseSprintBacklog — Forma A (canônica: meta + sprints[].items[])", () => {
  it("lê meta e os itens de cada sprint", () => {
    const backlog = parseSprintBacklog(`
meta:
  product: Helyx Platform
  total_sprints: 3
  sprint_duration_weeks: 2
sprints:
  - id: S1
    name: "Foundation"
    goal: "Entregar o core"
    priority: P0
    items:
      - id: S1-BKD-01
        title: "Setup do projeto"
        status: done
        component: backend
        story_points: 3
      - id: S1-FE-01
        title: "Tela inicial"
        status: backlog
        component: frontend
`);
    expect(backlog?.meta?.product).toBe("Helyx Platform");
    expect(backlog?.sprints).toHaveLength(1);
    expect(backlog?.sprints[0]?.items).toHaveLength(2);
    expect(backlog?.items).toHaveLength(2);
    expect(backlog?.items[0]?.status).toBe("done");
    expect(backlog?.items[0]?.storyPoints).toBe(3);
  });

  it("epicRef (ADR-0006) lido de 'epic_ref' explícito quando presente", () => {
    const backlog = parseSprintBacklog(`
sprints:
  - id: S1
    name: S1
    items:
      - id: X-01
        title: "a"
        status: done
        epic_ref: epic-1
`);
    expect(backlog?.items[0]?.epicRef).toBe("epic-1");
  });

  it("sem epic_ref nem milestone, epicRef fica undefined (nunca fabricado)", () => {
    const backlog = parseSprintBacklog(`
sprints:
  - id: S1
    name: S1
    items:
      - id: X-01
        title: "a"
        status: done
`);
    expect(backlog?.items[0]?.epicRef).toBeUndefined();
  });

  it("regressão: um sprint-backlog.yaml na Forma A com erro de sintaxe YAML de verdade (dod: com backtick+dois-pontos que confunde a indentação de bloco) nunca lança — o parser devolve null em vez de derrubar a extensão", () => {
    const raw = fs.readFileSync(path.join(FIXTURES, "sprint-backlog-forma-a-yaml-invalido.yaml"), "utf-8");
    expect(() => parseSprintBacklog(raw)).not.toThrow();
    expect(parseSprintBacklog(raw)).toBeNull();
  });
});

describe("parseSprintBacklog — Forma B (items: + milestones:, sem sprints:)", () => {
  it("agrupa itens por milestone, usando name/goal do milestone", () => {
    const backlog = parseSprintBacklog(`
milestones:
  M1:
    name: Foundation
    goal: "Base do sistema"
items:
  - id: PLT-001
    title: "Multi-tenant isolation"
    milestone: M1
    component: BKD
    sizing: M
    feature_ref: F-01
  - id: PLT-002
    title: "SSO"
    milestone: M1
`);
    expect(backlog?.sprints).toHaveLength(1);
    expect(backlog?.sprints[0]?.id).toBe("M1");
    expect(backlog?.sprints[0]?.name).toBe("Foundation");
    expect(backlog?.items).toHaveLength(2);
    expect(backlog?.items[0]?.component).toBe("BKD");
    expect(backlog?.items[0]?.size).toBe("M"); // sizing → size
    expect(backlog?.items[0]?.feature).toBe("F-01"); // feature_ref → feature
    expect(backlog?.items[0]?.status).toBe("backlog"); // ausente no arquivo real → default
    expect(backlog?.items[0]?.epicRef).toBe("M1"); // milestone → epicRef (ADR-0006)
  });

  it("regressão: um sprint-backlog.yaml na Forma B com a forma de um arquivo real nunca lança e recupera itens", () => {
    const raw = fs.readFileSync(path.join(FIXTURES, "sprint-backlog-forma-b-milestones.yaml"), "utf-8");
    expect(() => parseSprintBacklog(raw)).not.toThrow();
    const backlog = parseSprintBacklog(raw);
    expect(backlog).not.toBeNull();
    expect(backlog!.items.length).toBeGreaterThan(0);
  });

  it("epicRef (ADR-0006) lido de 'milestone' — o mesmo campo já usado pra agrupar, na forma de um arquivo real", () => {
    const raw = fs.readFileSync(path.join(FIXTURES, "sprint-backlog-forma-b-milestones.yaml"), "utf-8");
    const backlog = parseSprintBacklog(raw);
    const plt001 = backlog!.items.find((i) => i.id === "PLT-001");
    expect(plt001?.epicRef).toBe("M1");
  });
});

describe("parseSprintBacklog — Formas C/D (stories: soltas, com ou sem status)", () => {
  it("stories sem status nenhum — todas caem em 'backlog', estimate vira storyPoints", () => {
    const backlog = parseSprintBacklog(`
initiative: feat-x
sprint: 1
stories:
  - id: X-01
    title: "Fazer algo"
    estimate: 3
  - id: X-02
    title: "Fazer outra coisa"
    estimate: 5
`);
    expect(backlog?.sprints).toHaveLength(1);
    expect(backlog?.items).toHaveLength(2);
    expect(backlog?.items[0]?.status).toBe("backlog");
    expect(backlog?.items[0]?.storyPoints).toBe(3);
  });

  it("status improvisado fora do enum (ex.: 'covered_by_SLS') cai pro default 'backlog'", () => {
    const backlog = parseSprintBacklog(`
stories:
  - id: EX-01
    title: "Item"
    status: covered_by_SLS
`);
    expect(backlog?.items[0]?.status).toBe("backlog");
  });

  it("regressão: sprint-backlog.yaml na Forma C (stories sem status), com a forma de um arquivo real, nunca lança", () => {
    const raw = fs.readFileSync(
      path.join(FIXTURES, "sprint-backlog-forma-c-sem-status.yaml"),
      "utf-8"
    );
    expect(() => parseSprintBacklog(raw)).not.toThrow();
    expect(parseSprintBacklog(raw)?.items.length).toBeGreaterThan(0);
  });

  it("regressão: sprint-backlog.yaml na Forma D (status ad-hoc), com a forma de um arquivo real, nunca lança", () => {
    const raw = fs.readFileSync(
      path.join(FIXTURES, "sprint-backlog-forma-d-status-improvisado.yaml"),
      "utf-8"
    );
    expect(() => parseSprintBacklog(raw)).not.toThrow();
    expect(parseSprintBacklog(raw)?.items.length).toBeGreaterThan(0);
  });
});

describe("parseSprintBacklog — degradação", () => {
  it("YAML inválido nunca lança, devolve null", () => {
    expect(() => parseSprintBacklog(":\n  :\n    [[[")).not.toThrow();
    expect(parseSprintBacklog(":\n  :\n    [[[")).toBeNull();
  });

  it("nenhuma das formas conhecidas (sprints/items/stories) devolve null", () => {
    expect(parseSprintBacklog("meta:\n  product: X")).toBeNull();
  });
});

describe("sprintStatusCounts", () => {
  it("conta itens por status, backlog null devolve tudo zerado", () => {
    expect(sprintStatusCounts(null)).toEqual({ backlog: 0, "in-progress": 0, review: 0, done: 0, blocked: 0, descoped: 0 });
  });

  it("conta corretamente um backlog real", () => {
    const backlog = parseSprintBacklog(`
sprints:
  - id: S1
    name: S1
    items:
      - { id: "1", title: "a", status: done }
      - { id: "2", title: "b", status: done }
      - { id: "3", title: "c", status: blocked }
`);
    expect(sprintStatusCounts(backlog)).toEqual({ backlog: 0, "in-progress": 0, review: 0, done: 2, blocked: 1, descoped: 0 });
  });
});

describe("sprintPointsSummary", () => {
  it("só conta itens com storyPoints definido — nunca inventa um número", () => {
    const backlog = parseSprintBacklog(`
sprints:
  - id: S1
    name: S1
    items:
      - { id: "1", title: "a", status: done, story_points: 5 }
      - { id: "2", title: "b", status: in-progress, story_points: 3 }
      - { id: "3", title: "c", status: done }
`);
    expect(sprintPointsSummary(backlog)).toEqual({ done: 5, total: 8 });
  });

  it("backlog null devolve 0/0", () => {
    expect(sprintPointsSummary(null)).toEqual({ done: 0, total: 0 });
  });
});
