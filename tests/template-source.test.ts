import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { NullTemplateSource } from "../src/adapters/templates/TemplateSource";
import { WizardStateSchema } from "../src/types";
import { installNetGuard, type NetGuard } from "./characterization/helpers/net-guard";

/**
 * Registry de templates fora da v1 (F2.1, ADR-0015). Antes, toda geração
 * greenfield tentava `GET {helyx.apiUrl}/api/v1/registry/stack-templates/…`
 * (com `helyx.apiKey` como Bearer, em texto plano nas settings) e, com
 * versão, gravava o zip em `~/.helyx/templates`. A edição aberta liga a
 * `NullTemplateSource`: o scaffold é sempre local, sem rede e sem disco fora
 * do projeto. O caminho zip continua existindo atrás da porta, para uma
 * extensão companheira (coberto pelo golden do gerador).
 */

let net: NetGuard;
let sandbox: string;

beforeEach(() => {
  net = installNetGuard();
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-template-source-"));
});

afterEach(() => {
  net.restore();
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("TemplateSource — a edição aberta não fala com o registry", () => {
  it("REGRESSÃO: gerar um projeto greenfield com a configuração padrão usa o scaffold local e não abre conexão de saída", async () => {
    const target = path.join(sandbox, "projeto-ficticio");
    const state = WizardStateSchema.parse({ projectName: "projeto-ficticio", hostAdapter: "claude", backendStack: "python-api" });

    const isLocal = await new StructureGenerator().generate({ ...state, targetDirectory: target });

    expect(isLocal).toBe(true);
    expect(fs.existsSync(path.join(target, "CLAUDE.md"))).toBe(true);
    expect(net.blocked).toEqual([]);
  });

  it("NullTemplateSource não tem manifesto nem zip para nenhum template", async () => {
    const source = new NullTemplateSource();
    await expect(source.getManifest("helyx-template-python-api")).resolves.toBeNull();
    await expect(source.getZip("helyx-template-python-api", "1.0.0")).resolves.toBeNull();
    expect(net.blocked).toEqual([]);
  });
});
