import { describe, it, expect, beforeAll } from "vitest";
import type { WizardStep } from "@shared/wizard-protocol";
import { getBrownfieldSchema, getWizardSchema } from "../../src/wizard/wizard-schema";
import {
  FIRST_SCREEN_AFTER_MODE, hostErrorText, joinPath, journeyFor, keyIntent, nextRadioIndex, reviewModel, screenIndexOfField, screenIssue, startScreen,
  type JourneyContext, type Workspace,
} from "../src/apps/wizard/journey";

/**
 * O modelo puro da jornada (F4.3): as telas de cada modo, o que impede de
 * avançar, a revisão e as regras de teclado, sem React e sem mensagens.
 */

let schema: readonly WizardStep[];
beforeAll(async () => {
  schema = await getWizardSchema();
  void (await getBrownfieldSchema());
});

const OPEN: Workspace = { folder: "/sintetico/aberta", folderCount: 1 };
const NONE: Workspace = { folder: null, folderCount: 0 };
const ctx = (workspace: Workspace): JourneyContext => ({ schema, workspace });
const screen = (mode: "greenfield" | "brownfield", id: string) => journeyFor(mode).find((s) => s.id === id)!;

describe("journeyFor", () => {
  it("o projeto novo vai de abertura, modo e harness aos passos do projeto, e termina na revisão", () => {
    expect(journeyFor("greenfield").map((s) => s.id)).toEqual(["abertura", "modo", "harness", "projeto", "dominio", "backend", "frontend", "infra", "local", "revisao"]);
  });

  it("o projeto existente troca os passos do projeto pelos da pasta, dos repositórios e da maturidade", () => {
    expect(journeyFor("brownfield").map((s) => s.id)).toEqual(["abertura", "modo", "harness", "pasta", "repositorios", "maturidade", "revisao"]);
  });

  it("os dois modos abrem do mesmo jeito, e o painel reabre depois da escolha do modo", () => {
    expect(journeyFor("greenfield").slice(0, 3)).toEqual(journeyFor("brownfield").slice(0, 3));
    expect(journeyFor("greenfield")[FIRST_SCREEN_AFTER_MODE]!.id).toBe("harness");
  });

  it("cada campo do schema que a jornada coleta existe no schema do host", () => {
    for (const screenOf of journeyFor("greenfield")) {
      for (const field of screenOf.fields) expect(schema.some((step) => step.key === field), field).toBe(true);
    }
  });
});

describe("screenIssue", () => {
  it("diz o que falta em cada tela do projeto novo, em uma frase", () => {
    const g = (id: string, values: Record<string, unknown>, ws = OPEN): string | null => screenIssue(screen("greenfield", id), values, ctx(ws));
    expect(g("harness", {})).toBe("Escolha o harness para continuar.");
    expect(g("projeto", {})).toBe("Informe o nome do projeto.");
    expect(g("projeto", { projectName: "Loja" })).toBe("O nome só aceita letras minúsculas, números e hífen.");
    expect(g("projeto", { projectName: "loja" })).toBe("Descreva o produto em uma ou duas frases.");
    expect(g("projeto", { projectName: "loja", startupIdea: "x" })).toBeNull();
    expect(g("dominio", {})).toBe("Escolha o domínio para continuar.");
    expect(g("backend", { backendStack: "python-api" })).toBe("Escolha a arquitetura do backend.");
    expect(g("backend", { backendStack: "python-api", backendArchitecture: "hexagonal" })).toBeNull();
    expect(g("frontend", {})).toBe("Escolha o frontend, ou “Somente backend”.");
    expect(g("frontend", { frontendStack: "none" })).toBeNull();
    expect(g("frontend", { frontendStack: "flutter" })).toBe("Escolha a arquitetura do frontend.");
  });

  it("o destino do projeto novo só é obrigatório sem pasta aberta (nunca a pasta pessoal em silêncio)", () => {
    expect(screenIssue(screen("greenfield", "local"), {}, ctx(NONE))).toBe("Escolha onde criar o projeto para continuar.");
    expect(screenIssue(screen("greenfield", "local"), { targetDirectory: "/x" }, ctx(NONE))).toBeNull();
    expect(screenIssue(screen("greenfield", "local"), {}, ctx(OPEN))).toBeNull();
  });

  it("a pasta do workspace do projeto existente é sempre obrigatória, mesmo com pasta aberta", () => {
    expect(screenIssue(screen("brownfield", "pasta"), {}, ctx(OPEN))).toBe("Escolha a pasta do workspace para continuar.");
    expect(screenIssue(screen("brownfield", "pasta"), { targetDirectory: "/x" }, ctx(OPEN))).toBeNull();
  });
});

describe("hostErrorText e screenIndexOfField", () => {
  it("o erro do host vira frase: o genérico do zod é traduzido e o nome do projeto usa a regra em português", () => {
    expect(hostErrorText("domain", "Invalid", {})).toBe("Valor inválido.");
    expect(hostErrorText("domain", "Required", {})).toBe("Campo obrigatório.");
    expect(hostErrorText("targetDirectory", "Pasta não está vazia", {})).toBe("Pasta não está vazia");
    expect(hostErrorText("projectName", "Invalid", { projectName: "Loja Demo" })).toBe("O nome só aceita letras minúsculas, números e hífen.");
  });

  it("acha a tela que coleta o campo recusado", () => {
    expect(screenIndexOfField(journeyFor("greenfield"), "backendArchitecture")).toBe(5);
    expect(screenIndexOfField(journeyFor("brownfield"), "targetDirectory")).toBe(3);
    expect(screenIndexOfField(journeyFor("brownfield"), "nao-existe")).toBe(-1);
  });
});

