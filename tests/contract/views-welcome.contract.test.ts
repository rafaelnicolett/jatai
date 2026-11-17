import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, callsEndingWith, listSourceFiles } from "./helpers/source-scan";
import { BRAND } from "../../src/data/brand.pure";

/**
 * Contrato do convite de primeiro uso (G9, F4.3): `contributes.viewsWelcome`.
 *
 * O VS Code só desenha o conteúdo de boas-vindas em view de ÁRVORE vazia
 * (documentação oficial dos pontos de contribuição: "Welcome content only
 * applies to empty tree views"). A view principal da marca é um webview, então
 * o convite mora numa view de árvore sem itens, no mesmo container, que só
 * aparece fora de workspace da marca. Estes testes travam isso, as ações dos
 * links e a key de que as cláusulas `when` dependem.
 */

interface View {
  id: string;
  name: string;
  type?: string;
  when?: string;
}
interface Welcome {
  view: string;
  contents: string;
  when?: string;
}
interface PackageJson {
  contributes: {
    commands: Array<{ command: string }>;
    views: Record<string, View[]>;
    viewsWelcome?: Welcome[];
  };
}

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as PackageJson;
const views = Object.values(pkg.contributes.views).flat();
const welcomes = pkg.contributes.viewsWelcome ?? [];
const KEY = `${BRAND.name}.isWorkspace`;

/** Avalia as cláusulas `when` que o manifesto usa (`==`, `>`, `!`, `&&`); o resto reprova. */
function evaluate(when: string | undefined, context: Record<string, boolean | number>): boolean {
  if (when === undefined) return true;
  return when.split("&&").every((raw) => {
    const term = raw.trim();
    const compare = term.match(/^([\w.]+)\s*(==|>)\s*(\d+)$/);
    if (compare) {
      const value = Number(context[compare[1]!] ?? 0);
      return compare[2] === "==" ? value === Number(compare[3]) : value > Number(compare[3]);
    }
    const key = term.replace(/^!/, "");
    if (!/^[\w.]+$/.test(key)) throw new Error(`cláusula fora do que o contrato sabe avaliar: ${term}`);
    return term.startsWith("!") ? !context[key] : Boolean(context[key]);
  });
}

describe("contrato — viewsWelcome (G9)", () => {
  it("todo conteúdo de boas-vindas aponta para uma view de ÁRVORE (sem type: webview), e a view existe", () => {
    expect(welcomes.length).toBeGreaterThan(0);
    for (const welcome of welcomes) {
      const target = views.find((v) => v.id === welcome.view);
      expect(target, `a view ${welcome.view} não existe em contributes.views`).toBeDefined();
      expect(target!.type, `a view ${welcome.view} é ${target!.type}: o VS Code só desenha viewsWelcome em view de árvore`).toBeUndefined();
    }
  });

  it("a view principal (webview) não recebe viewsWelcome", () => {
    expect(welcomes.filter((w) => views.find((v) => v.id === w.view)?.type === "webview")).toEqual([]);
  });

  it("cada link de ação é um comando declarado pela marca ou um comando do próprio VS Code, e vem sozinho na linha (vira botão)", () => {
    const declared = new Set(pkg.contributes.commands.map((c) => c.command));
    const builtin = new Set(["workbench.action.files.openFolder"]);
    for (const welcome of welcomes) {
      for (const line of welcome.contents.split("\n")) {
        const links = [...line.matchAll(/\[([^\]]+)\]\(command:([^)]+)\)/g)];
        if (links.length === 0) continue;
        expect(links.length, `mais de um link na mesma linha: ${line}`).toBe(1);
        expect(line.trim()).toBe(links[0]![0]);
        const command = links[0]![2]!;
        expect(declared.has(command) || builtin.has(command), command).toBe(true);
      }
    }
  });

  it("as ações pedidas: 'Começar com a Jataí' numa pasta que não é da marca; 'Abrir uma pasta' e 'Criar um projeto novo' sem pasta", () => {
    const text = (when: string): string => welcomes.find((w) => w.when === when)!.contents;
    expect(text("workspaceFolderCount > 0 && !jatai.isWorkspace")).toContain(`[Começar com a ${BRAND.displayName}](command:${BRAND.commandPrefix}.initializeDeliveryKit)`);
    const noFolder = text("workspaceFolderCount == 0");
    expect(noFolder).toContain("[Abrir uma pasta](command:workbench.action.files.openFolder)");
    expect(noFolder).toContain(`[Criar um projeto novo](command:${BRAND.commandPrefix}.initializeDeliveryKit)`);
  });

  it("a key dos `when` é a que o startup liga (setContext na ativação, pela porta de context keys)", () => {
    const used = new Set<string>();
    for (const clause of [...views.map((v) => v.when), ...welcomes.map((w) => w.when)]) {
      for (const key of (clause ?? "").match(/[\w]+\.[\w.]+/g) ?? []) used.add(key);
    }
    expect([...used]).toEqual([KEY]);
    const source = fs.readFileSync(path.join(REPO_ROOT, "src/extension/startup/workspaceContext.ts"), "utf-8");
    expect(source).toContain("IS_WORKSPACE_KEY = `${BRAND.name}.isWorkspace`");
    const setters = listSourceFiles("src").flatMap((file) => callsEndingWith(file, "executeCommand").filter((c) => c.value.args[0] === "setContext"));
    expect(setters.length).toBeGreaterThan(0);
  });

  it("para cada situação da pessoa, aparece exatamente um conteúdo de convite certo e a view certa", () => {
    const show = (workspaceFolderCount: number, isWorkspace: boolean): { welcome: string[]; viewsVisible: string[] } => {
      const context = { workspaceFolderCount, [KEY]: isWorkspace };
      return {
        welcome: welcomes.filter((w) => evaluate(w.when, context)).map((w) => w.contents.split("\n")[0]!),
        viewsVisible: views.filter((v) => evaluate(v.when, context)).map((v) => v.id),
      };
    };
    // sem pasta aberta
    expect(show(0, false)).toEqual({ welcome: [`A ${BRAND.displayName} trabalha com uma pasta por vez.`], viewsVisible: [`${BRAND.name}.welcome`] });
    // pasta que não é da marca
    expect(show(1, false)).toEqual({ welcome: [`Esta pasta ainda não é um workspace da ${BRAND.displayName}.`], viewsVisible: [`${BRAND.name}.welcome`] });
    // mais de uma pasta, nenhuma da marca: o convite e o aviso da v1
    expect(show(2, false).welcome).toHaveLength(2);
    expect(show(2, false).welcome[1]).toContain("mais de uma pasta");
    // workspace da marca: nenhum convite, e a view principal assume
    expect(show(1, true)).toEqual({ welcome: [], viewsVisible: [`${BRAND.name}.mainPanel`] });
  });
});
