import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { buildBackendReadme, getBackendDirs } from "../src/generator/content/backend";
import type { WizardState } from "../src/types";

/**
 * README do backend gerado no greenfield. Ele dizia "Python 3.12+ / FastAPI" e o mesmo
 * "pytest", "pip install" e "OpenTelemetry" para qualquer stack, citava agentes que não existem
 * (`@backend-java-spring`, `@backend-dotnet-core`) e mostrava uma árvore `src/domain` que só vale
 * para Python. Agora cada fato vem do que o gerador realmente cria: a stack, os diretórios de
 * `getBackendDirs` e os agentes do kit.
 */

const KIT_AGENTS = path.resolve(__dirname, "../kit/content/agents/downstream");

const STACKS = ["python-api", "python-agentic", "java-spring", "dotnet-core"] as const;
const ARCHITECTURES = ["hexagonal", "vertical-slice", "layered", "ddd-tactical"] as const;

function state(backendStack: (typeof STACKS)[number], backendArchitecture: (typeof ARCHITECTURES)[number] = "hexagonal"): WizardState {
  return {
    projectName: "loja-exemplo",
    hostAdapter: "claude",
    backendStack,
    backendArchitecture,
    frontendStack: "none",
    database: "postgresql",
    cloud: "none",
    cicd: "github-actions",
    deliveryMode: "full-cycle",
  } as WizardState;
}

describe("README do backend gerado: cada stack diz a verdade sobre si", () => {
  it.each(["java-spring", "dotnet-core"] as const)("%s não herda nada de Python", (stack) => {
    const readme = buildBackendReadme(state(stack));
    expect(readme).not.toMatch(/Python|FastAPI|pytest|pip install|ruff|python -m/);
  });

  it.each(["python-api", "python-agentic"] as const)("%s não herda nada de Java nem de .NET", (stack) => {
    const readme = buildBackendReadme(state(stack));
    expect(readme).toMatch(/Python 3\.12\+/);
    expect(readme).toMatch(/FastAPI/);
    expect(readme).not.toMatch(/Spring|mvn |dotnet |\.NET|JUnit/);
  });

  it("Java diz Java 21 e Spring Boot, e traz os comandos do Maven", () => {
    const readme = buildBackendReadme(state("java-spring"));
    expect(readme).toMatch(/Java 21/);
    expect(readme).toMatch(/Spring Boot/);
    expect(readme).toContain("mvn spring-boot:run");
    expect(readme).toContain("mvn test");
  });

  it(".NET diz .NET 8 e aponta o projeto de API pelo namespace certo", () => {
    const readme = buildBackendReadme(state("dotnet-core"));
    expect(readme).toMatch(/\.NET 8/);
    expect(readme).toContain("dotnet run --project src/LojaExemplo.API");
    expect(readme).toContain("dotnet test");
  });

  it("só afirma OpenTelemetry onde o scaffold o instala (.NET); Java diz Actuator; Python não afirma nada", () => {
    expect(buildBackendReadme(state("dotnet-core"))).toMatch(/OpenTelemetry/);
    expect(buildBackendReadme(state("java-spring"))).toMatch(/Actuator/);
    expect(buildBackendReadme(state("java-spring"))).not.toMatch(/OpenTelemetry/);
    expect(buildBackendReadme(state("python-api"))).not.toMatch(/OpenTelemetry/);
    expect(buildBackendReadme(state("python-agentic"))).not.toMatch(/OpenTelemetry/);
  });

  it("python-agentic diz que usa LangGraph, e python-api não", () => {
    expect(buildBackendReadme(state("python-agentic"))).toMatch(/LangGraph/);
    expect(buildBackendReadme(state("python-api"))).not.toMatch(/LangGraph/);
  });
});

describe("README do backend gerado: a estrutura é a que o gerador cria", () => {
  it.each(STACKS.flatMap((stack) => ARCHITECTURES.map((arch) => [stack, arch] as const)))(
    "%s com %s lista cada diretório de getBackendDirs",
    (stack, arch) => {
      const readme = buildBackendReadme(state(stack, arch));
      for (const dir of getBackendDirs(arch, stack)) {
        expect(readme, `faltou o diretório ${dir}`).toContain(dir);
      }
    },
  );
});

describe("README do backend gerado: só cita agentes que o kit instala", () => {
  it.each(STACKS)("%s", (stack) => {
    const readme = buildBackendReadme(state(stack));
    const cited = [...readme.matchAll(/`@(backend-[a-z-]+)`/g)].map((m) => m[1]);
    expect(cited).toHaveLength(1);
    expect(fs.existsSync(path.join(KIT_AGENTS, `${cited[0]}.agent.md`)), `o kit não tem o agente ${cited[0]}`).toBe(true);
  });
});
