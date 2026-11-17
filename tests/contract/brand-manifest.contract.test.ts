import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT } from "./helpers/source-scan";
import { BRAND } from "../../src/data/brand.pure";

/**
 * O manifesto bate com a marca (ADR-0013, F1.2).
 *
 * O `package.json` é estático: o VS Code lê `contributes` antes de qualquer
 * código rodar, então ele não pode ler o `brand.json`. Em vez de gerar o
 * manifesto por template, este teste confere que todo id, chave e nome de
 * marca contribuído é o que o `brand.json` diz. Trocar a marca (F1.3) sem
 * trocar o manifesto junto reprova aqui.
 */

interface PackageJson {
  name: string;
  displayName: string;
  icon: string;
  homepage: string;
  repository: { url: string };
  bugs: { url: string };
  activationEvents: string[];
  scripts: Record<string, string>;
  contributes: {
    commands: Array<{ command: string; title: string; category?: string }>;
    icons: Record<string, { description: string; default: { fontPath: string; fontCharacter: string } }>;
    chatParticipants: Array<{ id: string; name: string; fullName: string }>;
    views: Record<string, Array<{ id: string; name: string }>>;
    viewsContainers: { activitybar: Array<{ id: string; title: string; icon: string }> };
    configuration: { title: string; properties: Record<string, unknown> };
  };
}

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as PackageJson;
const { contributes } = pkg;

describe("manifesto × brand.json — identidade do pacote", () => {
  it("name e displayName", () => {
    expect([pkg.name, pkg.displayName]).toEqual([BRAND.package.name, BRAND.displayName]);
  });

  it("ícone e URLs", () => {
    expect(pkg.icon).toBe(BRAND.assets.icon);
    expect([pkg.homepage, pkg.repository.url, pkg.bugs.url]).toEqual([BRAND.urls.homepage, BRAND.urls.repository, BRAND.urls.issues]);
  });

  it("o build do CLI grava o bundle no nome que o gerador copia (kit/scripts/<files.cli>, ADR-0018)", () => {
    expect(pkg.scripts["build:cli"]).toContain(`--outfile=kit/scripts/${BRAND.files.cli} `);
    expect(fs.existsSync(path.join(REPO_ROOT, "kit", "scripts", BRAND.files.cli))).toBe(true);
  });
});

describe("manifesto × brand.json — ids e chaves contribuídos", () => {
  it("ativa pelo config do workspace e pelo participante", () => {
    expect(pkg.activationEvents).toContain(`workspaceContains:${BRAND.files.config}`);
    expect(pkg.activationEvents).toContain(`onChatParticipant:${BRAND.participant.id}`);
  });

  it("todo comando tem o prefixo da marca e a marca como categoria e no título", () => {
    for (const c of contributes.commands) {
      expect(c.command.startsWith(`${BRAND.commandPrefix}.`), c.command).toBe(true);
      expect(c.category, c.command).toBe(BRAND.displayName);
      expect(c.title.startsWith(`${BRAND.displayName}: `), c.title).toBe(true);
    }
  });

  it("participante de chat: id, nome que o usuário digita e nome completo", () => {
    expect(contributes.chatParticipants.map((p) => [p.id, p.name, p.fullName])).toEqual([
      // ADR-0025 (F3.7): o participante é o guia, com nome próprio; o `participant.name` é o agente orquestrador.
      [BRAND.participant.id, BRAND.guide.name, BRAND.guide.fullName],
    ]);
  });

  it("container, view e ícone da barra de atividades", () => {
    expect(Object.keys(contributes.views)).toEqual([`${BRAND.name}-container`]);
    // G9 (F4.3): a view de boas-vindas (de árvore) vem antes da principal (webview), que só aparece em workspace da marca.
    expect(contributes.views[`${BRAND.name}-container`]?.map((v) => [v.id, v.name])).toEqual([[`${BRAND.name}.welcome`, "Começar"], [`${BRAND.name}.mainPanel`, BRAND.displayName]]);
    expect(contributes.viewsContainers.activitybar.map((c) => [c.id, c.title, c.icon])).toEqual([
      [`${BRAND.name}-container`, BRAND.displayName, BRAND.assets.activityBarIcon],
    ]);
  });

  it("ícone de fonte da marca (o $(<nome>-mark) da status bar)", () => {
    expect(Object.keys(contributes.icons)).toEqual([`${BRAND.name}-mark`]);
    expect(contributes.icons[`${BRAND.name}-mark`]?.default.fontPath).toBe(BRAND.assets.iconFont);
  });

  it("configuração: título e seção de toda chave", () => {
    expect(contributes.configuration.title).toBe(BRAND.displayName);
    for (const key of Object.keys(contributes.configuration.properties)) {
      expect(key.startsWith(`${BRAND.configSection}.`), key).toBe(true);
    }
  });
});

describe("manifesto × brand.json — Contract parcial da troca de marca (F1.3)", () => {
  /** Toda string do manifesto (valores e chaves), com o caminho JSON de onde veio. */
  function strings(value: unknown, at = "$"): Array<[string, string]> {
    if (typeof value === "string") return [[at, value]];
    if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
    if (value !== null && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [[`${at}.${k} (chave)`, k] as [string, string], ...strings(v, `${at}.${k}`)]);
    }
    return [];
  }

  /**
   * O que ainda pode citar a marca anterior, de propósito:
   * - a ativação pelos configs legados (Expand: workspace antigo abre);
   * - os arquivos de ícone, que só mudam com o kit de identidade (F1.1);
   * - `publisher`, decisão pendente do titular;
   * - `scripts`, que citam o arquivo-fonte do CLI (nome de código).
   */
  function withoutAllowed(at: string, text: string): string {
    if (at === "$.publisher" || at.startsWith("$.scripts")) return "";
    let out = text;
    for (const legacy of BRAND.legacy.configFiles) out = out.split(`workspaceContains:${legacy}`).join("");
    for (const asset of Object.values(BRAND.assets)) out = out.split(asset).join("");
    return out;
  }

  it("nenhum texto, id ou chave do manifesto cita uma marca anterior", () => {
    const legacy = [...BRAND.legacy.names, ...BRAND.legacy.displayNames];
    const hits = strings(pkg).filter(([at, text]) => {
      const rest = withoutAllowed(at, text).toLowerCase();
      return legacy.some((name) => rest.includes(name.toLowerCase()));
    });
    expect(hits).toEqual([]);
  });
});
