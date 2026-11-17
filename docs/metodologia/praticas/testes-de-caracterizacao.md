# Testes de caracterização

Um **teste de caracterização** fixa o que o sistema faz **hoje**, mesmo que esteja
errado. A ideia é de Michael Feathers: você não precisa entender o código para
testá-lo, precisa observar o que ele faz. Quando o teste quebrar depois de uma
mudança, você sabe exatamente o que mudou.

## Quando usar

Antes de qualquer refactor ou migração em código sem cobertura. É a regra de ouro
da Execução: **teste de caracterização antes de refactor.** Sem ele, ninguém sabe
se uma mudança de estrutura mudou o comportamento sem querer.

## Os passos

1. **Escolha o alvo.** O arquivo que vai mudar, ou o ponto quente da Descoberta (o
   que muda muito e é complexo).
2. **Mapeie o que dá para observar**: o que as funções públicas devolvem e o que
   elas fazem de fora (banco, HTTP, arquivos, logs).
3. **Escolha a técnica.** Para um retorno, um teste que afirma o valor atual. Para
   uma saída grande, um [golden master](golden-master.md). Para uma interface, um
   snapshot.
4. **Capture o comportamento de hoje** e afirme exatamente isso, mesmo que pareça
   estranho. Comente quando o comportamento foi fixado: "mudar este teste exige
   conferir se a mudança é intencional".
5. **Rode várias vezes.** Se oscilar, há um não determinismo para neutralizar.
6. **Faça o commit antes de qualquer linha de refactor.**

## Bug conhecido

Se o teste fixa algo claramente errado, **não corrija agora**. Fixe e marque. Na
Jataí, o nome do teste começa com `@known-bug:`. O bug vira especificação
documentada, e o PR de correção, depois, inverte o teste: o `@known-bug` sai, o teste
passa a exigir o comportamento certo (a regressão), e a correção entra no mesmo
PR. Corrigir "de passagem", dentro do refactor, mistura duas mudanças.

## Como a Jataí aplica

O `@test-backfill-agent` faz isto antes de qualquer `@refactor-agent` ou
`@migration-agent`, e escreve um relatório com o alvo, a cobertura antes e depois,
os comportamentos fixados e os bugs conhecidos. A skill `characterization-testing`
guarda o protocolo.

No [workspace demo](../../../demo/README.md), o hotfix `hotfix-prazo-de-devolucao`
começa assim: a onda de Diagnóstico reproduz o prazo errado e o fixa com um teste,
e só na onda seguinte vem a correção, com o teste de regressão.

## Como saber que deu certo

- A cobertura do escopo chegou a pelo menos 70% (ou a 100% dos caminhos críticos).
- Os testes passam cinco vezes seguidas, sem oscilar.
- Os bugs conhecidos estão marcados, não escondidos.
- A suíte roda em menos de um minuto, para dar retorno rápido durante o refactor.
- Tudo foi commitado antes do refactor.

## Neutralizar o não determinismo

| Fonte | O que fazer |
|---|---|
| Horário | injete o relógio |
| Identificadores | injete um gerador determinístico |
| Ordem de coleções | ordene antes de comparar |
| Datas locais | fixe o fuso no teste |
| Chamadas externas | use um dublê ou uma gravação |
| Concorrência | rode numa linha só, ou compare um conjunto ordenado |

## Armadilhas

- **Refatorar primeiro e testar depois** ("vou ver se quebra").
- **Testar a implementação** em vez do comportamento: o teste quebra no refactor.
- **Caracterizar 5% e refatorar mesmo assim.**
- **Apagar o bug do esperado** porque "agora está certo": a correção vai num PR
  separado.
