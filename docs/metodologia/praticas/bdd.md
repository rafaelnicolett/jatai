# BDD: o comportamento primeiro

No **BDD** (desenvolvimento guiado por comportamento), a conversa vem antes do
código. Você e o agente combinam o que a feature faz em **cenários** escritos na
linguagem do negócio, e só depois o agente implementa. O cenário é ao mesmo tempo a
especificação, o critério de aceite e o teste.

## Quando usar

Em toda feature nova. É a regra da Execução: **BDD primeiro, depois a
implementação.** Cenário ruim duplica teste e mente sobre a cobertura. Cenário bom
é executável, expressa a intenção na linguagem do domínio e sobrevive a um refactor.

## Como é um cenário

Os cenários ficam em arquivos `.feature`, em Gherkin. O kit escreve em português:

```gherkin
# language: pt
@epic:epic-2
Funcionalidade: Fila de espera por ordem de pedido
  Como sócio da biblioteca
  Quero ver minha posição na fila de um livro
  Para saber quando vou poder pegá-lo

  Cenário: A fila anda por ordem de pedido
    Dado dois sócios que reservaram o mesmo livro, um depois do outro
    Quando o livro é devolvido
    Então o primeiro a reservar é o próximo da fila
```

O exemplo é do [workspace demo](../../../demo/README.md).

## As regras de escrita

- **Declarativo, não imperativo.** "O sócio reserva o livro", e não "o sócio clica
  no campo e digita". Tela, HTTP e SQL ficam nos passos, nunca no `.feature`.
- **Linguagem do domínio.** Se aparecer "DTO", "endpoint" ou "tabela" no cenário,
  está errado.
- **Um cenário, um comportamento.** Se o título tem "e", são dois cenários.
- **Dados como exemplos.** Variações de dados usam *Esquema do Cenário*, com uma
  tabela de exemplos.
- **Background com moderação.** Só o estado que vale para todos os cenários.
- **Tags** para filtrar: a que liga o cenário ao épico (`@epic:epic-2`), e as de
  contexto, persona, release e risco (`@bc:`, `@persona:`, `@release:`, `@risk:`).

## Como a Jataí aplica

- O `@feature-adder` roda a **lista leve de features** antes de implementar, quando
  a iniciativa usa épicos: de três a oito features curtas por épico, de um a dois
  cenários cada, com a tag do épico. Um épico pequeno pula esse passo.
- Os passos, a parte que liga o cenário ao código, vivem na stack do repositório, e
  cada frase de cenário tem um passo só.
- A skill `bdd-gherkin` guarda o padrão completo, com os formatos e as tags.

A própria Jataí escreve assim. As features novas começam por um commit só com os
cenários em `tests/features/`, e o comportamento só entra no commit seguinte. No
repositório dela, um cenário sem passo reprova a suíte: não existe cenário
decorativo.

## Como saber que deu certo

- Os cenários foram escritos e aceitos antes de o primeiro arquivo de código.
- Cada cenário tem passo e passa.
- Alguém do negócio consegue ler o cenário e dizer "é isso que eu quero".

## Armadilhas

- **Cenário que descreve a tela**, e quebra a cada mudança de layout.
- **Cenário que repete um teste unitário**: use o teste unitário.
- **Validar regra de negócio por teste de ponta a ponta.** Regra de negócio se
  valida com teste unitário e BDD; o de ponta a ponta fica para o fluxo principal.
- **Escrever o cenário depois do código**, só para "ter BDD".
