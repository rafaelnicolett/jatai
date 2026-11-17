import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseFoundationState, phasesForRepo, gateD1ForRepo, phaseState } from "../src/data/foundation-state-contract";

/**
 * Caso real, reproduzido com dados sintéticos: num assessment multi-repo, o
 * @assessor completou 6 fases + Gate D1
 * do primeiro repo corretamente, mas escreveu um bloco com indentação errada
 * (um `artifacts:` aninhado sob `approved_at`, uma string). O js-yaml explodia no
 * arquivo inteiro → o dashboard zerava (0/30), apagando trabalho de horas.
 *
 * Uma indentação num repo não pode cegar os outros. O parser degrada: recupera
 * o que der, descarta o bloco quebrado.
 */
const BROKEN = fs.readFileSync(path.resolve(__dirname, "fixtures/broken-foundation-state.yaml"), "utf-8");

describe("degradação — YAML malformado não zera a tela", () => {
  it("o fixture realmente não parseia como YAML (senão o teste não prova nada)", () => {
    // sanidade: confirma que estamos testando um arquivo de fato quebrado
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const yaml = require("js-yaml");
      yaml.load(BROKEN);
    }).toThrow();
  });

  it("não devolve null — o dashboard sai do 0/30", () => {
    const state = parseFoundationState(BROKEN);
    expect(state, "o parser devolveu null — o dashboard zeraria").not.toBeNull();
  });

  it("os repositórios íntegros sobrevivem; o bloco quebrado é descartado", () => {
    // O bloco malformado (acme-server-application) é o único perdido na
    // recuperação — os outros três, íntegros, aparecem. Bem melhor que zerar tudo.
    const state = parseFoundationState(BROKEN);
    expect(Object.keys(state!.repos).length).toBeGreaterThanOrEqual(3);
  });
});

describe("alias design-system → design — a fase existe no disco e a tela não achava", () => {
  // Fixture do MESMO workspace, coletada depois que o agente rodou o
  // @design-archaeologist retroativamente (kit migrado, D1 já aprovado) e
  // improvisou a chave `design-system` em vez de `design`. Sem o alias, a
  // fase fica concluída e aprovada no disco e invisível no dashboard.
  const REAL = fs.readFileSync(path.resolve(__dirname, "fixtures/design-system-alias-real.yaml"), "utf-8");

  it("o arquivo real usa a chave errada (confirma que o teste testa o caso de verdade)", () => {
    expect(REAL).toContain("design-system:");
  });

  it("phaseState('design', repo) resolve mesmo com a chave gravada como 'design-system'", () => {
    const state = parseFoundationState(REAL);
    expect(phaseState(state, "design", "acme-android")?.status).toBe("done");
  });

  it("o agente e o status ficam acessíveis pela chave canônica", () => {
    const state = parseFoundationState(REAL);
    const phase = phasesForRepo(state, "acme-android")["design"];
    expect(phase?.status).toBe("done");
  });

  it("não inventa a fase 'design-system' crua no mapa — só a canônica 'design'", () => {
    const state = parseFoundationState(REAL);
    const phases = phasesForRepo(state, "acme-android");
    expect(phases["design"]).toBeDefined();
    expect(phases["design-system"]).toBeUndefined();
  });
});

describe("degradação — casos sintéticos", () => {
  it("um repo quebrado, outro íntegro: mantém o íntegro", () => {
    const raw = `
repos:
  bom:
    phases:
      tech-stack: { status: done, human_checklist: {} }
    gate_d1: { status: approved }
  ruim:
    phases:
      arch:
        status: done
      approved_at: "x"
        artifacts:
          - foo
`;
    const state = parseFoundationState(raw);
    expect(state).not.toBeNull();
    expect(gateD1ForRepo(state, "bom")).toBe("approved");
  });

  it("YAML válido continua parseando pelo caminho normal (sem regressão)", () => {
    const raw = `
repos:
  billing:
    phases:
      tech-stack: { status: done, human_checklist: {} }
    gate_d1: { status: approved }
phases:
  domain: { status: pending, human_checklist: {} }
`;
    const state = parseFoundationState(raw);
    expect(state!.phases["domain"]!.status).toBe("pending");
    expect(gateD1ForRepo(state, "billing")).toBe("approved");
  });

  it("lixo irrecuperável ainda devolve null (não inventa estado)", () => {
    expect(parseFoundationState(":\n  :\n    [[[")).toBeNull();
  });
});
