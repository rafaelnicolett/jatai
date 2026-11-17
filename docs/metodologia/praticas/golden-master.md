# Golden master

O **golden master** é a técnica de [caracterização](testes-de-caracterizacao.md)
para saídas grandes ou complexas, difíceis de afirmar campo a campo: um gerador, um
relatório, uma resposta de API, um compilador. Você roda o sistema com uma entrada,
guarda a saída como "esperado" e, daqui para frente, o teste compara a saída nova
com ela. Qualquer diferença reprova, e uma pessoa decide se a diferença é
intencional.

## Quando usar

- antes de refatorar algo que produz uma saída grande;
- para provar que um refactor **não mudou nada**: o golden fica igual do começo ao
  fim;
- como a comparação de um [Parallel Run](parallel-run.md): a saída da versão antiga
  é o esperado, e a nova é conferida contra ele.

## Os passos

1. **Escolha uma entrada determinística** e o ponto onde observar a saída.
2. **Neutralize o que muda a cada execução**: horário, identificadores, caminhos da
   máquina, ordem. A saída precisa ser igual quando o comportamento é igual.
3. **Rode e grave** a saída como esperado, em arquivo, no repositório. Ela é lida
   por gente, então prefira texto.
4. **Rode três vezes** para confirmar que ninguém oscila.
5. **Faça o commit** do esperado antes do refactor.
6. **Compare a cada mudança.** Se falhar, pergunte primeiro: **eu queria mudar
   isso?**
   - Não queria: o golden está certo, e o código mudou demais. Volte e ajuste.
   - Queria: atualize o esperado, e **revise o diff palavra a palavra** no PR.

## Como a Jataí usa

O repositório da Jataí congela, byte a byte, o que ela instala no workspace de
quem usa (o gerador, nas duas edições do kit e nos dois hosts) e o que o CLI de
estado responde e grava. É a prova mecânica de que o núcleo da metodologia não
mudou sem ninguém ver. As regras da casa:

- um **PR de refactor nunca altera o golden**. Se o golden mudou, não era refactor;
- só se regrava o golden quando a mudança de comportamento é a intenção do PR, com o
  comando de regravação rodando só na sua máquina (ele recusa rodar no CI);
- o PR explica cada arquivo que mudou no diff do golden;
- o que muda a cada execução (horário, pasta temporária, versão do kit) é
  normalizado por regras numeradas, e nada além disso é tolerado.

O [guia de contribuição](../../../CONTRIBUTING.md) tem o passo a passo de regravar e conferir.

## Como saber que deu certo

- A saída é estável: três execuções seguidas dão os mesmos bytes.
- O esperado está no repositório, e o diff dele é legível em revisão.
- Toda mudança do esperado tem um PR e uma explicação.

## Armadilhas

- **Esperado que ninguém lê.** Aprovar o diff de um golden sem olhá-lo é o mesmo
  que não ter teste ("commit and pray").
- **Normalizar demais.** Cada regra de normalização esconde uma diferença: mantenha
  a lista curta e justificada.
- **Regravar para "fazer passar".** Regrave só quando a mudança é a intenção.
- **Golden gigante para tudo.** Use-o onde a saída é complexa. Para um valor
  simples, um teste de caracterização comum basta.
