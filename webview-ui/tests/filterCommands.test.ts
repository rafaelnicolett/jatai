import { describe, it, expect } from "vitest";
import { LayoutGrid } from "lucide-react";
import type { DeckCommand } from "../src/features/command-deck/commandCatalog";
import { filterCommands } from "../src/apps/cockpit/shell/CommandDeck/filterCommands";

const commands: DeckCommand[] = [
  { id: "nav-mural", label: "Ir para Mural", icon: LayoutGrid, group: "Navegar" },
  { id: "shortcut-sync-repos", label: "Sincronizar repositórios", hint: "Materializa repos.yaml", icon: LayoutGrid, group: "Ações" },
  { id: "lens-mod-x", label: "Trocar para Modernização X", icon: LayoutGrid, group: "Iniciativas" },
];

describe("filterCommands", () => {
  it("query vazia devolve tudo, na mesma ordem", () => {
    expect(filterCommands(commands, "")).toEqual(commands);
  });

  it("filtra por substring do label, case-insensitive", () => {
    expect(filterCommands(commands, "MURAL")).toEqual([commands[0]]);
  });

  it("filtra por substring do hint também", () => {
    expect(filterCommands(commands, "repos.yaml")).toEqual([commands[1]]);
  });

  it("filtra por nome do grupo", () => {
    expect(filterCommands(commands, "iniciativas")).toEqual([commands[2]]);
  });

  it("sem match nenhum: lista vazia", () => {
    expect(filterCommands(commands, "xyz-nao-existe")).toEqual([]);
  });

  it("espaços nas pontas não afetam o match", () => {
    expect(filterCommands(commands, "  mural  ")).toEqual([commands[0]]);
  });
});
