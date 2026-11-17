# Parallel Run

No **Parallel Run**, a versão nova roda ao lado da antiga, com a mesma entrada, e
você compara as saídas. Enquanto elas divergirem, a antiga é a que vale. Quando a
convergência é suficiente, você faz o corte.

## Quando usar

Quando errar custa caro e um teste isolado não basta para confiar: cálculo de
tarifa, cobrança, regra de risco ou de crédito, um relatório que outras áreas usam.

## Os passos

1. **Rode as duas versões** com a mesma entrada. A antiga continua sendo a que
   responde ao mundo.
2. **Compare as saídas**, campo a campo.
3. **Registre cada divergência**, com a entrada que a causou.
4. **Corrija o novo** (ou descubra que o velho estava errado, e decida o que fazer).
5. **Corte** quando a convergência passar do limite combinado, por um período
   combinado. Por exemplo, 99,9% durante N dias.

A volta é total enquanto os dois rodam.

## Como a Jataí aplica

- O `@migration-agent` e o `@modernization-planner` indicam o Parallel Run no
  roadmap para lógica crítica, com o critério de corte.
- A comparação pode ser feita com [golden master](golden-master.md): a saída da
  versão antiga vira o esperado, e a nova é conferida contra ele.

A Jataí usou o Parallel Run para garantir que o núcleo da metodologia não mudou
durante a reestruturação do repositório. Um golden master da árvore gerada (nas
quatro combinações de projeto novo ou existente com Claude Code ou Copilot) e das
respostas do CLI foi comparado contra o produto anterior, e a única diferença
permitida era a marca
([ADR-0012](../../decisoes/0012-repositorio-isolado-jatai-strangler-parallel-run.md)).

## Como saber que deu certo

- Existe um critério de corte numérico, escrito antes de o paralelo começar.
- Toda divergência está registrada e explicada.
- O corte aconteceu só depois de a convergência se manter pelo período combinado.
- Depois do corte, a versão antiga saiu: o paralelo não fica ligado para sempre.

## Armadilhas

- **Fontes de não determinismo**: horário, identificadores e ordem de coleções fazem
  duas execuções corretas divergirem. Normalize antes de comparar: relógio
  injetado, gerador de id determinístico, ordenação.
- **Efeito colateral duplicado**: se as duas versões gravam ou enviam algo, o mundo
  recebe duas vezes. A versão nova roda "em sombra", sem efeito.
- **Sem fim**: um paralelo sem data de corte vira custo permanente.
