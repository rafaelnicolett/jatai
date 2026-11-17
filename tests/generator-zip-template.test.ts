import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildVars, extractAndRender, renderTemplate } from "../src/generator/template/zip-template";
import { WizardStateSchema } from "../src/types";

/**
 * Renderer do template em zip (F3.4, passo 2). O golden do gerador cobre o
 * caminho inteiro (`greenfield-zip-*`); aqui ficam os filtros e o corte do
 * `.tmpl`, função a função.
 */

const vars = buildVars(WizardStateSchema.parse({ projectName: "painel-de-pedidos", hostAdapter: "claude", backendStack: "python-api" }));

describe("renderTemplate — variáveis e filtros do template em zip", () => {
  it("troca a variável pelo valor do Wizard e aplica snake, kebab e pascal", () => {
    expect(renderTemplate("{{project_name}}", vars)).toBe("painel-de-pedidos");
    expect(renderTemplate("{{project_name|snake}}", vars)).toBe("painel_de_pedidos");
    expect(renderTemplate("{{svc_name_snake|kebab}}", vars)).toBe("painel-de-pedidos");
    expect(renderTemplate("{{project_name|pascal}}", vars)).toBe("PainelDePedidos");
    expect(renderTemplate("py {{python_version}}", vars)).toBe("py 3.12");
  });

  it("variável desconhecida vira vazio; filtro desconhecido devolve o valor cru; espaço dentro das chaves não casa", () => {
    expect(renderTemplate("[{{message}}]", vars)).toBe("[]");
    expect(renderTemplate("[{{project_name|upper}}]", vars)).toBe("[painel-de-pedidos]");
    expect(renderTemplate("[{{ project_name }}]", vars)).toBe("[{{ project_name }}]");
  });
});

describe("extractAndRender — entradas do zip", () => {
  it("pula pastas, renderiza o conteúdo e tira o sufixo .tmpl do nome", async () => {
    const zip = new JSZip();
    zip.folder("src");
    zip.file("src/app.py.tmpl", "app = '{{svc_name_snake}}'\n");
    zip.file("README.md", "# {{project_name|pascal}}\n");
    const files = await extractAndRender(await zip.generateAsync({ type: "nodebuffer" }), vars);
    expect(files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))).toEqual([
      { relativePath: "README.md", content: "# PainelDePedidos\n" },
      { relativePath: "src/app.py", content: "app = 'painel_de_pedidos'\n" },
    ]);
  });
});
