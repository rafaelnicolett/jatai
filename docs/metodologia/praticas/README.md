# Práticas de mudança segura

Mudar código que já roda em produção tem uma regra: **nunca em bloco, sempre em
passos que valem por si e que têm volta**. As práticas desta pasta são o que a
Jataí usa para cumprir essa regra. Os agentes as aplicam, e você as reconhece nos
roadmaps, nos PRs e nos relatórios.

| Prática | Para que serve | Quem aplica |
|---|---|---|
| [Strangler](strangler.md) | trocar um módulo ou um sistema aos poucos, sem parar | `@modernization-planner` escolhe, `@migration-agent` e `@refactor-agent` executam |
| [Expand-Contract](expand-contract.md) | mudar um esquema de dados, uma API ou uma biblioteca com volta em cada passo | `@migration-agent` |
| [Parallel Run](parallel-run.md) | trocar uma regra crítica comparando o novo com o antigo | `@migration-agent`, com o golden master |
| [BDD](bdd.md) | combinar o comportamento em cenários antes de escrever o código | `@feature-adder` |
| [Testes de caracterização](testes-de-caracterizacao.md) | fixar o comportamento de hoje antes de mexer | `@test-backfill-agent` |
| [Golden master](golden-master.md) | fixar uma saída grande ou complexa, byte a byte | `@test-backfill-agent` |

## Como escolher

| Situação | Prática |
|---|---|
| Substituir um módulo inteiro | Strangler |
| Mudar o esquema de um banco ou o contrato de uma API | Expand-Contract |
| Subir a versão major de um framework | Expand-Contract, com abstração em volta do ponto de troca |
| Mudar uma regra de cálculo que custa caro se errar | Parallel Run |
| Tocar em código sem teste | testes de caracterização primeiro, sempre |
| Mexer numa saída grande, como um gerador ou um relatório | golden master |
| Entregar uma feature nova | BDD antes do código |

O kit conhece mais dois padrões que aparecem nos roadmaps. **Branch by Abstraction**
troca uma implementação atrás de uma interface, com uma chave para voltar.
**Anti-Corruption Layer** é uma camada tradutora que impede um contexto novo de
importar o modelo sujo do legado. As skills `legacy-modernization-patterns` e
`version-migration-playbook` descrevem os dois, e estão no
[catálogo de skills](../../agentes/skills.md).

## O que todas têm em comum

1. **O teste vem antes.** Sem teste que fixe o comportamento de hoje, nenhuma delas
   é segura. A rede de segurança é o primeiro passo de qualquer onda.
2. **Cada passo vale por si.** Ele é publicável sozinho, passa na suíte e pode ser
   desfeito sem levar outra coisa junto.
3. **Existe um plano de volta**, escrito antes de o passo começar.
4. **Refactor, correção e feature nunca no mesmo PR.** Misturar esconde mudança de
   comportamento dentro de uma mudança que deveria ser só de estrutura.

## Os anti-padrões

- Reescrever do zero ("rewrite"): quase sempre falha e deixa o produto parado.
- Migrar em bloco, numa única entrega.
- Manter uma branch longa, de mais de uma sprint, para esconder um passo grande.
- Migrar sem teste, ou sem plano de volta.

A própria Jataí foi feita assim. O repositório aberto nasceu de um snapshot do
produto anterior por Strangler, a troca de nome seguiu Expand-Contract, e um golden
master comparou os dois nos passos de refactor. As decisões estão em
[decisões de arquitetura](../../decisoes/README.md).