describe("startScreen", () => {
  const journey = journeyFor("greenfield");
  it("sem tela salva abre na abertura, ou depois da escolha do modo se o host já trocou de modo", () => {
    expect(startScreen(journey, {}, ctx(OPEN), undefined, false)).toBe(0);
    expect(startScreen(journey, { hostAdapter: "claude" }, ctx(OPEN), undefined, true)).toBe(FIRST_SCREEN_AFTER_MODE);
  });

  it("a tela salva vale até a primeira tela com pendência", () => {
    expect(startScreen(journey, { hostAdapter: "claude", projectName: "loja", startupIdea: "x" }, ctx(OPEN), "dominio", false)).toBe(4);
    expect(startScreen(journey, { hostAdapter: "claude" }, ctx(OPEN), "infra", false)).toBe(3);
    expect(startScreen(journey, {}, ctx(OPEN), "tela-que-nao-existe", false)).toBe(0);
  });
});

describe("reviewModel", () => {
  it("projeto novo: resume as escolhas, diz o destino e lista o que será escrito, com o agente de entrada e o MCP", () => {
    const values = { hostAdapter: "copilot", projectName: "loja", domain: "ecommerce", backendStack: "java-spring", backendArchitecture: "layered", frontendStack: "none", database: "postgresql", cloud: "aws", cicd: "github-actions" };
    const review = reviewModel("greenfield", values, OPEN);
    expect(review.destination).toEqual({ path: "/sintetico/aberta/loja", note: "Uma pasta nova dentro da pasta aberta." });
    expect(review.rows.map((r) => r.label)).toEqual(["Modo", "Harness", "Projeto", "Domínio", "Backend", "Frontend", "Banco, nuvem e pipeline"]);
    expect(review.rows.find((r) => r.label === "Frontend")!.value).toBe("Somente backend");
    const where = review.writes.map((w) => w.where).join(" | ");
    expect(where).toContain(".github/agents/");
    expect(where).toContain(".vscode/mcp.json");
    expect(where).not.toContain("settings.json");
    expect(review.wont).toContain("Enviar dados para fora do seu computador.");
  });

  it("projeto novo com o lugar escolhido: o destino é o lugar, e sem pasta e sem lugar não há destino", () => {
    expect(reviewModel("greenfield", { projectName: "loja", targetDirectory: "/sintetico/outra" }, OPEN).destination.path).toBe("/sintetico/outra");
    expect(reviewModel("greenfield", { projectName: "loja" }, NONE).destination.path).toBe("");
  });

  it("projeto existente: o workspace é a pasta, o Claude Code ganha os hooks, e os repositórios não são alterados", () => {
    const review = reviewModel("brownfield", { hostAdapter: "claude", targetDirectory: "/sintetico/ws" }, OPEN);
    expect(review.destination.path).toBe("/sintetico/ws");
    expect(review.writes.map((w) => w.where).join(" | ")).toContain(".claude/settings.json");
    expect(review.wont[0]).toBe("Alterar os repositórios que você já tem.");
    expect(review.rows.find((r) => r.label === "Frameworks de maturidade")!.value).toBe("DORA 4 Keys");
  });

  it("junta pasta e nome com o separador que a pasta já usa", () => {
    expect(joinPath("/a/b", "x")).toBe("/a/b/x");
    expect(joinPath("/a/b/", "x")).toBe("/a/b/x");
    expect(joinPath("C:\\a\\b", "x")).toBe("C:\\a\\b\\x");
  });
});

describe("teclado", () => {
  it("setas, Home e End num grupo de escolha única: dão a volta e vão às pontas", () => {
    expect(nextRadioIndex(3, 0, "ArrowDown")).toBe(1);
    expect(nextRadioIndex(3, 2, "ArrowRight")).toBe(0);
    expect(nextRadioIndex(3, 0, "ArrowUp")).toBe(2);
    expect(nextRadioIndex(3, 1, "ArrowLeft")).toBe(0);
    expect(nextRadioIndex(3, 1, "Home")).toBe(0);
    expect(nextRadioIndex(3, 1, "End")).toBe(2);
    expect(nextRadioIndex(3, 1, "a")).toBeNull();
    expect(nextRadioIndex(0, 0, "ArrowDown")).toBeNull();
  });

  it("Enter avança (campo, cartão e fora de controle), mas não toma o Enter de um botão nem a quebra de linha da área de texto; Esc volta", () => {
    expect(keyIntent({ key: "Enter", target: "text" })).toBe("next");
    expect(keyIntent({ key: "Enter", target: "radio" })).toBe("next");
    expect(keyIntent({ key: "Enter", target: "other" })).toBe("next");
    expect(keyIntent({ key: "Enter", target: "button" })).toBeNull();
    expect(keyIntent({ key: "Enter", target: "textarea" })).toBeNull();
    expect(keyIntent({ key: "Enter", target: "textarea", ctrlKey: true })).toBe("next");
    expect(keyIntent({ key: "Enter", target: "textarea", metaKey: true })).toBe("next");
    expect(keyIntent({ key: "Escape", target: "text" })).toBe("back");
    expect(keyIntent({ key: "a", target: "text" })).toBeNull();
  });
});
