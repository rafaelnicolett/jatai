# Expand-Contract

O **Expand-Contract** muda uma coisa que tem consumidores, como uma tabela, uma
API ou uma biblioteca, em duas fases: primeiro o novo passa a existir ao lado do
velho (**expandir**), depois o velho é removido quando ninguém mais o usa
(**contrair**). No meio, os consumidores migram um a um.

## Quando usar

Sempre que uma mudança não pode ser feita de uma vez só:

- renomear ou trocar o tipo de uma coluna, ou dividir uma tabela em duas;
- mudar o contrato de uma API que outros repositórios consomem;
- subir a versão de um framework, de uma biblioteca ou de uma linguagem;
- trocar uma dependência por outra.

## Os passos

1. **Expandir.** Acrescente o esquema novo, compatível com o velho: uma coluna nova,
   uma tabela nova, uma dependência nova ao lado da antiga. Nada que já existe é
   alterado, e nenhuma leitura depende do novo ainda.
2. **Migrar.** Escreva nos dois lugares (dual-write) e leve os consumidores, um por
   vez, para o novo. A cada consumidor migrado, a suíte fica verde e sai um commit.
3. **Trocar a leitura.** Passe a ler do novo.
4. **Contrair.** Quando não há mais uso do velho, remova-o.

A volta é fácil nos dois primeiros passos e fica mais cara depois da contração. Por
isso o último passo só acontece com o plano de volta escrito e testado.

## Como a Jataí aplica

- O `@migration-agent` segue exatamente essa sequência e escreve, em
  `.github/artifacts/execution/`, o relatório com o padrão seguido, as etapas
  concluídas e o plano de volta.
- O `@modernization-planner` marca `migration_strategy: expand-contract` numa
  iniciativa quando a feature precisa de uma migração incremental, e divide as
  ondas em expandir, feature e contrair.
- A regra de ouro: **migração e feature nunca no mesmo PR**.

No [workspace demo](../../../demo/README.md), a tarefa `task-1.2` da feature de
reservas é o passo "expandir": a tabela `reservas` nasce ao lado de `emprestimos`,
sem tocar nela, e a tarefa exige a sua aprovação antes de a feature depender dela.

A Jataí também trocou de nome assim: um passo deixou a marca atual como dado, o
seguinte trocou o nome, e a leitura do nome antigo continuou valendo por uma
versão, para os workspaces existentes abrirem sem perda
([ADR-0013](../../decisoes/0013-marca-jatai-simbolo-guarda-marca-como-dado.md)).

## Como saber que deu certo

- Em cada passo, a suíte está verde e o sistema continua no ar.
- O plano de volta existe, e alguém o testou.
- Depois da contração, não sobrou leitura nem escrita do esquema velho.

## Armadilhas

- **Pular a migração dos consumidores** e contrair cedo: alguém ainda lê o velho.
- **Dual-write sem conferir** se os dois lados batem. Compare-os, por exemplo com
  um [Parallel Run](parallel-run.md).
- **Contrair no mesmo PR** que expande. Cada fase é um PR.
- **Esquecer a leitura do formato antigo** quando outros workspaces ou ferramentas
  ainda o gravam.
